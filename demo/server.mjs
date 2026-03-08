#!/usr/bin/env node
// Demo visualization server — runs the multi-agent scenario with live SSE output
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent } from './agent.mjs';
import { Network } from './network.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3457;

let demoLogs = [];
let sseClients = [];
let demoRunning = false;

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(res => res.write(data));
}

async function runDemo() {
  if (demoRunning) return;
  demoRunning = true;
  demoLogs = [];

  const net = new Network();
  net.onLogCallback = (entry) => {
    demoLogs.push(entry);
    broadcast(entry);
  };

  function phase(name, description) {
    const entry = { time: Date.now(), type: 'phase', name, description };
    demoLogs.push(entry);
    broadcast(entry);
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Phase 1
  phase('1', 'Agent Identity Creation');
  await delay(500);

  const root = await new Agent('Root Authority', 'Trust Root — NHS Digital', '🏛️').init('mutinynet');
  const triage = await new Agent('Triage Agent', 'Hospital A — Emergency Triage', '🏥').init('mutinynet');
  const referral = await new Agent('Referral Agent', 'Hospital B — Neurology Intake', '📋').init('mutinynet');

  net.register(root);
  net.register(triage);
  net.register(referral);

  // Broadcast agent info
  for (const agent of [root, triage, referral]) {
    broadcast({ time: Date.now(), type: 'agent', name: agent.name, did: agent.did, role: agent.role, emoji: agent.emoji });
  }

  await delay(1000);

  // Phase 2
  phase('2', 'Root Authority authenticates agents (DID Auth)');
  await delay(500);

  root.think('I need to authenticate the Triage Agent before issuing credentials.');
  const triageChallenge = root.createChallenge();
  root.pendingChallenges.set(triageChallenge.nonce, { did: triage.did, timestamp: Date.now() });
  root.send(triage.did, triageChallenge);
  await net.run();
  await delay(800);

  root.think('Now authenticating the Referral Agent.');
  const referralChallenge = root.createChallenge();
  root.pendingChallenges.set(referralChallenge.nonce, { did: referral.did, timestamp: Date.now() });
  root.send(referral.did, referralChallenge);
  await net.run();
  await delay(800);

  // Phase 3
  phase('3', 'Root Authority issues Verifiable Credentials');
  await delay(500);

  const triageVC = root.issueCredential(triage.did, 'AgentAuthorization', {
    role: 'triage', facility: 'Hospital A — Community Health',
    permissions: ['assess-patient', 'set-priority', 'request-referral'],
    department: 'Emergency', authorizedBy: 'NHS Digital Trust Authority'
  });
  root.send(triage.did, triageVC);
  await net.run();
  await delay(600);

  const referralVC = root.issueCredential(referral.did, 'AgentAuthorization', {
    role: 'referral-intake', facility: 'Hospital B — Metro General',
    permissions: ['accept-referral', 'assign-bed', 'confirm-admission'],
    department: 'Neurology ICU', authorizedBy: 'NHS Digital Trust Authority'
  });
  root.send(referral.did, referralVC);
  await net.run();
  await delay(800);

  // Phase 4
  phase('4', 'Triage Agent contacts Referral Agent (first contact)');
  await delay(500);

  triage.think('Patient needs urgent neurology referral. Contacting Referral Agent at Hospital B.');
  triage.think('I don\'t know this agent yet. Initiating mutual DID Auth.');
  const t2rChallenge = triage.createChallenge();
  triage.pendingChallenges.set(t2rChallenge.nonce, { did: referral.did, timestamp: Date.now() });
  triage.send(referral.did, t2rChallenge);
  await net.run();
  await delay(800);

  // Phase 5
  phase('5', 'Mutual credential presentation and verification');
  await delay(500);

  referral.think('Before accepting a referral, I need to verify Triage Agent\'s authorization.');
  referral.requestPresentation(triage.did, 'AgentAuthorization');
  await net.run();
  await delay(600);

  triage.think('I should verify Referral Agent\'s authority to accept patients too.');
  triage.requestPresentation(referral.did, 'AgentAuthorization');
  await net.run();
  await delay(800);

  // Phase 6
  phase('6', 'Trusted healthcare message exchange');
  await delay(500);

  triage.think('Both agents authenticated and authorized. Sending patient referral.');
  triage.sendSignedMessage(referral.did, {
    type: 'ReferralRequest',
    caseId: 'CASE-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
    patient: 'Jane Doe (anonymized)', priority: 'RED — Immediate',
    condition: 'Suspected stroke, left-side weakness, onset <2hrs',
    vitals: { bp: '185/110', hr: 92, spo2: 96 },
    requestedDepartment: 'Neurology ICU',
    triageAssessment: 'Urgent neurology consult + CT angiography required'
  });
  await net.run();
  await delay(800);

  referral.think('Referral verified from authorized triage agent. Processing admission.');
  referral.sendSignedMessage(triage.did, {
    type: 'ReferralAccepted', caseId: 'CASE-ACCEPTED',
    assignedBed: 'NICU-7', estimatedArrival: '15 minutes',
    acceptedBy: 'Referral Agent — Hospital B Neurology',
    note: 'Full provenance chain verified. Patient accepted for immediate admission.'
  });
  await net.run();
  await delay(800);

  // Phase 7: Rogue
  phase('7', 'Rogue agent attempts unauthorized access');
  await delay(500);

  const rogue = await new Agent('Rogue Agent', 'Unauthorized — No credentials', '🦹').init('mutinynet');
  net.register(rogue);
  broadcast({ time: Date.now(), type: 'agent', name: rogue.name, did: rogue.did, role: rogue.role, emoji: rogue.emoji, rogue: true });

  rogue.think('I\'m going to try to send a referral without authenticating...');
  rogue.sendSignedMessage(referral.did, {
    type: 'ReferralRequest', caseId: 'FAKE-001',
    patient: 'Phantom Patient', priority: 'RED', condition: 'Fabricated emergency'
  });
  await net.run();
  await delay(600);

  rogue.think('Fine, I\'ll authenticate first...');
  const rogueChallenge = rogue.createChallenge();
  rogue.pendingChallenges.set(rogueChallenge.nonce, { did: referral.did, timestamp: Date.now() });
  rogue.send(referral.did, rogueChallenge);
  await net.run();
  await delay(600);

  referral.requestPresentation(rogue.did, 'AgentAuthorization');
  await net.run();
  await delay(400);

  referral.think('Rogue agent has 0 valid credentials from our trust root. REJECTED.');
  await delay(500);

  // Phase 8: Replay Attack
  phase('8', 'Replay attack detection — nonce reuse blocked');
  await delay(500);

  rogue.think('What if I replay a captured auth response? Trying nonce reuse...');
  await delay(400);

  // Simulate replay: rogue sends an auth response with an already-consumed nonce
  const consumedNonce = [...root.usedNonces][0];
  if (consumedNonce) {
    rogue.think('Replaying auth response with previously-consumed nonce...');
    const fakeReplay = {
      type: 'DIDAuthResponse',
      did: triage.did,
      challenge: { nonce: consumedNonce }
    };
    rogue.send(root.did, fakeReplay);
    await net.run();
    await delay(600);

    root.think('🛡️ Replay attack foiled. Nonce was already consumed — one-time use enforced.');
  }
  await delay(500);

  // Done
  phase('done', 'Demo complete');
  broadcast({
    time: Date.now(), type: 'summary',
    agents: [root, triage, referral, rogue].map(a => ({
      name: a.name, emoji: a.emoji, did: a.did, role: a.role,
      contacts: a.contacts.size, credentials: a.credentials.length
    })),
    stats: {
      totalMessages: net.logs.filter(e => e.type === 'send').length,
      totalThoughts: net.logs.filter(e => e.type === 'thought').length,
      credentialsIssued: 2, presentationsVerified: 2, rogueBlocked: 1,
      replayBlocked: net.logs.filter(e => e.type === 'send' && e.msgType === 'DIDAuthRejected').length
    }
  });

  demoRunning = false;
}

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
    // Send existing logs
    for (const entry of demoLogs) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
    return;
  }

  if (req.url === '/run' && req.method === 'POST') {
    if (demoRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Demo already running' }));
      return;
    }
    runDemo().catch(e => console.error('Demo error:', e));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'started' }));
    return;
  }

  // Serve index.html
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🏥 Trust Protocol Demo → http://localhost:${PORT}`);
  console.log('Click "Run Demo" in the browser or POST /run to start');
});
