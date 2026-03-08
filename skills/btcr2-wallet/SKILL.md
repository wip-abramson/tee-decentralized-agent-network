---
name: btcr2-wallet
description: Cryptographic identity wallet for AI agents using did:btcr2. Manages DIDs, DID Auth challenge-response, Verifiable Credential issuance/storage/presentation/verification. Use when an agent needs a persistent identity, needs to authenticate another agent, issue or verify credentials, or present proof of authorization. Supports Bitcoin networks (mainnet, testnet3/4, signet, regtest, mutinynet).
---

# btcr2-wallet

Persistent cryptographic identity wallet for AI agents using `did:btcr2`. The wallet lives at `<skill-dir>/wallet/` and persists across conversations.

## How users invoke this skill

Users interact with the wallet through natural language in chat. They should never need to run scripts directly. Examples:

- "Create a new decentralized identifier"
- "Create a DID for me"
- "Show my wallet info"
- "Issue a credential to did:example:attendee-123 using this template: { ... }"
- "Verify this credential: { ... }"
- "Present my credentials"
- "Authenticate with this agent: did:btcr2:k1q5p..."
- "Store this VC in my wallet: { ... }"

## Script reference

All scripts run via `scripts/run.sh` which handles dependencies and sets `WALLET_PATH` to `<skill-dir>/wallet/` by default:

```bash
bash scripts/run.sh <script.mjs> [args...]
```

### Identity

**Init wallet** — creates DID, keypair, directory structure:
```bash
bash scripts/run.sh init.mjs [--network mutinynet] [--name "Agent Name"]
```

**View wallet info:**
```bash
bash scripts/run.sh info.mjs
```

### DID Authentication (prove/verify DID control)

Always authenticate before trusting a DID. Three-step flow:

**1. Generate challenge** (you → them):
```bash
bash scripts/run.sh did-auth-challenge.mjs
```

**2. Sign challenge** (them → you):
```bash
bash scripts/run.sh did-auth-respond.mjs <challenge-json>
```

**3. Verify response** (you verify them):
```bash
bash scripts/run.sh did-auth-verify.mjs <response-json> <challenge-json>
```
Verified contacts are saved to `wallet/contacts/`. Checks: signature validity, nonce match, 5-minute expiry.

### Verifiable Credentials

**Issue a VC** — sign a credential template for a subject DID:
```bash
bash scripts/run.sh vc-issue.mjs <template-file> <subject-did>
```
The template is a JSON file containing the unsigned credential (`@context`, `type`, `credentialSubject`, etc.). The script injects the wallet DID as `issuer`, sets `credentialSubject.id` to the provided subject DID, and signs with a `bip340-jcs-2025` Data Integrity proof. The signed credential is output to stdout.

**Store a received VC** in the wallet:
```bash
bash scripts/run.sh vc-store.mjs <vc-json-or-file>
```

**Present credentials** (wrap wallet VCs in a signed VP):
```bash
bash scripts/run.sh vc-present.mjs [--type AgentAuthorization] [--all]
```

**Verify a VC or VP** (resolve issuer DID, check signature):
```bash
bash scripts/run.sh vc-verify.mjs <vc-or-vp-json-or-file>
```
For VPs: verifies both the presentation envelope and each contained VC. Exit code 0 = valid.

## VC Issuance flow

1. User provides (or Claude creates) a JSON credential template
2. User specifies the subject DID to issue to
3. Claude saves the template to a temp file
4. Claude runs `vc-issue.mjs <template-file> <subject-did>`
5. The signed credential (with Data Integrity proof) is output to the terminal

## Wallet structure

```
wallet/
├── identity.json       — DID + keypair (SECRET — .gitignored)
├── credentials/        — VCs issued to this agent
├── presentations/      — VPs this agent has created
├── contacts/           — Authenticated peers (DID + trust info)
└── history/            — Audit log of all operations
```

## Agent interaction protocol

Standard flow when two agents meet:

1. **DID Auth** — B challenges A, A signs, B verifies (mutual if needed)
2. **Request presentation** — B asks A for credentials
3. **Present** — A selects relevant VCs, wraps in signed VP
4. **Verify** — B verifies VP signature + each VC's issuer chain
5. **Trust decision** — B checks if VC issuers are known/trusted contacts

## API notes

- `DidBtcr2.create()` returns a DID string (not an object)
- `SchnorrKeyPair({ publicKey, secretKey })` — named params, both Uint8Array
- `SchnorrMultikey({ id: '#initialKey', controller: did, keyPair })` — id is fragment only
- Networks: bitcoin(0), signet(1), regtest(2), testnet3(3), testnet4(4), mutinynet(5)
- All proofs use `bip340-jcs-2025` cryptosuite (JSON Canonicalization Scheme)
