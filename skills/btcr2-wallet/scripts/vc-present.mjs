#!/usr/bin/env node
// Create a Verifiable Presentation from wallet credentials
// Usage: node vc-present.mjs [--type AgentAuthorization] [--all] [wallet-path]
// Selects matching credentials and wraps them in a signed VP

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Parse args
const args = process.argv.slice(2);
let filterType = null;
let showAll = false;
let walletPath = process.env.WALLET_PATH || join(process.env.OPENCLAW_WORKSPACE || '/home/node/.openclaw/workspace', 'wallet');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' && args[i+1]) { filterType = args[++i]; }
  else if (args[i] === '--all') { showAll = true; }
  else if (!args[i].startsWith('-')) { walletPath = args[i]; }
}

// Load identity
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));
const credDir = join(walletPath, 'credentials');

if (!existsSync(credDir)) {
  console.error('No credentials directory found');
  process.exit(1);
}

// Load matching credentials
const credFiles = readdirSync(credDir).filter(f => f.endsWith('.json'));
let credentials = credFiles.map(f => JSON.parse(readFileSync(join(credDir, f), 'utf8')));

if (filterType) {
  credentials = credentials.filter(vc => vc.type?.includes(filterType));
}

if (credentials.length === 0) {
  console.error('No matching credentials found' + (filterType ? ` for type "${filterType}"` : ''));
  process.exit(1);
}

// Build VP
const pubBytes = Identifier.decode(identity.did).genesisBytes;
const secretBytes = new Uint8Array(Buffer.from(identity.secretKeyHex, 'hex'));
const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: identity.did, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

const vp = {
  '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
  id: `urn:uuid:${randomUUID()}`,
  type: ['VerifiablePresentation'],
  holder: identity.did,
  verifiableCredential: credentials
};

const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: identity.did + '#initialKey',
  proofPurpose: 'authentication',
  created: new Date().toISOString()
};

const signedVp = diProof.addProof(vp, proofConfig);

// Save to presentations
const presDir = join(walletPath, 'presentations');
mkdirSync(presDir, { recursive: true });
writeFileSync(join(presDir, `vp-${Date.now()}.json`), JSON.stringify(signedVp, null, 2));

console.log(JSON.stringify(signedVp, null, 2));
