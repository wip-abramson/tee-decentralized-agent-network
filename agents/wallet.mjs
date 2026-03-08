// Wallet — in-memory btcr2 identity + crypto operations for a single agent
// Used by the tool definitions to perform real cryptographic operations

import { DidBtcr2, Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { randomBytes, randomUUID } from 'crypto';

export class Wallet {
  constructor(name) {
    this.name = name;
    this.did = null;
    this.keys = null;
    this.contacts = new Map();          // did → { authenticated, authenticatedAt }
    this.credentials = [];               // VCs issued to us
    this.pendingChallenges = new Map();   // nonce → { timestamp }
    this.usedNonces = new Set();
  }

  async init(network = 'mutinynet') {
    this.keys = SchnorrKeyPair.generate();
    this.did = await DidBtcr2.create(this.keys.publicKey.compressed, { idType: 'KEY', network });
    return this;
  }

  getSigningTools() {
    const pubBytes = Identifier.decode(this.did).genesisBytes;
    const secretBytes = new Uint8Array(Buffer.from(this.keys.secretKey.hex, 'hex'));
    const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });
    const multikey = new SchnorrMultikey({ id: '#initialKey', controller: this.did, keyPair });
    return new BIP340DataIntegrityProof(multikey.toCryptosuite());
  }

  verifyFrom(did, document, purpose) {
    const decoded = Identifier.decode(did);
    const keyPair = new SchnorrKeyPair({ publicKey: decoded.genesisBytes });
    const multikey = new SchnorrMultikey({ id: '#initialKey', controller: did, keyPair });
    const diProof = new BIP340DataIntegrityProof(multikey.toCryptosuite());
    return diProof.verifyProof(JSON.stringify(document), purpose);
  }

  // --- DID Auth ---

  createChallenge() {
    const challenge = {
      type: 'DIDAuthChallenge',
      challenger: this.did,
      nonce: randomBytes(32).toString('hex'),
      timestamp: new Date().toISOString(),
      domain: this.did
    };
    this.pendingChallenges.set(challenge.nonce, { timestamp: Date.now() });
    return challenge;
  }

  signChallenge(challenge) {
    const diProof = this.getSigningTools();
    const response = {
      type: 'DIDAuthResponse',
      did: this.did,
      challenge
    };
    const proofConfig = {
      type: 'DataIntegrityProof',
      cryptosuite: 'bip340-jcs-2025',
      verificationMethod: this.did + '#initialKey',
      proofPurpose: 'authentication',
      created: new Date().toISOString(),
      challenge: challenge.nonce,
      domain: challenge.domain
    };
    return diProof.addProof(response, proofConfig);
  }

  verifyAuthResponse(response) {
    const nonce = response.challenge?.nonce;

    if (nonce && this.usedNonces.has(nonce)) {
      return { verified: false, error: 'replay-detected', detail: 'Nonce already consumed' };
    }
    if (nonce && !this.pendingChallenges.has(nonce)) {
      return { verified: false, error: 'unknown-nonce', detail: 'Not a response to any challenge we issued' };
    }

    const result = this.verifyFrom(response.did, response, 'authentication');

    if (result.verified && nonce) {
      this.pendingChallenges.delete(nonce);
      this.usedNonces.add(nonce);
      this.contacts.set(response.did, { authenticated: true, authenticatedAt: new Date().toISOString() });
    }

    return { verified: result.verified, did: response.did, nonce };
  }

  // --- Credentials ---

  issueCredential(subjectDid, credType, claims) {
    const diProof = this.getSigningTools();
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiableCredential', credType],
      issuer: this.did,
      issuanceDate: new Date().toISOString(),
      credentialSubject: { id: subjectDid, ...claims }
    };
    const proofConfig = {
      type: 'DataIntegrityProof',
      cryptosuite: 'bip340-jcs-2025',
      verificationMethod: this.did + '#initialKey',
      proofPurpose: 'assertionMethod',
      created: new Date().toISOString()
    };
    return diProof.addProof(vc, proofConfig);
  }

  storeCredential(vc) {
    const result = this.verifyFrom(vc.issuer, vc, 'assertionMethod');
    if (result.verified) {
      this.credentials.push(vc);
      return { stored: true, type: vc.type, issuer: vc.issuer };
    }
    return { stored: false, error: 'Invalid issuer signature' };
  }

  createPresentation(credentialType) {
    let creds = this.credentials;
    if (credentialType) {
      creds = creds.filter(vc => vc.type?.includes(credentialType));
    }

    const diProof = this.getSigningTools();
    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
      type: ['VerifiablePresentation'],
      holder: this.did,
      verifiableCredential: creds
    };
    const proofConfig = {
      type: 'DataIntegrityProof',
      cryptosuite: 'bip340-jcs-2025',
      verificationMethod: this.did + '#initialKey',
      proofPurpose: 'authentication',
      created: new Date().toISOString()
    };
    return diProof.addProof(vp, proofConfig);
  }

  verifyPresentation(vp) {
    const vpResult = this.verifyFrom(vp.holder, vp, 'authentication');
    if (!vpResult.verified) {
      return { verified: false, error: 'Presentation envelope signature invalid' };
    }

    const vcs = vp.verifiableCredential || [];
    const results = vcs.map(vc => {
      const vcResult = this.verifyFrom(vc.issuer, vc, 'assertionMethod');
      return {
        type: vc.type,
        issuer: vc.issuer,
        verified: vcResult.verified,
        trustedIssuer: this.contacts.has(vc.issuer)
      };
    });

    return {
      verified: true,
      holder: vp.holder,
      credentials: results,
      allValid: results.every(r => r.verified),
      allTrusted: results.every(r => r.trustedIssuer)
    };
  }

  // --- Signed Messages ---

  signMessage(payload) {
    const diProof = this.getSigningTools();
    const envelope = {
      '@context': ['https://btcr2.dev/context/v1'],
      type: 'SignedMessage',
      from: this.did,
      timestamp: new Date().toISOString(),
      payload
    };
    const proofConfig = {
      type: 'DataIntegrityProof',
      cryptosuite: 'bip340-jcs-2025',
      verificationMethod: this.did + '#initialKey',
      proofPurpose: 'authentication',
      created: new Date().toISOString()
    };
    return diProof.addProof(envelope, proofConfig);
  }

  verifySignedMessage(msg) {
    const result = this.verifyFrom(msg.from, msg, 'authentication');
    return {
      verified: result.verified,
      from: msg.from,
      isContact: this.contacts.has(msg.from),
      payload: msg.payload
    };
  }

  // --- State ---

  getState() {
    return {
      did: this.did,
      name: this.name,
      contacts: [...this.contacts.entries()].map(([did, c]) => ({
        did: did.slice(0, 30) + '...',
        ...c
      })),
      credentialsHeld: this.credentials.map(vc => ({
        type: vc.type,
        issuer: vc.issuer.slice(0, 30) + '...'
      })),
      pendingChallenges: this.pendingChallenges.size
    };
  }
}
