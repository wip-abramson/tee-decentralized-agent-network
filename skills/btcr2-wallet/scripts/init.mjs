#!/usr/bin/env node
// Initialize a btcr2 agent wallet
// Usage: node init.mjs [wallet-path] [--network mutinynet] [--name "Agent Name"]

import { DidBtcr2, DidDocument, DidVerificationMethod } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Parse args
const args = process.argv.slice(2);
let walletPath = process.env.WALLET_PATH;
let network = 'mutinynet';
let name = 'Agent';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--network' && args[i+1]) { network = args[++i]; }
  else if (args[i] === '--name' && args[i+1]) { name = args[++i]; }
  else if (!args[i].startsWith('-')) { walletPath = args[i]; }
}

// Check if wallet already exists
if (existsSync(join(walletPath, 'identity.json'))) {
  console.error('Wallet already exists at', walletPath);
  console.error('Use "info" to view, or delete identity.json to reinitialize');
  process.exit(1);
}

// Create directory structure
const dirs = ['', 'credentials', 'presentations', 'contacts', 'history'];
for (const dir of dirs) {
  mkdirSync(join(walletPath, dir), { recursive: true });
}

// Generate keypair and DID
const keys = SchnorrKeyPair.generate();
const did = await DidBtcr2.create(keys.publicKey.compressed, { idType: 'KEY', network });

// Build DID document
const vm = new DidVerificationMethod({
  id: did + '#initialKey',
  type: 'Multikey',
  controller: did,
  publicKeyMultibase: keys.publicKey.multibase
});

const didDocument = new DidDocument({
  id: did,
  controller: [did],
  verificationMethod: [vm],
  authentication: [did + '#initialKey'],
  assertionMethod: [did + '#initialKey'],
  capabilityInvocation: [did + '#initialKey'],
  capabilityDelegation: [did + '#initialKey'],
  service: [{
    id: did + '#beacon-0',
    type: 'SingletonBeacon',
    serviceEndpoint: 'bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
  }]
});

// Save identity
const identity = {
  did,
  name,
  network,
  created: new Date().toISOString(),
  secretKeyHex: keys.secretKey.hex,
  publicKeyHex: keys.publicKey.hex,
  publicKeyMultibase: keys.publicKey.multibase.encoded,
  didDocument
};

writeFileSync(join(walletPath, 'identity.json'), JSON.stringify(identity, null, 2));

// Write a minimal .gitignore to protect the secret key
writeFileSync(join(walletPath, '.gitignore'), 'identity.json\n');

// Output public info
const publicInfo = {
  did,
  name,
  network,
  publicKeyMultibase: identity.publicKeyMultibase,
  walletPath
};

console.log(JSON.stringify(publicInfo, null, 2));
