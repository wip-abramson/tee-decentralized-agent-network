#!/usr/bin/env node
// Store a received VC in your wallet
// Usage: node vc-store.mjs <vc-json-or-file> [wallet-path]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const vcArg = process.argv[2];
const walletPath = process.argv[3] || process.env.WALLET_PATH;

if (!vcArg) {
  console.error('Usage: node vc-store.mjs <vc-json-or-file> [wallet-path]');
  process.exit(1);
}

const vc = existsSync(vcArg) ? JSON.parse(readFileSync(vcArg, 'utf8')) : JSON.parse(vcArg);

// Verify this VC is for us
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));
if (vc.credentialSubject?.id !== identity.did) {
  console.error('Warning: This VC subject does not match your DID');
  console.error('  VC subject:', vc.credentialSubject?.id);
  console.error('  Your DID:', identity.did);
}

// Store
const credDir = join(walletPath, 'credentials');
mkdirSync(credDir, { recursive: true });
const filename = `${(vc.type?.[1] || 'vc').toLowerCase()}-${Date.now()}.json`;
writeFileSync(join(credDir, filename), JSON.stringify(vc, null, 2));

console.log(JSON.stringify({ stored: filename, type: vc.type, issuer: vc.issuer }, null, 2));
