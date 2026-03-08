#!/usr/bin/env node
// Issue a Verifiable Credential by signing a template with the wallet's DID
// Usage: node vc-issue.mjs <template-file> <subject-did> [wallet-path]
//
// The template is a JSON file containing the unsigned credential.
// The script injects the issuer (wallet DID), sets the credentialSubject.id
// to the provided subject DID, and produces a Data Integrity proof (bip340-jcs-2025).
// The signed credential is output to stdout.

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const templateFile = process.argv[2];
const subjectDid = process.argv[3];
const walletPath = process.argv[4] || process.env.WALLET_PATH;

if (!templateFile || !subjectDid) {
  console.error('Usage: node vc-issue.mjs <template-file> <subject-did> [wallet-path]');
  console.error('');
  console.error('  template-file  Path to a JSON credential template');
  console.error('  subject-did    DID of the credential subject');
  console.error('  wallet-path    Path to wallet directory (default: ./wallet)');
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

// Load template and inject issuer + subject
const vc = JSON.parse(readFileSync(templateFile, 'utf8'));
vc.issuer = identity.did;
if (vc.credentialSubject) {
  vc.credentialSubject.id = subjectDid;
} else {
  vc.credentialSubject = { id: subjectDid };
}

// Sign with Data Integrity proof
const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: identity.did + '#initialKey',
  proofPurpose: 'assertionMethod',
  created: new Date().toISOString()
};

const signedVc = diProof.addProof(vc, proofConfig);

// Log to history
const histDir = join(walletPath, 'history');
mkdirSync(histDir, { recursive: true });
writeFileSync(join(histDir, `issued-${Date.now()}.json`), JSON.stringify({
  action: 'issue',
  vcId: vc.id,
  subject: subjectDid,
  type: vc.type,
  timestamp: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify(signedVc, null, 2));
