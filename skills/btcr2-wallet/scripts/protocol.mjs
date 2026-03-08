#!/usr/bin/env node
// Protocol handler — processes incoming messages and returns appropriate responses
// Usage: node protocol.mjs <incoming-message-json-or-file> [wallet-path]
//
// Behavior:
//   Unknown sender (not in contacts) → auto-generate DIDAuthChallenge, reject message
//   DIDAuthChallenge → auto-respond with signed proof
//   DIDAuthResponse → verify, save contact, confirm
//   PresentationRequest → select VCs, return VP
//   SignedMessage from known contact → verify sig, return payload
//   SignedMessage from unknown → reject, demand auth
//   Anything unsigned → reject

import { Identifier } from '@did-btcr2/method';
import { SchnorrKeyPair } from '@did-btcr2/keypair';
import { BIP340DataIntegrityProof, SchnorrMultikey } from '@did-btcr2/cryptosuite';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes, randomUUID } from 'crypto';

const msgArg = process.argv[2];
const walletPath = process.argv[3] || process.env.WALLET_PATH || join(process.env.OPENCLAW_WORKSPACE || '/home/node/.openclaw/workspace', 'wallet');

if (!msgArg) {
  console.error('Usage: node protocol.mjs <message-json-or-file> [wallet-path]');
  process.exit(1);
}

const msg = existsSync(msgArg) ? JSON.parse(readFileSync(msgArg, 'utf8')) : JSON.parse(msgArg);
const identity = JSON.parse(readFileSync(join(walletPath, 'identity.json'), 'utf8'));

// Helper: build our signing tools
function getSigningTools() {
  const pubBytes = Identifier.decode(identity.did).genesisBytes;
  const secretBytes = new Uint8Array(Buffer.from(identity.secretKeyHex, 'hex'));
  const keyPair = new SchnorrKeyPair({ publicKey: pubBytes, secretKey: secretBytes });
  const multikey = new SchnorrMultikey({ id: '#initialKey', controller: identity.did, keyPair });
  const cryptosuite = multikey.toCryptosuite();
  return new BIP340DataIntegrityProof(cryptosuite);
}

// Helper: verify a signed document from a DID
function verifyFrom(did, document, purpose) {
  const decoded = Identifier.decode(did);
  const keyPair = new SchnorrKeyPair({ publicKey: decoded.genesisBytes });
  const multikey = new SchnorrMultikey({ id: '#initialKey', controller: did, keyPair });
  const cryptosuite = multikey.toCryptosuite();
  const diProof = new BIP340DataIntegrityProof(cryptosuite);
  return diProof.verifyProof(JSON.stringify(document), purpose);
}

// Helper: check if DID is a known authenticated contact
function isKnownContact(did) {
  const contactFile = join(walletPath, 'contacts', did.replace(/:/g, '_') + '.json');
  return existsSync(contactFile);
}

// Helper: save contact
function saveContact(did, extra = {}) {
  const contactDir = join(walletPath, 'contacts');
  mkdirSync(contactDir, { recursive: true });
  const contactFile = join(contactDir, did.replace(/:/g, '_') + '.json');
  const decoded = Identifier.decode(did);
  const contact = {
    did,
    network: decoded.network,
    publicKeyHex: Buffer.from(decoded.genesisBytes).toString('hex'),
    authenticatedAt: new Date().toISOString(),
    ...extra
  };
  writeFileSync(contactFile, JSON.stringify(contact, null, 2));
}

// Helper: generate a challenge
function generateChallenge() {
  return {
    type: 'DIDAuthChallenge',
    challenger: identity.did,
    nonce: randomBytes(32).toString('hex'),
    timestamp: new Date().toISOString(),
    domain: identity.did
  };
}

// Helper: log to history
function logHistory(action, data) {
  const histDir = join(walletPath, 'history');
  mkdirSync(histDir, { recursive: true });
  writeFileSync(join(histDir, `${action}-${Date.now()}.json`), JSON.stringify({
    action, timestamp: new Date().toISOString(), ...data
  }, null, 2));
}

// ==========================================
// PROTOCOL DISPATCH
// ==========================================

const msgType = msg.type;
let response;

if (msgType === 'DIDAuthChallenge') {
  // Someone is challenging us — auto-respond
  const diProof = getSigningTools();
  const authResponse = {
    type: 'DIDAuthResponse',
    did: identity.did,
    challenge: msg
  };
  const proofConfig = {
    type: 'DataIntegrityProof',
    cryptosuite: 'bip340-jcs-2025',
    verificationMethod: identity.did + '#initialKey',
    proofPurpose: 'authentication',
    created: new Date().toISOString(),
    challenge: msg.nonce,
    domain: msg.domain
  };
  response = diProof.addProof(authResponse, proofConfig);
  logHistory('auth-responded', { challenger: msg.challenger });

} else if (msgType === 'DIDAuthResponse') {
  // Someone responded to our challenge — verify
  const responderDid = msg.did;
  const result = verifyFrom(responderDid, msg, 'authentication');

  if (result.verified) {
    saveContact(responderDid, { lastChallenge: msg.challenge?.nonce });
    logHistory('auth-verified', { did: responderDid });
    response = {
      type: 'DIDAuthConfirmed',
      did: identity.did,
      authenticated: responderDid,
      status: 'verified'
    };
  } else {
    response = {
      type: 'DIDAuthRejected',
      did: identity.did,
      rejected: responderDid,
      reason: 'signature verification failed'
    };
  }

} else if (msgType === 'PresentationRequest') {
  // Someone wants our credentials
  const requesterDid = msg.from || msg.requester;

  if (!requesterDid || !isKnownContact(requesterDid)) {
    response = {
      type: 'ProtocolError',
      error: 'UNAUTHENTICATED',
      message: 'You must authenticate via DID Auth before requesting credentials',
      challenge: generateChallenge()
    };
  } else {
    // Build VP from wallet credentials
    const credDir = join(walletPath, 'credentials');
    let credentials = [];
    if (existsSync(credDir)) {
      const files = readdirSync(credDir).filter(f => f.endsWith('.json'));
      credentials = files.map(f => JSON.parse(readFileSync(join(credDir, f), 'utf8')));
      // Filter by requested type if specified
      if (msg.credentialType) {
        credentials = credentials.filter(vc => vc.type?.includes(msg.credentialType));
      }
    }

    const diProof = getSigningTools();
    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1', 'https://btcr2.dev/context/v1'],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiablePresentation'],
      holder: identity.did,
      verifiableCredential: credentials
    };
    const proofConfig = {
      type: 'DataIntegrityProof',
      cryptosuite: 'bip340-jcs-2025',
      verificationMethod: identity.did + '#initialKey',
      proofPurpose: 'authentication',
      created: new Date().toISOString()
    };
    response = diProof.addProof(vp, proofConfig);
    logHistory('presented', { to: requesterDid, credentialCount: credentials.length });
  }

} else if (msgType === 'SignedMessage') {
  // A regular signed message — verify signature + check contact
  const senderDid = msg.from;

  if (!senderDid) {
    response = { type: 'ProtocolError', error: 'NO_SENDER', message: 'Message has no "from" DID' };
  } else if (!isKnownContact(senderDid)) {
    // Unknown sender — demand authentication first
    response = {
      type: 'ProtocolError',
      error: 'UNAUTHENTICATED',
      message: `Unknown sender ${senderDid}. Authentication required.`,
      challenge: generateChallenge()
    };
    logHistory('rejected-unauthenticated', { did: senderDid });
  } else {
    // Known contact — verify signature
    const result = verifyFrom(senderDid, msg, 'authentication');
    if (result.verified) {
      response = {
        type: 'MessageAccepted',
        from: senderDid,
        verified: true,
        payload: msg.payload
      };
      logHistory('message-accepted', { from: senderDid });
    } else {
      response = {
        type: 'ProtocolError',
        error: 'INVALID_SIGNATURE',
        message: 'Signature verification failed',
        did: senderDid
      };
      logHistory('message-rejected-bad-sig', { did: senderDid });
    }
  }

} else {
  // Unknown or unsigned message — reject and demand auth
  const senderDid = msg.from || msg.did;
  response = {
    type: 'ProtocolError',
    error: 'UNKNOWN_MESSAGE_TYPE',
    message: `Unrecognized message type "${msgType}". All messages must be signed.`,
    supportedTypes: ['DIDAuthChallenge', 'DIDAuthResponse', 'PresentationRequest', 'SignedMessage'],
    challenge: senderDid ? generateChallenge() : undefined
  };
}

console.log(JSON.stringify(response, null, 2));
