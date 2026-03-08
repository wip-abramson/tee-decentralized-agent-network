#!/usr/bin/env node
// Sign an arbitrary message with your wallet DID
// Usage: node message-sign.mjs <message-json-or-string> [wallet-path]
// Wraps the message in an envelope with DID + Data Integrity proof

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const msgArg = process.argv[2];
const walletPath = process.argv[3] || process.env.WALLET_PATH;

if (!msgArg) {
  console.error('Usage: node message-sign.mjs <message-json-or-string> [wallet-path]');
  process.exit(1);
}

// Parse message — could be JSON or plain string
let payload;
try { payload = JSON.parse(msgArg); } catch { payload = { text: msgArg }; }

// Load wallet
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));
const pubBytes = Identifier.decode(identity.did).genesisBytes;
const secretBytes = new Uint8Array(Buffer.from(identity.secretKeyHex, 'hex'));
const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: identity.did, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

// Build signed envelope
const envelope = {
  '@context': ['https://btcr2.dev/context/v1'],
  id: `urn:uuid:${randomUUID()}`,
  type: 'SignedMessage',
  from: identity.did,
  timestamp: new Date().toISOString(),
  payload
};

const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: identity.did + '#initialKey',
  proofPurpose: 'authentication',
  created: new Date().toISOString()
};

const signed = diProof.addProof(envelope, proofConfig);
console.log(JSON.stringify(signed, null, 2));
