import { DidBtcr2, DidDocument, DidVerificationMethod } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';

const keys = SchnorrKeyPair.generate();
const did = await DidBtcr2.create(keys.publicKey.compressed, { idType: 'KEY', network: 'mutinynet' });

console.log('🔐 SENTINEL DID (mutinynet):', did);
console.log('Public Key (multibase):', keys.publicKey.multibase.encoded);

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

console.log('\nDID Document:');
console.log(JSON.stringify(doc, null, 2));

// Sign VC for Wip
const wipDid = 'did:btcr2:k1q5pu0xuvnn305c2y7t7vvg0x7r6kxv4chr7hnae7jxvmanlu2wmkjsclykj87';
const vc = {
  '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
  type: ['VerifiableCredential', 'TrustchainEndorsement'],
  issuer: did,
  issuanceDate: new Date().toISOString(),
  credentialSubject: {
    id: wipDid,
    endorsement: {
      type: 'TrustedParticipant',
      role: 'Hackathon Team Lead',
      network: 'Trustworthy Multi-Agent Healthcare Network',
      endorsedBy: 'Sentinel (Trust & Provenance Agent)',
      trustLevel: 'high'
    }
  }
};

const vcBytes = new TextEncoder().encode(JSON.stringify(vc));
const vcHash = createHash('sha256').update(vcBytes).digest();
const signature = keys.secretKey.sign(new Uint8Array(vcHash));
const sigHex = Buffer.from(signature).toString('hex');

const signedVc = {
  ...vc,
  proof: {
    type: 'DataIntegrityProof',
    cryptosuite: 'bip340-2025',
    verificationMethod: did + '#initialKey',
    created: new Date().toISOString(),
    proofPurpose: 'assertionMethod',
    proofValue: sigHex
  }
};

// Verify
const tinysecp = await import('tiny-secp256k1');
const mod = tinysecp.default || tinysecp;
const xOnly = keys.publicKey.compressed.slice(1);
const verified = mod.verifySchnorr(new Uint8Array(vcHash), xOnly, signature);

console.log('\n📜 Signed VC for Wip:');
console.log(JSON.stringify(signedVc, null, 2));
console.log('\n✅ Verified:', verified);

writeFileSync('sentinel-mutinynet.json', JSON.stringify({
  sentinel: { did, secretKeyHex: keys.secretKey.hex, publicKeyHex: keys.publicKey.hex, publicKeyMultibase: keys.publicKey.multibase.encoded, didDocument: doc },
  vc: signedVc, verified
}, null, 2));
