#!/usr/bin/env node
// Orchestrator — creates autonomous Claude-powered agents with btcr2 wallets
// Each agent uses the Anthropic SDK with tool_use to make its own decisions
// about authentication, credential exchange, and signed messaging.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { Wallet } from './wallet.mjs';
import { Network } from './network.mjs';
import { createToolDefs, executeTool } from './tools.mjs';

// Load .env if present (ANTHROPIC_API_KEY)
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const envPath of [resolve(__dirname, '.env'), resolve(__dirname, '..', '.env')]) {
  try {
    const envFile = readFileSync(envPath, 'utf8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const client = new Anthropic();
const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

// === Agent runner — agentic loop with tool execution ===

async function runAgent(name, systemPrompt, userPrompt, wallet, network, maxTurns = 15) {
  console.log(`\n${BOLD}${CYAN}━━━ ${name} is thinking... ━━━${RESET}\n`);

  const tools = createToolDefs();
  const messages = [{ role: 'user', content: userPrompt }];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages
    });

    // Process all content blocks
    let hasToolUse = false;
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        console.log(`${CYAN}${name}:${RESET} ${block.text}`);
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        console.log(`${GREEN}  🔧 ${block.name}${RESET}${DIM} ${JSON.stringify(block.input).slice(0, 120)}${RESET}`);

        const result = executeTool(block.name, block.input, wallet, network);
        console.log(`${DIM}  → ${JSON.stringify(result).slice(0, 200)}${RESET}`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      }
    }

    // If no tool use, the agent is done
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      if (!hasToolUse) break;
      // Agent said something AND used tools — it might still want to continue
      // but if stop_reason is end_turn with tool results pending, we should process them
    }

    if (toolResults.length === 0) break;

    // Feed tool results back and continue the loop
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  console.log(`${DIM}━━━ ${name} finished ━━━${RESET}\n`);
}

// === DEMO SETUP ===

async function main() {
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}  🏥 Autonomous Multi-Agent Trust Protocol Demo${RESET}`);
  console.log(`${BOLD}  Each agent is powered by Claude (${MODEL}) with btcr2 wallet tools${RESET}`);
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}`);

  // Create wallets (real BIP-340 keypairs)
  console.log(`\n${YELLOW}▸ Initializing agent wallets...${RESET}`);
  const rootWallet = await new Wallet('Root Authority').init('mutinynet');
  const triageWallet = await new Wallet('Triage Agent').init('mutinynet');
  const referralWallet = await new Wallet('Referral Agent').init('mutinynet');

  console.log(`  🏛️ Root Authority : ${rootWallet.did}`);
  console.log(`  🏥 Triage Agent   : ${triageWallet.did}`);
  console.log(`  📋 Referral Agent : ${referralWallet.did}`);

  // Create shared network
  const network = new Network();
  network.register(rootWallet);
  network.register(triageWallet);
  network.register(referralWallet);

  network.onLogCallback = (entry) => {
    console.log(`${DIM}  [NET] ${entry.from?.slice(0, 20)}... → ${entry.to?.slice(0, 20)}... [${entry.msgType}]${RESET}`);
  };

  // === PHASE 1: Root Authority authenticates and credentials both agents ===

  console.log(`\n${YELLOW}▸ PHASE 1: Root Authority authenticates agents and issues credentials${RESET}`);

  await runAgent(
    '🏛️ Root Authority',
    `You are the Root Authority (NHS Digital Trust Root) in a healthcare multi-agent network.
Your DID is: ${rootWallet.did}
Your role: authenticate other agents and issue Verifiable Credentials authorizing them.

You are interacting with two agents:
1. Triage Agent — DID: ${triageWallet.did} — needs "AgentAuthorization" with role "triage", facility "Hospital A", permissions ["assess-patient","set-priority","request-referral"]
2. Referral Agent — DID: ${referralWallet.did} — needs "AgentAuthorization" with role "referral-intake", facility "Hospital B", permissions ["accept-referral","assign-bed","confirm-admission"]

IMPORTANT: You must authenticate each agent FIRST (send auth challenge, then wait for and verify their response), and ONLY THEN issue their credential and send it to them.

Step by step:
1. Check your identity with get_identity
2. Send an auth challenge to the Triage Agent
3. Wait briefly, then check_messages for their response
4. Verify the auth response
5. Issue and send the Triage Agent's credential
6. Repeat steps 2-5 for the Referral Agent

Use the tools. Every operation involves real BIP-340 Schnorr cryptography.`,
    'Begin authenticating agents and issuing credentials. Start by checking your identity, then authenticate and credential both agents.',
    rootWallet,
    network
  );

  // The Triage Agent needs to respond to the challenge and store its credential
  console.log(`\n${YELLOW}▸ PHASE 2: Triage Agent responds to auth and stores credential${RESET}`);

  await runAgent(
    '🏥 Triage Agent',
    `You are the Triage Agent at Hospital A (Emergency Triage).
Your DID is: ${triageWallet.did}
Your role: handle emergency triage, prioritize patients, request referrals.

You should have messages in your inbox from the Root Authority (${rootWallet.did}).
Process them:
- If you receive a DIDAuthChallenge: respond to it with respond_to_challenge
- If you receive a VerifiableCredential: store it with store_credential
- If you receive a DIDAuthConfirmed: note that the Root Authority has authenticated you

Check messages and process everything. Use the tools.`,
    'Check your messages and respond to all pending authentication challenges and credential offers.',
    triageWallet,
    network
  );

  // Root needs to process Triage's auth response, then handle Referral
  console.log(`\n${YELLOW}▸ Root Authority processes responses${RESET}`);

  await runAgent(
    '🏛️ Root Authority',
    `You are the Root Authority. Your DID is: ${rootWallet.did}
You previously sent auth challenges. Check your messages for responses and verify them.
After verifying, issue and send credentials if you haven't already.

Triage Agent DID: ${triageWallet.did} — needs "AgentAuthorization" with role "triage", facility "Hospital A", permissions ["assess-patient","set-priority","request-referral"]
Referral Agent DID: ${referralWallet.did} — needs "AgentAuthorization" with role "referral-intake", facility "Hospital B", permissions ["accept-referral","assign-bed","confirm-admission"]

Check messages, verify any auth responses, then issue and send credentials to authenticated agents. Then send auth challenge to Referral Agent if not done.`,
    'Check messages, verify responses, issue credentials, and authenticate the Referral Agent.',
    rootWallet,
    network
  );

  // Referral Agent processes its messages
  console.log(`\n${YELLOW}▸ PHASE 3: Referral Agent responds to auth and stores credential${RESET}`);

  await runAgent(
    '📋 Referral Agent',
    `You are the Referral Agent at Hospital B (Neurology Intake).
Your DID is: ${referralWallet.did}
Your role: accept referrals, assign beds, confirm admissions.

Check your inbox for messages from the Root Authority (${rootWallet.did}).
Process all challenges and credentials. Use the tools.`,
    'Check your messages and respond to authentication challenges and store any credentials.',
    referralWallet,
    network
  );

  // Root processes Referral's response
  await runAgent(
    '🏛️ Root Authority',
    `You are the Root Authority. Your DID is: ${rootWallet.did}
Check messages for the Referral Agent's auth response and verify it. Then issue and send them their credential if not already done.
Referral Agent DID: ${referralWallet.did} — needs "AgentAuthorization" with role "referral-intake", facility "Hospital B", permissions ["accept-referral","assign-bed","confirm-admission"]`,
    'Check messages, verify the Referral Agent, and issue their credential.',
    rootWallet,
    network
  );

  // Referral stores credential
  await runAgent(
    '📋 Referral Agent',
    `You are the Referral Agent. Your DID is: ${referralWallet.did}
Check for any new messages and process them (store credentials, acknowledge confirmations).`,
    'Check and process any new messages.',
    referralWallet,
    network
  );

  // === PHASE 4: Triage contacts Referral for a patient referral ===
  console.log(`\n${YELLOW}▸ PHASE 4: Triage Agent initiates patient referral to Referral Agent${RESET}`);

  await runAgent(
    '🏥 Triage Agent',
    `You are the Triage Agent at Hospital A. Your DID is: ${triageWallet.did}

You have a critical patient: Jane Doe, suspected stroke, left-side weakness, onset <2 hours.
Vitals: BP 185/110, HR 92, SpO2 96%. Needs urgent neurology consult + CT angiography.

You need to contact the Referral Agent at Hospital B (DID: ${referralWallet.did}) to request an emergency admission.

But first, you must authenticate with them — you've never communicated directly.
1. Send an auth challenge to the Referral Agent
2. Check for their response and verify it
3. Then present your credentials so they know you're authorized
4. Finally, send a signed referral request with the patient details

Use the tools for every step. All messages must be cryptographically signed.`,
    'Authenticate with the Referral Agent and send an urgent patient referral.',
    triageWallet,
    network
  );

  // Referral responds to Triage's auth + processes referral
  console.log(`\n${YELLOW}▸ PHASE 5: Referral Agent processes authentication and referral${RESET}`);

  await runAgent(
    '📋 Referral Agent',
    `You are the Referral Agent at Hospital B (Neurology Intake). Your DID is: ${referralWallet.did}

Check your messages. You may have:
- Auth challenges from the Triage Agent (${triageWallet.did}) — respond to them
- Credential presentations — verify them
- Signed referral requests — verify the signature, check credentials, decide whether to accept

For referral requests from authenticated, credentialed agents: accept the patient and respond with bed assignment (NICU-7) and estimated arrival.
For requests from unauthenticated or uncredentialed agents: reject.

Process everything step by step.`,
    'Process all incoming messages — authenticate, verify credentials, and handle any referral requests.',
    referralWallet,
    network
  );

  // Triage checks Referral's responses
  await runAgent(
    '🏥 Triage Agent',
    `You are the Triage Agent. DID: ${triageWallet.did}
Check messages for responses from the Referral Agent. Verify any auth responses, then check for their reply to your referral request.`,
    'Check for Referral Agent responses and verify them.',
    triageWallet,
    network
  );

  // Referral finishes processing
  await runAgent(
    '📋 Referral Agent',
    `You are the Referral Agent. DID: ${referralWallet.did}
Check for any remaining messages. If the Triage Agent has presented credentials and sent a referral, verify everything and send your acceptance with a signed message including bed assignment NICU-7.`,
    'Process remaining messages and send referral acceptance if appropriate.',
    referralWallet,
    network
  );

  // Final message check
  await runAgent(
    '🏥 Triage Agent',
    `You are the Triage Agent. DID: ${triageWallet.did}
Check for any final messages from the Referral Agent. If they accepted the referral, verify the signed message and report the outcome.`,
    'Check for the referral acceptance.',
    triageWallet,
    network
  );

  // === SUMMARY ===
  console.log(`\n${BOLD}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}  📊 Demo Summary${RESET}`);
  console.log(`${BOLD}${'═'.repeat(70)}${RESET}\n`);

  for (const w of [rootWallet, triageWallet, referralWallet]) {
    const state = w.getState();
    console.log(`${BOLD}${w.name}${RESET}`);
    console.log(`  DID: ${w.did}`);
    console.log(`  Contacts: ${state.contacts.length} authenticated`);
    console.log(`  Credentials held: ${state.credentialsHeld.length}`);
    for (const c of state.contacts) {
      console.log(`  ${GREEN}✓${RESET} ${c.did} — authenticated ${c.authenticatedAt}`);
    }
    console.log();
  }

  const totalMessages = network.log.length;
  console.log(`Total network messages: ${totalMessages}`);
  console.log(`Model used: ${MODEL}`);
  console.log(`\n${BOLD}All agent decisions were made autonomously by Claude.${RESET}`);
  console.log(`${BOLD}All cryptographic operations used real BIP-340 Schnorr signatures.${RESET}\n`);
}

main().catch(e => {
  console.error(`${RED}Error:${RESET}`, e.message);
  process.exit(1);
});
