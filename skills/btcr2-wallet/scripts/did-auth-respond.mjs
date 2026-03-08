#!/usr/bin/env node
// Respond to a DID Auth challenge by signing it
// Usage: node did-auth-respond.mjs <challenge-json> [wallet-path]
// challenge-json: the challenge JSON string or file path

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const challengeArg = process.argv[2];
const walletPath = process.argv[3] || process.env.WALLET_PATH;

if (!challengeArg) {
  console.error('Usage: node did-auth-respond.mjs <challenge-json-or-file> [wallet-path]');
  process.exit(1);
}

// Parse challenge
let challenge;
if (existsSync(challengeArg)) {
  challenge = JSON.parse(readFileSync(challengeArg, 'utf8'));
} else {
  challenge = JSON.parse(challengeArg);
}

// Load wallet
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));
const pubBytes = Identifier.decode(identity.did).genesisBytes;
const secretBytes = new Uint8Array(Buffer.from(identity.secretKeyHex, 'hex'));
const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });

// Build multikey + sign
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: identity.did, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

const response = {
  type: 'DIDAuthResponse',
  did: identity.did,
  challenge: challenge
};

const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: identity.did + '#initialKey',
  proofPurpose: 'authentication',
  created: new Date().toISOString(),
  challenge: challenge.nonce,
  domain: challenge.domain
};

const signedResponse = diProof.addProof(response, proofConfig);
console.log(JSON.stringify(signedResponse, null, 2));
