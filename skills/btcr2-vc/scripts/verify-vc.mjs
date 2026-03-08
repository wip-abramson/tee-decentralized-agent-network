#!/usr/bin/env node
// Verify a signed Verifiable Credential using DID resolution
// Usage: node verify-vc.mjs <signed-vc-json-file-or-stdin>
// Resolves the issuer DID, extracts the public key, verifies the Data Integrity proof

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync } from 'fs';

// Read VC from file arg or stdin
let vcJson;
if (process.argv[2]) {
  vcJson = readFileSync(process.argv[2], 'utf8');
} else {
  vcJson = readFileSync('/dev/stdin', 'utf8');
}

const signedVc = JSON.parse(vcJson);

// Step 1: Resolve the issuer DID
const issuerDid = signedVc.issuer;
const decoded = Identifier.decode(issuerDid);

console.error('Resolving:', issuerDid);
console.error('Network:', decoded.network);
console.error('ID Type:', decoded.idType);

// Step 2: Extract public key and build multikey
const keyPair = new SchnorrKeyPair({ publicKey: decoded.genesisBytes });
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: issuerDid, keyPair });
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

// Step 3: Verify
const result = diProof.verifyProof(JSON.stringify(signedVc), 'assertionMethod');

const output = {
  verified: result.verified,
  issuer: issuerDid,
  subject: signedVc.credentialSubject?.id,
  network: decoded.network,
  proofCryptosuite: signedVc.proof?.cryptosuite
};

console.log(JSON.stringify(output, null, 2));
process.exit(result.verified ? 0 : 1);
