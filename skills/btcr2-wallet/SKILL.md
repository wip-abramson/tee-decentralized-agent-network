---
name: btcr2-wallet
description: Cryptographic identity wallet for AI agents using did:btcr2. Manages DIDs, DID Auth challenge-response, Verifiable Credential issuance/storage/presentation/verification. Use when an agent needs a persistent identity, needs to authenticate another agent, issue or verify credentials, or present proof of authorization. Supports Bitcoin networks (mainnet, testnet3/4, signet, regtest, mutinynet).
---

# btcr2-wallet

Persistent cryptographic identity wallet for AI agents. All scripts run via `scripts/run.sh`:

```bash
bash scripts/run.sh <script.mjs> [args...]
```

Default wallet location: `$WORKSPACE/wallet/`. Override with `WALLET_PATH` env or pass as argument.

## Wallet Structure

```
wallet/
├── identity.json       — DID + keypair (SECRET — .gitignored)
├── credentials/        — VCs issued to this agent
├── presentations/      — VPs this agent has created
├── contacts/           — Authenticated peers (DID + trust info)
└── history/            — Audit log of all operations
```

## Commands

### Identity

**Init wallet** — creates DID, keypair, directory structure:
```bash
bash scripts/run.sh init.mjs [wallet-path] [--network mutinynet] [--name "Agent Name"]
```

**View wallet info:**
```bash
bash scripts/run.sh info.mjs [wallet-path]
```

### DID Authentication (prove/verify DID control)

Always authenticate before trusting a DID. Three-step flow:

**1. Generate challenge** (you → them):
```bash
bash scripts/run.sh did-auth-challenge.mjs [wallet-path] > challenge.json
```

**2. Sign challenge** (them → you):
```bash
bash scripts/run.sh did-auth-respond.mjs <challenge.json> [their-wallet-path] > response.json
```

**3. Verify response** (you verify them):
```bash
bash scripts/run.sh did-auth-verify.mjs <response.json> <challenge.json> [wallet-path]
```
Verified contacts are saved to `wallet/contacts/`. Checks: signature validity, nonce match, 5-minute expiry.

### Verifiable Credentials

**Issue a VC** (sign a credential about someone):
```bash
bash scripts/run.sh vc-issue.mjs <subject-did> <credential-type> [claims-json] [wallet-path]
```
Example:
```bash
bash scripts/run.sh vc-issue.mjs "did:btcr2:k1q5p..." "AgentAuthorization" \
  '{"role":"triage","facility":"Hospital A","permissions":["assess-patient"]}'
```

**Store a received VC** in your wallet:
```bash
bash scripts/run.sh vc-store.mjs <vc-json-or-file> [wallet-path]
```

**Present credentials** (wrap wallet VCs in a signed VP):
```bash
bash scripts/run.sh vc-present.mjs [--type AgentAuthorization] [--all] [wallet-path]
```

**Verify a VC or VP** (resolve issuer DID, check signature):
```bash
bash scripts/run.sh vc-verify.mjs <vc-or-vp-json-or-file> [wallet-path]
```
For VPs: verifies both the presentation envelope and each contained VC. Exit code 0 = valid.

## Agent Interaction Protocol

Standard flow when two agents meet:

1. **DID Auth** — B challenges A, A signs, B verifies (mutual if needed)
2. **Request presentation** — B asks A for credentials
3. **Present** — A selects relevant VCs, wraps in signed VP
4. **Verify** — B verifies VP signature + each VC's issuer chain
5. **Trust decision** — B checks if VC issuers are known/trusted contacts

## API Notes

- `DidBtcr2.create()` returns a DID string (not an object)
- `SchnorrKeyPair({ publicKey, secretKey })` — named params, both Uint8Array
- `SchnorrMultikey({ id: '#initialKey', controller: did, keyPair })` — id is fragment only
- Networks: bitcoin(0), signet(1), regtest(2), testnet3(3), testnet4(4), mutinynet(5)
- All proofs use `bip340-jcs-2025` cryptosuite (JSON Canonicalization Scheme)
