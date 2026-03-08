#!/usr/bin/env node
// Generate a DID Auth challenge for a remote agent
// Usage: node did-auth-challenge.mjs [wallet-path]
// Outputs a challenge JSON that must be signed by the remote agent

import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const walletPath = process.argv[2] || process.env.WALLET_PATH;
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));

const challenge = {
  type: 'DIDAuthChallenge',
  challenger: identity.did,
  nonce: randomBytes(32).toString('hex'),
  timestamp: new Date().toISOString(),
  domain: identity.did
};

console.log(JSON.stringify(challenge, null, 2));
