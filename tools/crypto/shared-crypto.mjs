// Shared crypto utilities that each autonomous agent can use
// Each agent imports this and gets signing/verification capabilities

import { generateKeyPair, exportJWK, importJWK, SignJWT, jwtVerify } from 'jose';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const KEYS_DIR = '/home/node/.openclaw/workspace/tools/crypto/keys';
const REGISTRY_PATH = '/home/node/.openclaw/workspace/tools/crypto/registry.json';

// Ensure keys directory exists
if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });

// Generate and persist a keypair for an agent
export async function initAgent(agentId) {
  const keyPath = `${KEYS_DIR}/${agentId}.json`;
  
  if (existsSync(keyPath)) {
    const stored = JSON.parse(readFileSync(keyPath, 'utf8'));
    return {
      did: stored.did,
      pubJWK: stored.pubJWK,
      privJWK: stored.privJWK
    };
  }

  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  const pubJWK = await exportJWK(publicKey);
  const privJWK = await exportJWK(privateKey);
  const did = `did:ion:Ei${agentId}2026`;

  const data = { did, pubJWK, privJWK };
  writeFileSync(keyPath, JSON.stringify(data, null, 2));
  return data;
}

// Sign a payload
export async function signPayload(privJWK, did, payload) {
  const privateKey = await importJWK(privJWK, 'EdDSA');
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: `${did}#key-1` })
    .setIssuedAt()
    .setIssuer(did)
    .sign(privateKey);
}

// Verify a signed JWT against the registry
export async function verifyJWT(jwt) {
  const registry = loadRegistry();
  
  const [headerB64] = jwt.split('.');
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  const signerDID = header.kid.split('#')[0];

  // Look up in registry
  const agent = registry.agents.find(a => a.did === signerDID);
  if (!agent) {
    return { valid: false, reason: `DID not found in trusted network: ${signerDID}` };
  }

  // Verify trust chain
  if (!agent.trustedByRoot) {
    return { valid: false, reason: `Agent ${signerDID} not trusted by root` };
  }

  try {
    const pubKey = await importJWK(agent.pubJWK, 'EdDSA');
    const { payload } = await jwtVerify(jwt, pubKey);
    return { valid: true, payload, signerDID, agentName: agent.name };
  } catch (e) {
    return { valid: false, reason: `Signature invalid: ${e.message}` };
  }
}

// Registry management
export function loadRegistry() {
  if (existsSync(REGISTRY_PATH)) {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  }
  return { rootDID: null, agents: [] };
}

export function saveRegistry(registry) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function registerAgent(agentId, name, role, did, pubJWK) {
  const registry = loadRegistry();
  // Remove existing entry if any
  registry.agents = registry.agents.filter(a => a.did !== did);
  registry.agents.push({ agentId, name, role, did, pubJWK, trustedByRoot: true, registeredAt: new Date().toISOString() });
  saveRegistry(registry);
}

// Message board - agents post and read signed messages here
const BOARD_PATH = '/home/node/.openclaw/workspace/tools/crypto/message-board.json';

export function postToBoard(signedMessage, metadata) {
  const board = existsSync(BOARD_PATH) ? JSON.parse(readFileSync(BOARD_PATH, 'utf8')) : [];
  board.push({ ...metadata, jwt: signedMessage, postedAt: new Date().toISOString() });
  writeFileSync(BOARD_PATH, JSON.stringify(board, null, 2));
}

export function readBoard(filter = {}) {
  if (!existsSync(BOARD_PATH)) return [];
  const board = JSON.parse(readFileSync(BOARD_PATH, 'utf8'));
  if (filter.type) return board.filter(m => m.type === filter.type);
  if (filter.to) return board.filter(m => m.to === filter.to);
  return board;
}

export function clearBoard() {
  writeFileSync(BOARD_PATH, '[]');
}
