#!/usr/bin/env node
// Verify a VC or VP, resolving issuer/holder DIDs
// Usage: node vc-verify.mjs <vc-or-vp-json-or-file> [wallet-path]
// For VPs: verifies the presentation signature AND each contained VC

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const docArg = process.argv[2];
const walletPath = process.argv[3] || process.env.WALLET_PATH || join(process.env.OPENCLAW_WORKSPACE || '/home/node/.openclaw/workspace', 'wallet');

if (!docArg) {
  console.error('Usage: node vc-verify.mjs <vc-or-vp-json-or-file> [wallet-path]');
  process.exit(1);
}

const doc = existsSync(docArg) ? JSON.parse(readFileSync(docArg, 'utf8')) : JSON.parse(docArg);

function verifyDocument(document, expectedPurpose) {
  const did = document.issuer || document.holder;
  if (!did) return { verified: false, error: 'No issuer or holder DID found' };

  try {
    const decoded = Identifier.decode(did);
    const keyPair = new SchnorrKeyPair({ publicKey: decoded.genesisBytes });
    const multikey = new SchnorrMultikey({ id: '#initialKey', controller: did, keyPair });
    const cryptosuite = multikey.toCryptosuite();
    const diProof = new BIP340DataIntegrityProof(cryptosuite);
    const result = diProof.verifyProof(JSON.stringify(document), expectedPurpose);
    return {
      verified: result.verified,
      did,
      network: decoded.network,
      type: document.type
    };
  } catch (e) {
    return { verified: false, did, error: e.message };
  }
}

const isVP = doc.type?.includes('VerifiablePresentation');
const results = { type: isVP ? 'VerifiablePresentation' : 'VerifiableCredential' };

if (isVP) {
  // Verify the VP envelope
  results.presentation = verifyDocument(doc, 'authentication');

  // Verify each contained VC
  results.credentials = [];
  const vcs = doc.verifiableCredential || [];
  for (const vc of vcs) {
    results.credentials.push(verifyDocument(vc, 'assertionMethod'));
  }

  results.verified = results.presentation.verified && results.credentials.every(c => c.verified);
} else {
  // Single VC
  Object.assign(results, verifyDocument(doc, 'assertionMethod'));
}

// Save verification to history
if (existsSync(join(walletPath, 'identity.json'))) {
  const histDir = join(walletPath, 'history');
  mkdirSync(histDir, { recursive: true });
  writeFileSync(join(histDir, `verified-${Date.now()}.json`), JSON.stringify({
    action: 'verify',
    result: results.verified,
    did: results.did || results.presentation?.did,
    timestamp: new Date().toISOString()
  }, null, 2));
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.verified ? 0 : 1);
