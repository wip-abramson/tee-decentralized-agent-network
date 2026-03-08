import { DidBtcr2, DidDocument, DidVerificationMethod, Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, BIP340Cryptosuite, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { writeFileSync } from 'fs';

// === Create Sentinel DID on mutinynet ===
const keys = SchnorrKeyPair.generate();
const did = await DidBtcr2.create(keys.publicKey.compressed, { idType: 'KEY', network: 'mutinynet' });

console.log('🔐 Sentinel DID:', did);
console.log('   Public Key:', keys.publicKey.multibase.encoded);

// === Build SchnorrMultikey for signing ===
const multikey = new SchnorrMultikey({ id: '#initialKey', controller: did, keyPair: keys });

console.log('   Multikey ID:', multikey.fullId());

// === Build the VC ===
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

// === Sign with Data Integrity ===
const cryptosuite = multikey.toCryptosuite();
const diProof = new BIP340DataIntegrityProof(cryptosuite);

const proofConfig = {
  type: 'DataIntegrityProof',
  cryptosuite: 'bip340-jcs-2025',
  verificationMethod: did + '#initialKey',
  proofPurpose: 'assertionMethod',
  created: new Date().toISOString()
};

console.log('\n📝 Signing VC with BIP340DataIntegrityProof...');
const signedVc = diProof.addProof(vc, proofConfig);

console.log('\n📜 Signed VC:');
console.log(JSON.stringify(signedVc, null, 2));

// === Verify ===
console.log('\n🔍 Verifying...');
const isValid = diProof.verifyProof(JSON.stringify(signedVc), 'assertionMethod');
console.log('✅ Valid:', isValid);

writeFileSync('sentinel-proper.json', JSON.stringify({
  did, publicKey: keys.publicKey.multibase.encoded,
  secretKeyHex: keys.secretKey.hex,
  signedVc, verified: isValid
}, null, 2));
console.log('\nSaved to sentinel-proper.json');
