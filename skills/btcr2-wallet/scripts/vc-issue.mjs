#!/usr/bin/env node
// Issue a Verifiable Credential from this wallet
// Usage: node vc-issue.mjs <subject-did> <credential-type> <claims-json> [wallet-path]
// Example: node vc-issue.mjs "did:btcr2:k1q5p..." "AgentAuthorization" '{"role":"triage","facility":"Hospital A"}'

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const subjectDid = process.argv[2];
const credType = process.argv[3];
const claimsJson = process.argv[4] || '{}';
const walletPath = process.argv[5] || process.env.WALLET_PATH || join(process.env.OPENCLAW_WORKSPACE || '/home/node/.openclaw/workspace', 'wallet');

if (!subjectDid || !credType) {
  console.error('Usage: node vc-issue.mjs <subject-did> <credential-type> [claims-json] [wallet-path]');
  process.exit(1);
}

// Load wallet identity
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));
const pubBytes = Identifier.decode(identity.did).genesisBytes;
const secretBytes = new Uint8Array(Buffer.from(identity.secretKeyHex, 'hex'));
const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });

// Build cryptosuite
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: identity.did, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

// Build VC
const claims = JSON.parse(claimsJson);
const vcId = `urn:uuid:${randomUUID()}`;
const vc = {
  '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
  id: vcId,
  type: ['VerifiableCredential', credType],
  issuer: identity.did,
  issuanceDate: new Date().toISOString(),
  credentialSubject: {
    id: subjectDid,
    ...claims
  }
};

// Sign
const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: identity.did + '#initialKey',
  proofPurpose: 'assertionMethod',
  created: new Date().toISOString()
};

const signedVc = diProof.addProof(vc, proofConfig);

// Save to history
const histDir = join(walletPath, 'history');
mkdirSync(histDir, { recursive: true });
writeFileSync(join(histDir, `issued-${Date.now()}.json`), JSON.stringify({
  action: 'issue',
  vcId,
  subject: subjectDid,
  type: credType,
  timestamp: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify(signedVc, null, 2));
