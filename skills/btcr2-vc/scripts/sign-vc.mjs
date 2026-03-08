#!/usr/bin/env node
// Sign a Verifiable Credential using a btcr2 DID
// Usage: node sign-vc.mjs <issuer-did-file> <subject-did> <vc-payload-json>
// issuer-did-file: JSON file from create-did.mjs containing secretKeyHex
// subject-did: the credentialSubject DID string
// vc-payload-json: JSON string of credentialSubject fields (beyond id)

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync } from 'fs';

const issuerFile = process.argv[2];
const subjectDid = process.argv[3];
const payloadJson = process.argv[4] || '{}';

if (!issuerFile || !subjectDid) {
  console.error('Usage: node sign-vc.mjs <issuer-did-file> <subject-did> [payload-json]');
  process.exit(1);
}

// Load issuer keys
const issuer = JSON.parse(readFileSync(issuerFile, 'utf8'));
const secretBytes = new Uint8Array(Buffer.from(issuer.secretKeyHex, 'hex'));
const pubBytes = Identifier.decode(issuer.did).genesisBytes;
const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });

// Build multikey + cryptosuite
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: issuer.did, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

// Build VC
const payload = JSON.parse(payloadJson);
const vc = {
  '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
  type: ['VerifiableCredential', ...(payload.type ? [payload.type] : [])],
  issuer: issuer.did,
  issuanceDate: new Date().toISOString(),
  credentialSubject: {
    id: subjectDid,
    ...payload
  }
};
delete vc.credentialSubject.type;

// Sign
const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: issuer.did + '#initialKey',
  proofPurpose: 'assertionMethod',
  created: new Date().toISOString()
};

const signedVc = diProof.addProof(vc, proofConfig);
console.log(JSON.stringify(signedVc, null, 2));
