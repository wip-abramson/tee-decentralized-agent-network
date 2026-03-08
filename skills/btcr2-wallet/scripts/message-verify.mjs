#!/usr/bin/env node
// Verify a signed message envelope
// Usage: node message-verify.mjs <signed-message-json-or-file> [wallet-path]
// Checks: signature valid, sender DID resolves, sender is authenticated contact

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const msgArg = process.argv[2];
const walletPath = process.argv[3] || process.env.WALLET_PATH || join(process.env.OPENCLAW_WORKSPACE || '/home/node/.openclaw/workspace', 'wallet');

if (!msgArg) {
  console.error('Usage: node message-verify.mjs <signed-message-json-or-file> [wallet-path]');
  process.exit(1);
}

const msg = existsSync(msgArg) ? JSON.parse(readFileSync(msgArg, 'utf8')) : JSON.parse(msgArg);

const senderDid = msg.from;
if (!senderDid) {
  console.log(JSON.stringify({ verified: false, error: 'No "from" DID in message' }));
  process.exit(1);
}

// Resolve sender DID
const decoded = Identifier.decode(senderDid);
const keyPair = new SchnorrKeyPair({ publicKey: decoded.genesisBytes });
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: senderDid, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

// Verify signature
const result = diProof.verifyProof(JSON.stringify(msg), 'authentication');

// Check if sender is an authenticated contact
const contactFile = join(walletPath, 'contacts', senderDid.replace(/:/g, '_') + '.json');
const isKnownContact = existsSync(contactFile);
let contact = null;
if (isKnownContact) {
  contact = JSON.parse(readFileSync(contactFile, 'utf8'));
}

const output = {
  verified: result.verified,
  from: senderDid,
  authenticated: isKnownContact,
  network: decoded.network,
  timestamp: msg.timestamp,
  payload: msg.payload
};

if (!isKnownContact && result.verified) {
  output.warning = 'UNAUTHENTICATED_SENDER: signature valid but sender not in contacts. Run DID Auth first.';
}

console.log(JSON.stringify(output, null, 2));
process.exit(result.verified ? 0 : 1);
