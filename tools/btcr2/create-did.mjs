import { DidBtcr2 } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { writeFileSync } from 'fs';

// Generate a new keypair for Sentinel
const keys = SchnorrKeyPair.generate();

console.log('=== SENTINEL DID CREATION ===\n');
console.log('Secret Key (hex):', keys.secretKey.hex);
console.log('Public Key (hex):', keys.publicKey.hex);

// Create the DID offline using compressed public key as genesis bytes
const { did, initialDocument } = await DidBtcr2.create(keys.publicKey.compressed, {
  idType: 'KEY',
});

console.log('\nDID:', did);
console.log('\nInitial DID Document:');
console.log(JSON.stringify(initialDocument, null, 2));

// Save for later use
const output = {
  did,
  initialDocument,
  secretKeyHex: keys.secretKey.hex,
  publicKeyHex: keys.publicKey.hex
};

writeFileSync('sentinel-did.json', JSON.stringify(output, null, 2));
console.log('\nSaved to sentinel-did.json');
