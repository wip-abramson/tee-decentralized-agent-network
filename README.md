# Decentralized Agent Network

Decentralized identity and verifiable credentials for AI agents. Create DIDs, authenticate peers, issue credentials, and exchange cryptographically signed messages — all without a central authority.

Built with [did:btcr2](https://github.com/nickreserved/did-btcr2), BIP-340 Schnorr signatures, W3C Verifiable Credentials, and the [Anthropic SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sdk).

## What's Here

### `agents/` — Autonomous Claude-Powered Agents

Claude-powered agents that make their own decisions about authentication, credential exchange, and messaging using tool use. Each agent runs in an agentic loop — Claude decides which wallet operations to call and when, handling the full trust protocol autonomously.

- Powered by the Anthropic SDK (`@anthropic-ai/sdk`) with 20+ wallet tools
- Real BIP-340 Schnorr cryptography — not simulated
- Agents communicate over a shared message network

### `demo/` — Scripted Multi-Agent Trust Demo

A scripted demonstration of the trust protocol with 4 agents:

- **Root Authority** (NHS Digital) — Trust root, issues credentials
- **Triage Agent** (Hospital A) — Emergency triage
- **Referral Agent** (Hospital B) — Neurology intake
- **Rogue Agent** — Unauthorized (gets rejected)

**10 phases:** DID creation → mutual auth → credential issuance → peer verification → credential exchange → signed messages → rogue rejection → replay attack detection → tamper detection → protocol statistics

### `skills/btcr2-wallet/` — Agent Wallet Skill

Reusable identity wallet with CLI scripts: DID management, DID Auth challenge-response, credential issuance/storage/presentation/verification, signed messaging. Designed for integration into agent frameworks.

---

## Quick Start

### Run the Autonomous Agents Demo

Requires Node.js 22+ and an `ANTHROPIC_API_KEY`.

```bash
cd agents
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
node orchestrator.mjs
```

Three Claude-powered agents (Root Authority, Triage Agent, Referral Agent) will autonomously authenticate each other, exchange credentials, and coordinate a patient referral — all decisions made by Claude via tool use.

### Run the Scripted Demo

```bash
cd demo
npm install
node orchestrator.mjs      # CLI output
node server.mjs             # Web visualization at http://localhost:3457
```

---

## Set Up Your Own Agent

Want to give your own AI agent a decentralized identity? Here's how.

### 1. Install dependencies

```bash
cd skills/btcr2-wallet/scripts
npm install
```

### 2. Initialize a wallet

```bash
node init.mjs --name "MyAgent" --network mutinynet
```

This creates a wallet with:
- A new BIP-340 Schnorr keypair
- A `did:btcr2` DID (offline, no Bitcoin transaction needed)
- A local wallet store at `~/.btcr2-wallet/`

### 3. View your agent's identity

```bash
node info.mjs
```

Shows your DID, public key, and stored credentials.

### 4. Authenticate another agent (DID Auth)

Challenge-response mutual authentication:

```bash
# Agent A creates a challenge
node did-auth-challenge.mjs --target did:btcr2:k1q5p...

# Agent B responds (signs the challenge)
node did-auth-respond.mjs --challenge <challenge-json>

# Agent A verifies the response
node did-auth-verify.mjs --response <response-json>
```

### 5. Sign and verify messages

```bash
# Sign a message
node message-sign.mjs --message '{"type":"hello","data":"world"}'

# Verify a signed message
node message-verify.mjs --signed <signed-message-json>
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Agent Framework** | Anthropic SDK — Claude with tool use in an agentic loop |
| **DIDs** | `did:btcr2` — offline decentralized identifiers on Bitcoin networks |
| **Signatures** | BIP-340 Schnorr (x-only public keys) |
| **Proofs** | `bip340-jcs-2025` Data Integrity cryptosuite |
| **Credentials** | W3C Verifiable Credentials v2.0 |
| **Auth** | DID Auth challenge-response with nonce replay protection |
| **Networks** | mutinynet (default), mainnet, testnet3, testnet4, signet, regtest |

## How It Works

1. **Identity** — Each agent creates an offline `did:btcr2` DID with a Schnorr keypair
2. **Authentication** — Agents use challenge-response (sign a random nonce) to prove identity
3. **Credentials** — A trust root issues W3C Verifiable Credentials to authorized agents
4. **Verification** — Agents present and verify each other's credentials before cooperating
5. **Messaging** — All messages are cryptographically signed with Data Integrity proofs
6. **Security** — Unauthorized agents are rejected; replay attacks are detected via one-time nonces

In the `agents/` implementation, Claude autonomously decides how to execute each step — choosing which tools to call, interpreting responses, and adapting its strategy.

No central server. No certificate authority. Just math and cryptography.

---

Built at the [SoTA Scaling Trust hackathon](https://luma.com/eron45y6?tk=6QAdRR) — **Challenge 1: Trustworthy Multi-Agent AI**. Co-organized by the [ARIA Trust Everything, Everywhere](https://aria.org.uk/opportunity-spaces/trust-everything-everywhere/) opportunity space.
