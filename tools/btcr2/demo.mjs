import { DidBtcr2, DidDocument, DidVerificationMethod } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';

// ============================================================
// STEP 1: Create Sentinel's DID
// ============================================================
const sentinelKeys = SchnorrKeyPair.generate();
const sentinelDid = await DidBtcr2.create(sentinelKeys.publicKey.compressed, { idType: 'KEY' });

const sentinelVm = new DidVerificationMethod({
  id: sentinelDid + '#initialKey',
  type: 'Multikey',
  controller: sentinelDid,
  publicKeyMultibase: sentinelKeys.publicKey.multibase
});

const sentinelDoc = new DidDocument({
  id: sentinelDid,
  controller: [sentinelDid],
  verificationMethod: [sentinelVm],
  authentication: [sentinelDid + '#initialKey'],
  assertionMethod: [sentinelDid + '#initialKey'],
  capabilityInvocation: [sentinelDid + '#initialKey'],
  capabilityDelegation: [sentinelDid + '#initialKey'],
  service: [{
    id: sentinelDid + '#beacon-0',
    type: 'SingletonBeacon',
    serviceEndpoint: 'bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
  }]
});

console.log('=== 🔐 SENTINEL DID ===');
console.log('DID:', sentinelDid);
console.log('Public Key:', sentinelKeys.publicKey.hex);
console.log('Public Key (multibase):', sentinelKeys.publicKey.multibase.encoded);
console.log('\nDID Document:');
console.log(JSON.stringify(sentinelDoc, null, 2));

// ============================================================
// STEP 2: Create and sign a VC for Wip
// ============================================================
const wipDid = 'did:btcr2:k1q5pu0xuvnn305c2y7t7vvg0x7r6kxv4chr7hnae7jxvmanlu2wmkjsclykj87';

const vc = {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://btcr2.dev/context/v1'
  ],
  type: ['VerifiableCredential', 'TrustchainEndorsement'],
  issuer: sentinelDid,
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

// Sign the VC with Sentinel's Schnorr key
// Canonical JSON → SHA256 → Schnorr sign
const vcBytes = new TextEncoder().encode(JSON.stringify(vc));
const vcHash = createHash('sha256').update(vcBytes).digest();

const signature = sentinelKeys.secretKey.sign(new Uint8Array(vcHash));
console.log('\n=== ✍️ SIGNATURE ===');
console.log('Signature type:', typeof signature);
console.log('Signature:', signature);

// Check what sign returns
let sigHex;
if (signature instanceof Uint8Array || Buffer.isBuffer(signature)) {
  sigHex = Buffer.from(signature).toString('hex');
} else if (signature && signature.hex) {
  sigHex = signature.hex;
} else if (signature && signature.bytes) {
  sigHex = Buffer.from(signature.bytes).toString('hex');
} else {
  sigHex = String(signature);
}

// Add proof to VC
const signedVc = {
  ...vc,
  proof: {
    type: 'DataIntegrityProof',
    cryptosuite: 'bip340-2025',
    verificationMethod: sentinelDid + '#initialKey',
    created: new Date().toISOString(),
    proofPurpose: 'assertionMethod',
    proofValue: sigHex
  }
};

console.log('\n=== 📜 VERIFIABLE CREDENTIAL (for Wip) ===');
console.log(JSON.stringify(signedVc, null, 2));

// ============================================================
// STEP 3: Verify the signature
// ============================================================
// Schnorr verification uses x-only (32-byte) public key
let verified;
try {
  verified = sentinelKeys.publicKey.verify(vcHash, signature);
} catch(e1) {
  try {
    // Try with xOnly key
    const xOnly = sentinelKeys.publicKey.xOnly || sentinelKeys.publicKey.bip340;
    const tinysecp = await import('tiny-secp256k1');
    verified = tinysecp.default
      ? tinysecp.default.verifySchnorr(vcHash, xOnly, signature)
      : tinysecp.verifySchnorr(vcHash, xOnly, signature);
  } catch(e2) {
    console.log('Verify attempt 2 error:', e2.message);
    // Try raw secp256k1
    try {
      const tinysecp = (await import('tiny-secp256k1'));
      const mod = tinysecp.default || tinysecp;
      const xOnly = sentinelKeys.publicKey.xOnly || sentinelKeys.publicKey.compressed.slice(1);
      verified = mod.verifySchnorr(new Uint8Array(vcHash), xOnly, signature);
    } catch(e3) {
      console.log('Verify attempt 3 error:', e3.message);
      verified = 'verification call failed - see errors above';
    }
  }
}
console.log('\n=== ✅ VERIFICATION ===');
console.log('Signature valid:', verified);

// Save everything
const output = {
  sentinel: {
    did: sentinelDid,
    secretKeyHex: sentinelKeys.secretKey.hex,
    publicKeyHex: sentinelKeys.publicKey.hex,
    publicKeyMultibase: sentinelKeys.publicKey.multibase.encoded,
    didDocument: sentinelDoc
  },
  vc: signedVc,
  verified
};

writeFileSync('demo-output.json', JSON.stringify(output, null, 2));
console.log('\nAll output saved to demo-output.json');
