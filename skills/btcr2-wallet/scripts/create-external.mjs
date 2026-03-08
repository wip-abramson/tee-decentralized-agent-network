#!/usr/bin/env node
// Create an EXTERNAL type btcr2 DID with custom services
// Usage: node create-external.mjs <services-json> [--network mutinynet] [--name "Name"] [wallet-path]
// services-json: JSON array of {type, serviceEndpoint} objects

import { DidBtcr2, Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { createHash } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
let servicesArg = null;
let network = 'mutinynet';
let name = 'Agent';
let walletPath = process.env.WALLET_PATH || join(process.env.OPENCLAW_WORKSPACE || '/home/node/.openclaw/workspace', 'wallet');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--network' && args[i+1]) { network = args[++i]; }
  else if (args[i] === '--name' && args[i+1]) { name = args[++i]; }
  else if (!args[i].startsWith('-') && !servicesArg) { servicesArg = args[i]; }
  else if (!args[i].startsWith('-')) { walletPath = args[i]; }
}

const services = servicesArg ? JSON.parse(servicesArg) : [];

const keys = SchnorrKeyPair.generate();
const placeholder = 'did:btcr2:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// Build service entries with placeholders
const serviceEntries = services.map((s, i) => ({
  id: placeholder + '#' + (s.id || s.type.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + i),
  type: s.type,
  serviceEndpoint: s.serviceEndpoint
}));

const intermediateDoc = {
  id: placeholder,
  '@context': ['https://www.w3.org/TR/did-1.1', 'https://btcr2.dev/context/v1'],
  controller: [placeholder],
  verificationMethod: [{
    id: placeholder + '#initialKey',
    type: 'Multikey',
    controller: placeholder,
    publicKeyMultibase: keys.publicKey.multibase.encoded
  }],
  authentication: [placeholder + '#initialKey'],
  assertionMethod: [placeholder + '#initialKey'],
  capabilityInvocation: [placeholder + '#initialKey'],
  capabilityDelegation: [placeholder + '#initialKey'],
  service: serviceEntries
};

// Hash intermediate doc → genesis bytes
const docHash = createHash('sha256').update(JSON.stringify(intermediateDoc)).digest();
const did = await DidBtcr2.create(docHash, { idType: 'EXTERNAL', network });

// Replace placeholders with actual DID
const didDocument = JSON.parse(JSON.stringify(intermediateDoc).replaceAll(placeholder, did));

// Verify integrity
const decoded = Identifier.decode(did);
const genesisMatch = Buffer.from(decoded.genesisBytes).toString('hex') === docHash.toString('hex');

// Save wallet
const dirs = ['', 'credentials', 'presentations', 'contacts', 'history'];
for (const dir of dirs) { mkdirSync(join(walletPath, dir), { recursive: true }); }

const identity = {
  did,
  name,
  network,
  idType: 'EXTERNAL',
  created: new Date().toISOString(),
  secretKeyHex: keys.secretKey.hex,
  publicKeyHex: keys.publicKey.hex,
  publicKeyMultibase: keys.publicKey.multibase.encoded,
  genesisHash: docHash.toString('hex'),
  didDocument
};

writeFileSync(join(walletPath, 'identity.json'), JSON.stringify(identity, null, 2));
writeFileSync(join(walletPath, '.gitignore'), 'identity.json\n');

console.log(JSON.stringify({
  did,
  name,
  network,
  idType: 'EXTERNAL',
  genesisMatch,
  services: didDocument.service.map(s => ({ type: s.type, endpoint: s.serviceEndpoint })),
  publicKeyMultibase: keys.publicKey.multibase.encoded,
  walletPath
}, null, 2));
