#!/usr/bin/env node
// Display wallet info
// Usage: node info.mjs [wallet-path]

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const walletPath = process.argv[2] || process.env.WALLET_PATH;

if (!existsSync(join(walletPath, 'identity.json'))) {
  console.error('No wallet found at', walletPath);
  process.exit(1);
}

const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));

const credDir = join(walletPath, 'credentials');
const contactDir = join(walletPath, 'contacts');
const credentials = existsSync(credDir) ? readdirSync(credDir).filter(f => f.endsWith('.json')) : [];
const contacts = existsSync(contactDir) ? readdirSync(contactDir).filter(f => f.endsWith('.json')) : [];

const info = {
  did: identity.did,
  name: identity.name,
  network: identity.network,
  created: identity.created,
  publicKeyMultibase: identity.publicKeyMultibase,
  credentials: credentials.length,
  contacts: contacts.length,
  walletPath
};

console.log(JSON.stringify(info, null, 2));
