#!/usr/bin/env node
// Verify a DID Auth response
// Usage: node did-auth-verify.mjs <response-json> <original-challenge-json> [wallet-path]
// Verifies: signature is valid, challenge matches, DID is resolved

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const responseArg = process.argv[2];
const challengeArg = process.argv[3];
const walletPath = process.argv[4] || process.env.WALLET_PATH;

if (!responseArg || !challengeArg) {
  console.error('Usage: node did-auth-verify.mjs <response-json-or-file> <challenge-json-or-file> [wallet-path]');
  process.exit(1);
}

// Parse inputs
const parse = (arg) => existsSync(arg) ? JSON.parse(readFileSync(arg, 'utf8')) : JSON.parse(arg);
const response = parse(responseArg);
const originalChallenge = parse(challengeArg);

// Step 1: Check challenge matches
if (response.challenge?.nonce !== originalChallenge.nonce) {
  console.log(JSON.stringify({ verified: false, error: 'Challenge nonce mismatch' }));
  process.exit(1);
}

// Step 2: Check timestamp is recent (within 5 minutes)
const challengeTime = new Date(originalChallenge.timestamp).getTime();
const now = Date.now();
if (now - challengeTime > 5 * 60 * 1000) {
  console.log(JSON.stringify({ verified: false, error: 'Challenge expired' }));
  process.exit(1);
}

// Step 3: Resolve the responder's DID
const responderDid = response.did;
const decoded = Identifier.decode(responderDid);
const keyPair = new SchnorrKeyPair({ publicKey: decoded.genesisBytes });
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: responderDid, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

// Step 4: Verify the signature
const result = diProof.verifyProof(JSON.stringify(response), 'authentication');

// Step 5: Save to contacts if verified
if (result.verified) {
  const contactDir = join(walletPath, 'contacts');
  mkdirSync(contactDir, { recursive: true });
  const contactFile = join(contactDir, responderDid.replace(/:/g, '_') + '.json');
  const contact = {
    did: responderDid,
    network: decoded.network,
    publicKeyHex: Buffer.from(decoded.genesisBytes).toString('hex'),
    authenticatedAt: new Date().toISOString(),
    lastChallenge: originalChallenge.nonce
  };
  // Merge with existing contact if present
  if (existsSync(contactFile)) {
    const existing = JSON.parse(readFileSync(contactFile, 'utf8'));
    Object.assign(existing, contact);
    writeFileSync(contactFile, JSON.stringify(existing, null, 2));
  } else {
    writeFileSync(contactFile, JSON.stringify(contact, null, 2));
  }
}

const output = {
  verified: result.verified,
  did: responderDid,
  network: decoded.network,
  challengeNonce: originalChallenge.nonce
};

console.log(JSON.stringify(output, null, 2));
process.exit(result.verified ? 0 : 1);
