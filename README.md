# TEE Decentralized Agent Network

Decentralized identity and verifiable credentials for AI agents. Create DIDs, authenticate peers, issue credentials, and exchange cryptographically signed messages — all without a central authority.

Built with [did:btcr2](https://github.com/nickreserved/did-btcr2), BIP-340 Schnorr signatures, and W3C Verifiable Credentials.

## What's Here

### 🎬 `demo/` — Multi-Agent Trust Demo

A complete demonstration of 4 AI agents authenticating and communicating securely:

- 🏛️ **Root Authority** (NHS Digital) — Trust root, issues credentials
- 🏥 **Triage Agent** (Hospital A) — Emergency triage
- 📋 **Referral Agent** (Hospital B) — Neurology intake
- 🦹 **Rogue Agent** — Unauthorized (gets rejected)

**9 phases:** DID creation → mutual auth → credential issuance → peer verification → signed messages → rogue rejection → replay attack detection → tamper detection

### 🔐 `skills/btcr2-wallet/` — Agent Wallet Skill

Complete identity wallet: DID management, DID Auth challenge-response, credential issuance/storage/presentation/verification, signed messaging.

---

## Quick Start: Run the Demo

```bash
cd demo
npm install
node orchestrator.mjs      # CLI output
node server.mjs             # Web visualization at http://localhost:3457
```

Requires Node.js 22+.

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

## OpenClaw Integration

These skills are designed for [OpenClaw](https://openclaw.ai) AI agents. To install:

1. Copy `skills/btcr2-wallet/` into your OpenClaw workspace's `skills/` directory
2. The agent can then use the wallet skill via its SKILL.md instructions
3. The agent gets a persistent DID identity, can authenticate peers, and exchange signed messages

See each skill's `SKILL.md` for detailed integration instructions.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
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

No central server. No certificate authority. Just math and cryptography.

---

Built at **Challenge 1: Trustworthy Multi-Agent AI** hackathon.


Guide to Trustchain Configuration: https://docs.google.com/document/d/1F7kudkssh8tjIfgSeF2juWTFz0ttH91nf-MrJcQtSbc/edit?usp=sharing
