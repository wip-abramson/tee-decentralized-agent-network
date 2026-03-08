const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const REGISTRY_PATH = process.env.REGISTRY_PATH || '/app/keys/registry.json';

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// --- Helpers ---

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading messages:', e.message);
  }
  return [];
}

function saveMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Registry not found, running without agent verification');
  }
  return {};
}

// --- SSE clients for live updates ---
let sseClients = [];

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(payload); return true; }
    catch { return false; }
  });
}

// --- Middleware ---
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// GET /api/messages — list all messages, optional ?agent= filter
app.get('/api/messages', (req, res) => {
  let messages = loadMessages();
  if (req.query.agent) {
    messages = messages.filter(m => m.agent === req.query.agent);
  }
  if (req.query.type) {
    messages = messages.filter(m => m.type === req.query.type);
  }
  // newest first by default
  const order = req.query.order === 'asc' ? 1 : -1;
  messages.sort((a, b) => order * (new Date(a.timestamp) - new Date(b.timestamp)));
  const limit = parseInt(req.query.limit) || 100;
  res.json(messages.slice(0, limit));
});

// POST /api/messages — post a signed message to the board
app.post('/api/messages', (req, res) => {
  const { agent, did, type, payload, signature, timestamp } = req.body;

  if (!agent || !type || !payload) {
    return res.status(400).json({ error: 'Missing required fields: agent, type, payload' });
  }

  const message = {
    id: crypto.randomUUID(),
    agent: agent,
    did: did || `did:ion:Ei${agent}2026`,
    type: type,
    payload: payload,
    signature: signature || null,
    timestamp: timestamp || new Date().toISOString(),
    verified: false
  };

  // If signature provided, attempt basic verification note
  if (signature) {
    const registry = loadRegistry();
    if (registry[agent] || registry[did]) {
      message.verified = true; // simplified — real impl would verify Ed25519 sig
    }
  }

  const messages = loadMessages();
  messages.push(message);
  saveMessages(messages);

  // Broadcast to live dashboard
  broadcastSSE('new-message', message);

  console.log(`[BOARD] ${agent} posted ${type}: ${JSON.stringify(payload).slice(0, 100)}`);
  res.status(201).json(message);
});

// GET /api/agents — list known agents and their status
app.get('/api/agents', (req, res) => {
  const registry = loadRegistry();
  const messages = loadMessages();

  // Build agent status from registry + recent messages
  const agentMap = {};

  // From registry
  for (const [key, info] of Object.entries(registry)) {
    agentMap[key] = {
      name: info.name || key,
      did: info.did || `did:ion:Ei${key}2026`,
      role: info.role || 'unknown',
      lastSeen: null,
      messageCount: 0
    };
  }

  // From messages
  for (const msg of messages) {
    if (!agentMap[msg.agent]) {
      agentMap[msg.agent] = {
        name: msg.agent,
        did: msg.did,
        role: 'unknown',
        lastSeen: null,
        messageCount: 0
      };
    }
    agentMap[msg.agent].messageCount++;
    if (!agentMap[msg.agent].lastSeen || msg.timestamp > agentMap[msg.agent].lastSeen) {
      agentMap[msg.agent].lastSeen = msg.timestamp;
    }
  }

  res.json(Object.values(agentMap));
});

// GET /api/chain/:messageId — get provenance chain for a message
app.get('/api/chain/:messageId', (req, res) => {
  const messages = loadMessages();
  const target = messages.find(m => m.id === req.params.messageId);
  if (!target) return res.status(404).json({ error: 'Message not found' });

  // Walk the chain: find messages that reference this one or share the case
  const chain = [];
  const caseId = target.payload?.caseId || target.payload?.referralId;

  if (caseId) {
    for (const msg of messages) {
      const msgCase = msg.payload?.caseId || msg.payload?.referralId;
      if (msgCase === caseId) {
        chain.push(msg);
      }
    }
  } else {
    chain.push(target);
  }

  chain.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json({ messageId: req.params.messageId, chain });
});

// GET /api/stats — summary stats
app.get('/api/stats', (req, res) => {
  const messages = loadMessages();
  const agents = new Set(messages.map(m => m.agent));
  const types = {};
  let verified = 0;

  for (const msg of messages) {
    types[msg.type] = (types[msg.type] || 0) + 1;
    if (msg.verified) verified++;
  }

  res.json({
    totalMessages: messages.length,
    activeAgents: agents.size,
    verifiedMessages: verified,
    messageTypes: types,
    agents: [...agents]
  });
});

// SSE endpoint for live updates
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('event: connected\ndata: {"status":"ok"}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Start ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏥 Trustchain Healthcare Dashboard`);
  console.log(`   Board API: http://0.0.0.0:${PORT}/api/messages`);
  console.log(`   Dashboard: http://0.0.0.0:${PORT}`);
  console.log(`   Live feed: http://0.0.0.0:${PORT}/api/stream\n`);
});
