---
name: btcr2-vc
description: Create did:btcr2 DIDs and sign/verify W3C Verifiable Credentials with BIP-340 Schnorr Data Integrity proofs. Use when creating decentralized identifiers on Bitcoin (mainnet, testnet3, testnet4, signet, regtest, mutinynet), issuing or verifying VCs, or working with the bip340-jcs-2025 cryptosuite. Supports offline DID creation (no Bitcoin transactions needed) and spec-conformant Data Integrity proofs.
---

# btcr2-vc

Sign and verify W3C Verifiable Credentials using did:btcr2 identifiers with BIP-340 Schnorr signatures.

## Setup

Ensure btcr2 packages are installed. Run `scripts/setup.sh` if `tools/btcr2/node_modules/@did-btcr2` doesn't exist.

All scripts must run via `scripts/run.sh` to resolve dependencies:

```bash
bash scripts/run.sh <script.mjs> [args...]
```

## Create a DID

```bash
bash scripts/run.sh create-did.mjs [network] [output-file]
```

- **network**: bitcoin, signet, regtest, testnet3, testnet4, mutinynet (default: mutinynet)
- **output-file**: JSON file to save DID + keys (default: did-output.json)
- Outputs JSON with `did`, `network`, `publicKeyMultibase` to stdout
- Saves full keys (including `secretKeyHex`) to output file — keep this safe

For KEY-type DIDs, the compressed public key is encoded in the DID string itself. No Bitcoin transaction is needed for creation.

## Sign a VC

```bash
bash scripts/run.sh sign-vc.mjs <issuer-did-file> <subject-did> [payload-json]
```

- **issuer-did-file**: JSON file from create-did.mjs (needs `secretKeyHex`)
- **subject-did**: the credentialSubject DID string
- **payload-json**: JSON string of extra credentialSubject fields. Include `"type"` key to add a VC type (e.g. `"TrustchainEndorsement"`)
- Outputs signed VC with `bip340-jcs-2025` Data Integrity proof to stdout

Example:
```bash
bash scripts/run.sh sign-vc.mjs my-did.json "did:btcr2:k1q5p..." \
  '{"type":"TrustchainEndorsement","role":"Triage Agent","trustLevel":"high"}'
```

## Verify a VC

```bash
bash scripts/run.sh verify-vc.mjs <signed-vc.json>
```

- Resolves the issuer DID (extracts public key from the DID string via `Identifier.decode()`)
- Verifies the Data Integrity proof using `BIP340DataIntegrityProof.verifyProof()`
- Outputs JSON with `verified`, `issuer`, `subject`, `network`, `proofCryptosuite`
- Exit code 0 = valid, 1 = invalid

## Key API Notes

These quirks were discovered through testing — the docs don't always match:

- `DidBtcr2.create()` returns a DID **string**, not `{did, initialDocument}`
- `SchnorrKeyPair` constructor takes `{ publicKey, secretKey }` (not `secret`)
- `SchnorrMultikey` id should be `'#initialKey'` (fragment only), not the full DID+fragment — `fullId()` concatenates `controller + id`
- `DidDocument` requires `service` as an array of beacon services (`SingletonBeacon`, `CASBeacon`, or `SMTBeacon`)
- Networks: bitcoin(0), signet(1), regtest(2), testnet3(3), testnet4(4), mutinynet(5)
