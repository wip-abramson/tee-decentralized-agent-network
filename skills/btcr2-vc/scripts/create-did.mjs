#!/usr/bin/env node
// Create a did:btcr2 DID on a specified network
// Usage: node create-did.mjs [network] [output-file]
// Networks: bitcoin, signet, regtest, testnet3, testnet4, mutinynet

import { DidBtcr2, DidDocument, DidVerificationMethod } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { writeFileSync } from 'fs';

const network = process.argv[2] || 'mutinynet';
const outputFile = process.argv[3] || 'did-output.json';

const keys = SchnorrKeyPair.generate();
const did = await DidBtcr2.create(keys.publicKey.compressed, { idType: 'KEY', network });

const vm = new DidVerificationMethod({
  id: did + '#initialKey',
  type: 'Multikey',
  controller: did,
  publicKeyMultibase: keys.publicKey.multibase
});

const doc = new DidDocument({
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

const output = {
  did,
  network,
  secretKeyHex: keys.secretKey.hex,
  publicKeyHex: keys.publicKey.hex,
  publicKeyMultibase: keys.publicKey.multibase.encoded,
  didDocument: doc
};

writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ did, network, publicKeyMultibase: output.publicKeyMultibase }, null, 2));
