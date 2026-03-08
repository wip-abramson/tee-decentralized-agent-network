# TEE Decentralized Agent Network

Multi-agent trust demonstration using decentralized identifiers (DIDs) and verifiable credentials for secure agent-to-agent communication.

## What It Does

Four AI agents authenticate each other, exchange verifiable credentials, and communicate with cryptographically signed messages — all without a central authority.

### Agents
- 🏛️ **Root Authority** (NHS Digital) — Trust root, issues credentials
- 🏥 **Triage Agent** (Hospital A) — Emergency triage
- 📋 **Referral Agent** (Hospital B) — Neurology intake
- 🦹 **Rogue Agent** — Unauthorized agent (gets rejected)

### Protocol Flow
1. **DID Creation** — Offline DIDs on mutinynet (did:btcr2)
2. **Mutual DID Auth** — Challenge-response authentication
3. **Credential Issuance** — Root issues VCs to authorized agents
4. **Peer Authentication** — Agents verify each other
5. **Credential Presentation** — Agents present and verify credentials
6. **Signed Messages** — Healthcare referral with signatures
7. **Rogue Rejection** — Unauthorized agent denied access
8. **Replay Attack Detection** — One-time nonce enforcement
9. **Message Tampering Detection** — Signature verification catches modifications

## Quick Start

### Prerequisites
- Node.js 22+
- npm

### CLI Demo
```bash
cd demo
npm install
node orchestrator.mjs
```

### Web Visualization
```bash
cd demo
npm install
node server.mjs
# Open http://localhost:3457
```

Features an animated SVG network graph with color-coded message particles flowing between agents.

## Tech Stack
- **did:btcr2** — Offline decentralized identifiers (no Bitcoin transactions needed)
- **BIP-340 Schnorr signatures** — bip340-jcs-2025 Data Integrity proofs
- **W3C Verifiable Credentials** — Standard credential format
- **DID Auth** — Challenge-response mutual authentication

## Project Structure
```
demo/               — Multi-agent demo (CLI + web)
skills/btcr2-vc/    — DID creation + VC signing/verification
skills/btcr2-wallet/ — Full agent wallet (DIDs, auth, VCs, messaging)
services/dashboard/  — Dashboard UI
```

## Built at
Challenge 1: Trustworthy Multi-Agent AI hackathon
