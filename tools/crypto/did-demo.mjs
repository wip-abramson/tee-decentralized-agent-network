// Full DID Document demo with authentication flow
import { generateKeyPair, exportJWK, SignJWT, jwtVerify, importJWK } from 'jose';

async function main() {
  // ============================================
  // STEP 1: Generate Sentinel's keypair
  // ============================================
  console.log('=== STEP 1: Generate Sentinel\'s Keys ===\n');
  
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  const pubJWK = await exportJWK(publicKey);
  const privJWK = await exportJWK(privateKey);
  
  // In real Trustchain, this suffix comes from ION (Bitcoin-anchored)
  const didSuffix = 'EiBz4x9zy8Gk3KkV1FvFJgNfCOEzrDAqaIECw7VoXkXJnA';
  const did = `did:ion:${didSuffix}`;

  // ============================================
  // STEP 2: The DID Document
  // ============================================
  console.log('=== STEP 2: Sentinel\'s DID Document ===\n');
  
  const didDocument = {
    // The DID itself - globally unique identifier
    // In Trustchain, this is anchored to a Bitcoin transaction
    "id": did,
    
    // Who controls this DID (can update/deactivate it)
    "controller": did,

    // Verification Methods - the public keys associated with this DID
    // This is HOW other agents verify my signatures
    "verificationMethod": [
      {
        // Unique ID for this specific key
        "id": `${did}#key-1`,
        // Which DID this key belongs to
        "controller": did,
        // Key type
        "type": "JsonWebKey2020",
        // The actual public key (ONLY public - private never leaves the agent)
        "publicKeyJwk": {
          "kty": pubJWK.kty,    // "OKP" (Octet Key Pair)
          "crv": pubJWK.crv,    // "Ed25519"
          "x": pubJWK.x         // The public key bytes (base64url)
          // NOTE: no "d" field - that's the private key, never shared
        }
      }
    ],

    // Authentication - which keys can prove "I am Sentinel"
    // References the verification method above
    "authentication": [
      `${did}#key-1`
    ],

    // Assertion Method - which keys can make signed claims/credentials
    "assertionMethod": [
      `${did}#key-1`
    ],

    // Service Endpoints - where to find Sentinel's APIs
    // This is how agents DISCOVER each other in the network
    "service": [
      {
        "id": `${did}#coordination`,
        "type": "AgentCoordinationService",
        "serviceEndpoint": "https://sentinel.example.com/api/v1/coordinate"
      },
      {
        "id": `${did}#provenance`,
        "type": "ProvenanceLedger",
        "serviceEndpoint": "https://sentinel.example.com/api/v1/provenance"
      }
    ]
  };

  console.log(JSON.stringify(didDocument, null, 2));

  // ============================================
  // STEP 3: Authentication Flow
  // ============================================
  console.log('\n\n=== STEP 3: Authentication Flow ===');
  console.log('Scenario: Triage Agent sends a signed patient referral to Sentinel\n');

  // --- TRIAGE AGENT SIDE ---
  console.log('--- TRIAGE AGENT (sender) ---\n');
  
  const { publicKey: triagePub, privateKey: triagePriv } = await generateKeyPair('EdDSA', { extractable: true });
  const triagePubJWK = await exportJWK(triagePub);
  const triageDID = 'did:ion:EiA9Rk3bBpLJx5k2cXQmBfwMfJdNpVYYwGmgCnKVpxWQbg';

  const referralPayload = {
    type: 'patient-referral',
    from: triageDID,
    to: did,
    patient: {
      id: 'PT-20260307-0042',
      triageCategory: 'RED',
      chiefComplaint: 'Crush injury, lower extremities',
      requiredSpecialty: 'trauma-surgery',
      timeOfAssessment: '2026-03-07T19:30:00Z'
    }
  };

  console.log('1. Triage Agent creates referral payload:');
  console.log(JSON.stringify(referralPayload, null, 2));

  // Sign with Triage Agent's private key
  const signedReferral = await new SignJWT(referralPayload)
    .setProtectedHeader({ 
      alg: 'EdDSA',
      kid: `${triageDID}#key-1`  // <-- tells verifier WHICH key to use
    })
    .setIssuedAt()
    .setIssuer(triageDID)
    .sign(triagePriv);

  console.log('\n2. Triage Agent signs it with private key:');
  console.log(signedReferral.substring(0, 60) + '...[truncated]');

  // --- SENTINEL SIDE (verification) ---
  console.log('\n\n--- SENTINEL (verifier) ---\n');

  // Step A: Decode the JWT header to find who signed it
  const [headerB64] = signedReferral.split('.');
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  console.log('3. Read JWT header to find signer:');
  console.log(`   alg: ${header.alg}, kid: ${header.kid}`);
  
  // Step B: Extract the DID from the kid
  const signerDID = header.kid.split('#')[0];
  console.log(`\n4. Extract signer's DID: ${signerDID}`);

  // Step C: RESOLVE the DID
  // In real Trustchain: query ION node to get the DID document
  // This document is Bitcoin-timestamped, so we know it's authentic
  console.log('\n5. Resolve DID via Trustchain/ION...');
  console.log('   → Query ION node for DID document');
  console.log('   → Verify DID was published in a Bitcoin-anchored transaction');
  console.log('   → Verify timestamp is independently verifiable');
  console.log('   → Check DID has NOT been revoked');
  
  // Simulated: we "resolve" and get the triage agent's DID document
  const resolvedTriageDoc = {
    id: triageDID,
    verificationMethod: [{
      id: `${triageDID}#key-1`,
      type: 'JsonWebKey2020',
      publicKeyJwk: triagePubJWK
    }],
    authentication: [`${triageDID}#key-1`]
  };
  console.log('   → Got DID document ✅');

  // Step D: VERIFY TRUST CHAIN
  console.log('\n6. Verify trust chain back to root:');
  console.log('   → Triage Agent DID was signed by Hospital A DID');
  console.log('   → Hospital A DID was signed by Health Authority DID');
  console.log('   → Health Authority DID = root (published 2026-02-15, code: "a7f")');
  console.log('   → Root timestamp verified via Bitcoin block ✅');
  console.log('   → Full chain valid ✅');

  // Step E: Extract public key and verify signature
  console.log('\n7. Extract public key from resolved DID document:');
  const keyId = header.kid;
  const vm = resolvedTriageDoc.verificationMethod.find(v => v.id === keyId);
  console.log(`   Found key: ${vm.id}`);
  
  const resolvedPubKey = await importJWK(vm.publicKeyJwk, 'EdDSA');
  
  try {
    const { payload } = await jwtVerify(signedReferral, resolvedPubKey);
    console.log('\n8. ✅ SIGNATURE VERIFIED');
    console.log('   The referral was genuinely signed by the Triage Agent');
    console.log('   The Triage Agent\'s DID is trusted (chain verified to root)');
    console.log('   The referral has not been tampered with');
    console.log('\n   Verified payload:');
    console.log(`   Patient: ${payload.patient.id}`);
    console.log(`   Triage: ${payload.patient.triageCategory}`);
    console.log(`   Needs: ${payload.patient.requiredSpecialty}`);
  } catch (e) {
    console.log(`\n8. ❌ VERIFICATION FAILED: ${e.message}`);
  }

  // Step F: What happens with an untrusted agent
  console.log('\n\n=== STEP 4: Rejection of Untrusted Agent ===\n');
  
  const { privateKey: roguePriv } = await generateKeyPair('EdDSA', { extractable: true });
  const rogueDID = 'did:ion:EiRogueAgentNotInTrustChainXXXXXXXXXXXXXXXXXXX';
  
  const fakeReferral = await new SignJWT({
    type: 'patient-referral',
    from: rogueDID,
    patient: { id: 'PT-FAKE', triageCategory: 'RED' }
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: `${rogueDID}#key-1` })
    .setIssuedAt()
    .setIssuer(rogueDID)
    .sign(roguePriv);

  console.log('Rogue agent sends signed referral...');
  console.log(`Signer claims to be: ${rogueDID}`);
  console.log('\nSentinel attempts to resolve DID via Trustchain/ION...');
  console.log('→ DID not found in ION registry, OR');
  console.log('→ DID exists but trust chain does NOT trace to known root');
  console.log('\n❌ REJECTED: Agent is outside the trusted network');
  console.log('   Referral discarded. Incident logged.');
}

main().catch(console.error);
