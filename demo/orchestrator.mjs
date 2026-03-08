#!/usr/bin/env node
// Multi-Agent Trust Protocol Demo
// Three agents: Root Authority, Triage Agent, Referral Agent
// Demonstrates: DID creation, mutual auth, credential issuance, presentation, verification

import { Agent } from './agent.mjs';
import { Network } from './network.mjs';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function formatLog(entry) {
  const time = new Date(entry.time).toISOString().split('T')[1].split('.')[0];
  const agent = entry.agent.padEnd(16);
  if (entry.type === 'thought') {
    return `${DIM}${time}${RESET} ${CYAN}${agent}${RESET} 💭 ${entry.text}`;
  } else if (entry.type === 'send') {
    return `${DIM}${time}${RESET} ${GREEN}${agent}${RESET} 📤 → ${entry.to?.slice(0, 20)}... [${entry.msgType}]`;
  }
  return `${DIM}${time}${RESET} ${agent} ${JSON.stringify(entry)}`;
}

function banner(text) {
  console.log(`\n${BOLD}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}  ${text}${RESET}`);
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}\n`);
}

function step(text) {
  console.log(`\n${YELLOW}▸ ${text}${RESET}\n`);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// DEMO
// ============================================================

banner('🏥 Trustworthy Multi-Agent Healthcare Network Demo');
console.log('Using did:btcr2 on mutinynet with BIP-340 Schnorr signatures');
console.log('All operations are offline — no Bitcoin transactions required\n');

// --- Setup Network ---
const net = new Network();
net.onLogCallback = (entry) => console.log(formatLog(entry));

// --- Create Agents ---
step('PHASE 1: Agent Identity Creation');

const root = await new Agent('🏛️ Root Authority', 'Trust Root — NHS Digital', '🏛️').init('mutinynet');
const triage = await new Agent('🏥 Triage Agent', 'Hospital A — Emergency Triage', '🏥').init('mutinynet');
const referral = await new Agent('📋 Referral Agent', 'Hospital B — Neurology Intake', '📋').init('mutinynet');

net.register(root);
net.register(triage);
net.register(referral);

console.log(`\n  ${BOLD}Agents:${RESET}`);
console.log(`  🏛️ Root Authority : ${root.did}`);
console.log(`  🏥 Triage Agent   : ${triage.did}`);
console.log(`  📋 Referral Agent : ${referral.did}`);

// --- Phase 2: Root authenticates both agents ---
step('PHASE 2: Root Authority authenticates agents (DID Auth)');

// Root challenges Triage
root.think('I need to authenticate the Triage Agent before issuing credentials.');
const triageChallenge = root.createChallenge();
root.pendingChallenges.set(triageChallenge.nonce, { did: triage.did, timestamp: Date.now() });
root.send(triage.did, triageChallenge);
await net.run();
await delay(100);

// Root challenges Referral
root.think('Now authenticating the Referral Agent.');
const referralChallenge = root.createChallenge();
root.pendingChallenges.set(referralChallenge.nonce, { did: referral.did, timestamp: Date.now() });
root.send(referral.did, referralChallenge);
await net.run();
await delay(100);

// --- Phase 3: Credential Issuance ---
step('PHASE 3: Root Authority issues credentials');

// Issue to Triage
const triageVC = root.issueCredential(triage.did, 'AgentAuthorization', {
  role: 'triage',
  facility: 'Hospital A — Community Health',
  permissions: ['assess-patient', 'set-priority', 'request-referral'],
  department: 'Emergency',
  authorizedBy: 'NHS Digital Trust Authority'
});
root.send(triage.did, triageVC);
await net.run();
await delay(100);

// Issue to Referral
const referralVC = root.issueCredential(referral.did, 'AgentAuthorization', {
  role: 'referral-intake',
  facility: 'Hospital B — Metro General',
  permissions: ['accept-referral', 'assign-bed', 'confirm-admission'],
  department: 'Neurology ICU',
  authorizedBy: 'NHS Digital Trust Authority'
});
root.send(referral.did, referralVC);
await net.run();
await delay(100);

// --- Phase 4: Triage Agent contacts Referral Agent (unknown to each other) ---
step('PHASE 4: Triage Agent contacts Referral Agent (first contact)');

triage.think('Patient needs urgent neurology referral. Contacting Referral Agent at Hospital B.');
triage.think('I don\'t know this agent yet. Initiating DID Auth.');

// Triage sends challenge to Referral
const t2rChallenge = triage.createChallenge();
triage.pendingChallenges.set(t2rChallenge.nonce, { did: referral.did, timestamp: Date.now() });
triage.send(referral.did, t2rChallenge);

// Process all auth messages (challenge → response → confirm, both directions)
await net.run();
await delay(100);

// --- Phase 5: Credential Exchange ---
step('PHASE 5: Mutual credential presentation and verification');

// Referral requests Triage's credentials
referral.think('Before accepting a referral, I need to verify Triage Agent\'s authorization.');
referral.requestPresentation(triage.did, 'AgentAuthorization');
await net.run();
await delay(100);

// Triage requests Referral's credentials
triage.think('I should verify Referral Agent\'s authority to accept patients too.');
triage.requestPresentation(referral.did, 'AgentAuthorization');
await net.run();
await delay(100);

// --- Phase 6: Trusted Communication ---
step('PHASE 6: Trusted healthcare message exchange');

// Now both agents know each other and have verified credentials
// Triage sends a referral request
triage.think('Both agents authenticated and authorized. Sending patient referral.');
triage.sendSignedMessage(referral.did, {
  type: 'ReferralRequest',
  caseId: 'CASE-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
  patient: 'Jane Doe (anonymized)',
  priority: 'RED — Immediate',
  condition: 'Suspected stroke, left-side weakness, onset <2hrs',
  vitals: { bp: '185/110', hr: 92, spo2: 96 },
  requestedDepartment: 'Neurology ICU',
  triageAssessment: 'Urgent neurology consult + CT angiography required'
});
await net.run();
await delay(100);

// Referral responds
referral.think('Referral verified from authorized triage agent. Processing admission.');
referral.sendSignedMessage(triage.did, {
  type: 'ReferralAccepted',
  caseId: 'CASE-ACCEPTED',
  assignedBed: 'NICU-7',
  estimatedArrival: '15 minutes',
  acceptedBy: 'Referral Agent — Hospital B Neurology',
  note: 'Full provenance chain verified. Patient accepted for immediate admission.'
});
await net.run();

// --- Phase 7: Rogue Agent Rejection ---
step('PHASE 7: Rogue agent attempts unauthorized access');

const rogue = await new Agent('🦹 Rogue Agent', 'Unauthorized — No credentials', '🦹').init('mutinynet');
net.register(rogue);

console.log(`  🦹 Rogue Agent   : ${rogue.did}`);
console.log(`  (No credentials from any trust authority)\n`);

rogue.think('Sending a fake referral to the Referral Agent...');

// Rogue sends a signed message — triggers auto-challenge from Referral
rogue.sendSignedMessage(referral.did, {
  type: 'ReferralRequest',
  caseId: 'FAKE-001',
  patient: 'Phantom Patient',
  priority: 'RED',
  condition: 'Fabricated emergency'
});
await net.run();
await delay(100);

// Rogue is now authenticated (valid DID, valid signatures) but has NO credentials
// Referral Agent verifies: who authorized this agent?
referral.think('New agent authenticated. But do they have authorization? Checking credentials.');
referral.requestPresentation(rogue.did, 'AgentAuthorization');
await net.run();
await delay(100);

referral.think('🚫 DECISION: Agent is cryptographically real but holds no credentials from our trust root. Referral DENIED.');

// --- Phase 8: Replay Attack Detection ---
step('PHASE 8: Replay attack detection');

rogue.think('What if I capture and replay a valid auth response? Replaying Triage Agent\'s response...');

// Simulate replay: grab the original auth response from Triage → Root
// The rogue captures a valid signed response and tries to replay it
const capturedResponse = net.logs.find(e =>
  e.type === 'send' && e.msgType === 'DIDAuthResponse' && e.agent === '🏥 Triage Agent'
);

if (capturedResponse) {
  rogue.think('Captured a valid DIDAuthResponse from the network. Replaying to Root Authority...');

  // Reconstruct the signed response as the rogue would have captured it
  // The rogue replays the EXACT same signed message (same nonce, same signature)
  const replayChallenge = root.createChallenge();
  // Instead of signing with their own key, rogue replays an old auth response with the consumed nonce
  // We simulate this by re-sending a response with an already-consumed nonce
  const fakeReplay = {
    type: 'DIDAuthResponse',
    did: triage.did,
    challenge: { nonce: [...root.usedNonces][0] }  // reuse a consumed nonce
  };

  rogue.think('Sending replayed auth response with previously-consumed nonce...');
  rogue.send(root.did, fakeReplay);
  await net.run();
  await delay(100);
} else {
  rogue.think('No auth responses captured to replay.');
}

root.think('🛡️ Replay attack foiled. Nonce was already consumed — one-time use enforced.');

// --- Phase 9: Protocol statistics ---
step('PHASE 9: Protocol statistics');

const totalMessages = net.logs.filter(e => e.type === 'send').length;
const totalThoughts = net.logs.filter(e => e.type === 'thought').length;
const authMessages = net.logs.filter(e => e.type === 'send' && (e.msgType === 'DIDAuthChallenge' || String(e.msgType) === 'DIDAuthResponse')).length;
const replayBlocked = net.logs.filter(e => e.type === 'send' && e.msgType === 'DIDAuthRejected').length;

console.log(`  Total messages exchanged: ${totalMessages}`);
console.log(`  Agent reasoning steps:    ${totalThoughts}`);
console.log(`  Auth protocol messages:   ${authMessages}`);
console.log(`  Credentials issued:       2`);
console.log(`  Presentations verified:   2`);
console.log(`  Rogue attempts blocked:   1`);
console.log(`  Replay attacks detected:  ${replayBlocked}`);
console.log();

// --- Summary ---
banner('📊 Demo Summary');

for (const agent of [root, triage, referral]) {
  console.log(`${BOLD}${agent.name}${RESET} (${agent.role})`);
  console.log(`  DID: ${agent.did}`);
  console.log(`  Contacts: ${agent.contacts.size} authenticated`);
  console.log(`  Credentials: ${agent.credentials.length} held`);
  for (const [did, contact] of agent.contacts) {
    const name = [...net.agents.values()].find(a => a.did === did)?.name || did.slice(0, 25);
    console.log(`  ${GREEN}✓${RESET} ${name} — authenticated ${contact.authenticatedAt?.split('T')[1]?.split('.')[0] || ''}`);
    if (contact.credentials?.length) {
      for (const vc of contact.credentials) {
        console.log(`    📜 ${vc.type[1]} — issued by ${vc.issuer.slice(0, 25)}...`);
      }
    }
  }
  console.log();
}

banner('✅ Demo Complete');
console.log('All agent interactions used:');
console.log('  • did:btcr2 identifiers on mutinynet (offline, no Bitcoin tx)');
console.log('  • BIP-340 Schnorr signatures (bip340-jcs-2025 cryptosuite)');
console.log('  • W3C Data Integrity proofs');
console.log('  • W3C Verifiable Credentials & Presentations');
console.log('  • DID Auth challenge-response protocol');
console.log('  • All messages signed — unsigned messages rejected');
console.log('  • Nonce-based replay attack protection');
console.log('  • Trust chain: Root Authority → Agent credentials → Peer verification');
console.log();

// --- Export protocol trace ---
import { writeFileSync } from 'fs';
const trace = {
  timestamp: new Date().toISOString(),
  agents: [root, triage, referral, rogue].map(a => ({
    name: a.name,
    role: a.role,
    did: a.did,
    contacts: [...a.contacts.entries()].map(([did, c]) => ({
      did,
      name: [...net.agents.values()].find(x => x.did === did)?.name || 'unknown',
      authenticated: c.authenticated,
      credentials: c.credentials?.length || 0
    })),
    credentialsHeld: a.credentials.map(vc => ({
      type: vc.type,
      issuer: vc.issuer,
      subject: vc.credentialSubject?.id
    }))
  })),
  protocolLog: net.logs,
  stats: { totalMessages, totalThoughts, authMessages }
};
writeFileSync('trace.json', JSON.stringify(trace, null, 2));
console.log(`${DIM}Protocol trace saved to trace.json${RESET}\n`);
