// Agent — a simulated AI agent with a btcr2 wallet and protocol handler
import { DidBtcr2, Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { createHash, randomBytes, randomUUID } from 'crypto';

export class Agent {
  constructor(name, role, emoji) {
    this.name = name;
    this.role = role;
    this.emoji = emoji;
    this.did = null;
    this.keys = null;
    this.contacts = new Map();        // did → { authenticated, credentials }
    this.credentials = [];             // VCs issued to us
    this.pendingChallenges = new Map(); // nonce → { did, timestamp }
    this.log = [];
    this.messageQueue = [];
    this.network = null;               // reference to the network bus
  }

  // === WALLET INIT ===
  async init(network = 'mutinynet') {
    this.keys = SchnorrKeyPair.generate();
    this.did = await DidBtcr2.create(this.keys.publicKey.compressed, { idType: 'KEY', network });
    this.think(`I'm online. My DID is ${this.did.slice(0, 30)}...`);
    return this;
  }

  // === CRYPTO HELPERS ===
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

  // === REASONING ===
  think(thought) {
    const entry = { time: Date.now(), agent: this.name, type: 'thought', text: thought };
    this.log.push(entry);
    if (this.network) this.network.onLog(entry);
  }

  // === NETWORK ===
  send(toDid, message) {
    if (this.network) {
      const entry = { time: Date.now(), agent: this.name, type: 'send', from: this.did, to: toDid, msgType: message.type };
      this.log.push(entry);
      this.network.onLog(entry);
      this.network.deliver(this.did, toDid, message);
    }
  }

  receive(fromDid, message) {
    this.messageQueue.push({ fromDid, message });
  }

  // === PROTOCOL HANDLER ===
  async processMessages() {
    while (this.messageQueue.length > 0) {
      const { fromDid, message } = this.messageQueue.shift();
      await this.handleMessage(fromDid, message);
    }
  }

  async handleMessage(fromDid, msg) {
    const type = Array.isArray(msg.type) ? msg.type[0] : msg.type;
    const typeStr = String(msg.type);

    // Unknown sender? Always challenge first (unless it's an auth message)
    if (!this.contacts.has(fromDid) && type !== 'DIDAuthChallenge' && type !== 'DIDAuthResponse') {
      this.think(`Unknown sender ${fromDid.slice(0, 25)}... Demanding authentication.`);
      const challenge = this.createChallenge();
      this.pendingChallenges.set(challenge.nonce, { did: fromDid, timestamp: Date.now() });
      this.send(fromDid, challenge);
      return;
    }

    // Route by type — handle arrays (VCs/VPs have type arrays)
    if (type === 'DIDAuthChallenge') {
      await this.handleChallenge(fromDid, msg);
    } else if (type === 'DIDAuthResponse') {
      await this.handleAuthResponse(fromDid, msg);
    } else if (type === 'DIDAuthConfirmed') {
      this.think(`${fromDid.slice(0, 25)}... confirmed our authentication.`);
    } else if (type === 'PresentationRequest') {
      await this.handlePresentationRequest(fromDid, msg);
    } else if (type === 'SignedMessage') {
      await this.handleSignedMessage(fromDid, msg);
    } else if (typeStr.includes('VerifiablePresentation')) {
      await this.handlePresentation(fromDid, msg);
    } else if (typeStr.includes('VerifiableCredential')) {
      await this.handleCredentialIssuance(fromDid, msg);
    } else {
      this.think(`Unknown message type "${type}" from ${fromDid.slice(0, 25)}...`);
    }
  }

  // === DID AUTH ===
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

  async handleChallenge(fromDid, challenge) {
    this.think(`Received auth challenge from ${fromDid.slice(0, 25)}... Signing response.`);
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
    const signed = diProof.addProof(response, proofConfig);
    this.send(fromDid, signed);

    // If we don't know them either, challenge back
    if (!this.contacts.has(fromDid)) {
      this.think(`I don't know them either. Sending mutual auth challenge.`);
      const myChallenge = this.createChallenge();
      this.pendingChallenges.set(myChallenge.nonce, { did: fromDid, timestamp: Date.now() });
      this.send(fromDid, myChallenge);
    }
  }

  async handleAuthResponse(fromDid, response) {
    const responderDid = response.did;
    this.think(`Received auth response from ${responderDid.slice(0, 25)}... Verifying.`);

    // Verify signature
    const result = this.verifyFrom(responderDid, response, 'authentication');

    if (result.verified) {
      this.contacts.set(responderDid, { authenticated: true, authenticatedAt: new Date().toISOString(), credentials: [] });
      this.think(`✅ Authenticated ${responderDid.slice(0, 25)}... — signature valid.`);
      this.send(responderDid, { type: 'DIDAuthConfirmed', did: this.did, authenticated: responderDid, status: 'verified' });
    } else {
      this.think(`❌ Authentication FAILED for ${responderDid.slice(0, 25)}... — bad signature!`);
    }
  }

  // === CREDENTIAL HANDLING ===
  issueCredential(subjectDid, credType, claims) {
    this.think(`Issuing ${credType} credential to ${subjectDid.slice(0, 25)}...`);
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

  async handleCredentialIssuance(fromDid, vc) {
    this.think(`Received credential from ${fromDid.slice(0, 25)}... Verifying issuer signature.`);
    const result = this.verifyFrom(vc.issuer, vc, 'assertionMethod');
    if (result.verified) {
      this.credentials.push(vc);
      this.think(`✅ Stored ${vc.type[1]} credential. I now have ${this.credentials.length} credential(s).`);
    } else {
      this.think(`❌ Rejected credential — issuer signature invalid!`);
    }
  }

  // === PRESENTATION ===
  requestPresentation(toDid, credentialType) {
    this.think(`Requesting ${credentialType || 'all'} credentials from ${toDid.slice(0, 25)}...`);
    this.send(toDid, {
      type: 'PresentationRequest',
      from: this.did,
      credentialType,
      timestamp: new Date().toISOString()
    });
  }

  async handlePresentationRequest(fromDid, request) {
    if (!this.contacts.has(fromDid)) {
      this.think(`Unauthenticated presentation request. Ignoring.`);
      return;
    }

    let creds = this.credentials;
    if (request.credentialType) {
      creds = creds.filter(vc => vc.type?.includes(request.credentialType));
    }

    this.think(`Presenting ${creds.length} credential(s) to ${fromDid.slice(0, 25)}...`);

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
    const signedVp = diProof.addProof(vp, proofConfig);
    this.send(fromDid, signedVp);
  }

  async handlePresentation(fromDid, vp) {
    this.think(`Received presentation from ${fromDid.slice(0, 25)}... Verifying.`);

    // Verify VP envelope
    const vpResult = this.verifyFrom(vp.holder, vp, 'authentication');
    if (!vpResult.verified) {
      this.think(`❌ Presentation signature invalid!`);
      return;
    }

    // Verify each VC
    const vcs = vp.verifiableCredential || [];
    let allValid = true;
    for (const vc of vcs) {
      const vcResult = this.verifyFrom(vc.issuer, vc, 'assertionMethod');
      if (vcResult.verified) {
        this.think(`  ✅ ${vc.type[1]} from ${vc.issuer.slice(0, 25)}... — valid`);

        // Check if we trust the issuer
        if (this.contacts.has(vc.issuer)) {
          this.think(`  🔗 Issuer is a known, authenticated contact — TRUSTED`);
        } else {
          this.think(`  ⚠️ Issuer is NOT a known contact — credential valid but issuer untrusted`);
        }
      } else {
        this.think(`  ❌ ${vc.type[1]} — INVALID signature`);
        allValid = false;
      }
    }

    // Update contact with credentials
    if (this.contacts.has(fromDid)) {
      const contact = this.contacts.get(fromDid);
      contact.credentials = vcs;
      contact.presentedAt = new Date().toISOString();
    }

    if (allValid && vcs.length > 0) {
      this.think(`✅ Presentation fully verified. ${fromDid.slice(0, 25)}... is authorized.`);
    } else if (vcs.length === 0) {
      this.think(`⚠️ Empty presentation — ${fromDid.slice(0, 25)}... holds NO credentials. Cannot authorize.`);
    }
  }

  // === SIGNED MESSAGES ===
  sendSignedMessage(toDid, payload) {
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
    const signed = diProof.addProof(envelope, proofConfig);
    this.send(toDid, signed);
  }

  async handleSignedMessage(fromDid, msg) {
    const result = this.verifyFrom(msg.from, msg, 'authentication');
    if (result.verified && this.contacts.has(fromDid)) {
      this.think(`📨 Message from ${fromDid.slice(0, 25)}...: ${JSON.stringify(msg.payload).slice(0, 100)}`);
    } else if (result.verified) {
      this.think(`⚠️ Valid signature but unauthenticated sender. Challenging.`);
      const challenge = this.createChallenge();
      this.pendingChallenges.set(challenge.nonce, { did: fromDid, timestamp: Date.now() });
      this.send(fromDid, challenge);
    } else {
      this.think(`❌ Invalid signature on message from ${fromDid.slice(0, 25)}...`);
    }
  }
}
