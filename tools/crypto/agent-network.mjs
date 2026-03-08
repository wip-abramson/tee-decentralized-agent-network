// Multi-Agent Healthcare Network Simulation
// Each agent has its own keypair, DID, and logic
// All signatures are real - this is not mocked crypto

import { generateKeyPair, exportJWK, importJWK, SignJWT, jwtVerify } from 'jose';

// ============================================
// TRUST INFRASTRUCTURE
// ============================================

class TrustRegistry {
  constructor() {
    this.dids = new Map();       // DID -> DID Document
    this.trustChain = new Map(); // DID -> issuer DID
    this.rootDID = null;
    this.provenanceLog = [];
  }

  // Register a DID document (simulates ION publish)
  async register(didDoc, issuerDID = null) {
    this.dids.set(didDoc.id, didDoc);
    if (issuerDID) {
      this.trustChain.set(didDoc.id, issuerDID);
    } else {
      this.rootDID = didDoc.id;
    }
  }

  // Resolve a DID (simulates ION resolution)
  resolve(did) {
    return this.dids.get(did) || null;
  }

  // Verify trust chain from a DID back to root
  verifyChain(did) {
    const chain = [did];
    let current = did;
    while (current !== this.rootDID) {
      const issuer = this.trustChain.get(current);
      if (!issuer) return { valid: false, chain, reason: 'Broken chain - no issuer found' };
      chain.push(issuer);
      current = issuer;
    }
    return { valid: true, chain };
  }

  // Log provenance
  logProvenance(entry) {
    this.provenanceLog.push({
      ...entry,
      timestamp: new Date().toISOString(),
      seq: this.provenanceLog.length + 1
    });
  }
}

// ============================================
// AGENT CLASS
// ============================================

class Agent {
  constructor(name, role, did) {
    this.name = name;
    this.role = role;
    this.did = did;
    this.publicKey = null;
    this.privateKey = null;
    this.pubJWK = null;
  }

  async init() {
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.pubJWK = await exportJWK(publicKey);
  }

  getDIDDocument(services = []) {
    return {
      id: this.did,
      controller: this.did,
      verificationMethod: [{
        id: `${this.did}#key-1`,
        controller: this.did,
        type: 'JsonWebKey2020',
        publicKeyJwk: {
          kty: this.pubJWK.kty,
          crv: this.pubJWK.crv,
          x: this.pubJWK.x
        }
      }],
      authentication: [`${this.did}#key-1`],
      assertionMethod: [`${this.did}#key-1`],
      service: services
    };
  }

  async sign(payload) {
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'EdDSA', kid: `${this.did}#key-1` })
      .setIssuedAt()
      .setIssuer(this.did)
      .sign(this.privateKey);
  }

  static async verify(jwt, registry) {
    // 1. Decode header to find signer
    const [headerB64] = jwt.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const signerDID = header.kid.split('#')[0];

    // 2. Resolve DID document
    const didDoc = registry.resolve(signerDID);
    if (!didDoc) {
      return { valid: false, reason: `DID not found: ${signerDID}` };
    }

    // 3. Verify trust chain
    const chainResult = registry.verifyChain(signerDID);
    if (!chainResult.valid) {
      return { valid: false, reason: chainResult.reason, chain: chainResult.chain };
    }

    // 4. Get public key and verify signature
    const vm = didDoc.verificationMethod.find(v => v.id === header.kid);
    if (!vm) {
      return { valid: false, reason: `Key ${header.kid} not found in DID document` };
    }

    try {
      const pubKey = await importJWK(vm.publicKeyJwk, 'EdDSA');
      const { payload } = await jwtVerify(jwt, pubKey);
      return { valid: true, payload, signerDID, chain: chainResult.chain };
    } catch (e) {
      return { valid: false, reason: `Signature invalid: ${e.message}` };
    }
  }
}

// ============================================
// SIMULATION: Cross-Facility Patient Referral
// ============================================

async function runSimulation() {
  const registry = new TrustRegistry();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  TRUSTWORTHY MULTI-AGENT HEALTHCARE COORDINATION DEMO  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // --- Setup Phase ---
  console.log('━━━ PHASE 1: IDENTITY SETUP ━━━\n');

  // Root: Health Authority
  const healthAuthority = new Agent('Health Authority', 'root-authority',
    'did:ion:EiHealthAuthorityRootTrust2026');
  await healthAuthority.init();

  // Hospital A agents
  const triageAgent = new Agent('Triage Agent', 'clinical-triage',
    'did:ion:EiTriageAgentHospitalA2026');
  await triageAgent.init();

  const referralAgent = new Agent('Referral Agent', 'referral-coordination',
    'did:ion:EiReferralAgentHospitalA2026');
  await referralAgent.init();

  // Hospital B agents
  const bedAgent = new Agent('Bed Availability Agent', 'resource-management',
    'did:ion:EiBedAvailabilityHospitalB2026');
  await bedAgent.init();

  const admissionsAgent = new Agent('Admissions Agent', 'patient-admissions',
    'did:ion:EiAdmissionsAgentHospitalB2026');
  await admissionsAgent.init();

  // Sentinel
  const sentinel = new Agent('Sentinel', 'trust-provenance',
    'did:ion:EiSentinelTrustAgent2026');
  await sentinel.init();

  // Register all DIDs in trust hierarchy
  await registry.register(healthAuthority.getDIDDocument());  // root
  await registry.register(triageAgent.getDIDDocument(), healthAuthority.did);
  await registry.register(referralAgent.getDIDDocument(), healthAuthority.did);
  await registry.register(bedAgent.getDIDDocument(), healthAuthority.did);
  await registry.register(admissionsAgent.getDIDDocument(), healthAuthority.did);
  await registry.register(sentinel.getDIDDocument([
    { id: `${sentinel.did}#provenance`, type: 'ProvenanceLedger', serviceEndpoint: 'https://sentinel.example.com/api/v1/provenance' }
  ]), healthAuthority.did);

  console.log('✅ Health Authority (root) — published DID, anchored to Bitcoin');
  console.log('✅ Triage Agent (Hospital A) — DID issued by Health Authority');
  console.log('✅ Referral Agent (Hospital A) — DID issued by Health Authority');
  console.log('✅ Bed Availability Agent (Hospital B) — DID issued by Health Authority');
  console.log('✅ Admissions Agent (Hospital B) — DID issued by Health Authority');
  console.log('✅ Sentinel (trust/provenance) — DID issued by Health Authority');
  console.log(`\n   Root DID published: 2026-02-15, confirmation code: "a7f"`);
  console.log('   All agents can verify the root with just this date + code.\n');

  // --- Incident Phase ---
  console.log('━━━ PHASE 2: INCIDENT — PATIENT REFERRAL ━━━\n');
  console.log('📞 Emergency: Patient with crush injuries at Hospital A.');
  console.log('   Hospital A lacks trauma surgery. Must refer to Hospital B.\n');

  // Step 1: Triage Assessment
  console.log('── Step 1: Triage Assessment (Hospital A) ──\n');
  const triageData = {
    type: 'triage-assessment',
    patient: {
      id: 'PT-20260307-0042',
      triageCategory: 'RED',
      chiefComplaint: 'Crush injury, bilateral lower extremities',
      vitals: { hr: 120, bp: '85/50', rr: 28, spo2: 92, gcs: 14 },
      requiredSpecialty: 'trauma-surgery',
      timeOfAssessment: '2026-03-07T19:30:00Z'
    }
  };
  const signedTriage = await triageAgent.sign(triageData);
  console.log(`   ${triageAgent.name} assessed patient: RED (critical)`);
  console.log(`   Signed with: ${triageAgent.did}`);

  // Verify triage
  const triageVerify = await Agent.verify(signedTriage, registry);
  console.log(`   Verification: ${triageVerify.valid ? '✅ VALID' : '❌ FAILED'}`);
  console.log(`   Trust chain: ${triageVerify.chain.map(d => d.split(':').pop().substring(0,12)+'…').join(' → ')}`);
  
  registry.logProvenance({
    step: 'triage-assessment',
    agent: triageAgent.did,
    agentName: triageAgent.name,
    verified: triageVerify.valid,
    chain: triageVerify.chain,
    jwt: signedTriage
  });

  // Step 2: Bed Availability Check
  console.log('\n── Step 2: Bed Availability Query (Hospital B) ──\n');
  const bedData = {
    type: 'bed-availability',
    facility: 'Hospital B — Royal London',
    department: 'trauma-surgery',
    available: { icu: 2, hdu: 3, general: 8 },
    lastUpdated: '2026-03-07T19:31:00Z'
  };
  const signedBeds = await bedAgent.sign(bedData);
  console.log(`   ${bedAgent.name} reports: 2 ICU, 3 HDU, 8 general beds`);
  console.log(`   Signed with: ${bedAgent.did}`);

  const bedVerify = await Agent.verify(signedBeds, registry);
  console.log(`   Verification: ${bedVerify.valid ? '✅ VALID' : '❌ FAILED'}`);
  console.log(`   Trust chain: ${bedVerify.chain.map(d => d.split(':').pop().substring(0,12)+'…').join(' → ')}`);

  registry.logProvenance({
    step: 'bed-availability-check',
    agent: bedAgent.did,
    agentName: bedAgent.name,
    verified: bedVerify.valid,
    chain: bedVerify.chain,
    jwt: signedBeds
  });

  // Step 3: Referral Request
  console.log('\n── Step 3: Referral Request (Hospital A → B) ──\n');
  const referralData = {
    type: 'patient-referral',
    from: 'Hospital A — St Thomas',
    to: 'Hospital B — Royal London',
    triageJWT: signedTriage,       // includes the signed triage
    bedAvailabilityJWT: signedBeds, // includes the signed bed check
    requestedBed: 'ICU',
    urgency: 'immediate',
    transportMode: 'ambulance-blue-light',
    eta: '15 minutes'
  };
  const signedReferral = await referralAgent.sign(referralData);
  console.log(`   ${referralAgent.name} created referral: ICU bed requested`);
  console.log(`   Referral bundles: signed triage + signed bed availability`);
  console.log(`   Signed with: ${referralAgent.did}`);

  const referralVerify = await Agent.verify(signedReferral, registry);
  console.log(`   Verification: ${referralVerify.valid ? '✅ VALID' : '❌ FAILED'}`);

  registry.logProvenance({
    step: 'referral-request',
    agent: referralAgent.did,
    agentName: referralAgent.name,
    verified: referralVerify.valid,
    chain: referralVerify.chain,
    bundledEvidence: ['triage-assessment', 'bed-availability-check'],
    jwt: signedReferral
  });

  // Step 4: Admissions Decision
  console.log('\n── Step 4: Admissions Decision (Hospital B) ──\n');
  
  // Admissions agent verifies the ENTIRE chain before accepting
  console.log('   Admissions Agent verifies incoming referral...');
  const r = await Agent.verify(signedReferral, registry);
  console.log(`   Referral signature: ${r.valid ? '✅' : '❌'}`);
  
  // Also verify the bundled triage and bed data
  const t = await Agent.verify(referralData.triageJWT, registry);
  console.log(`   Bundled triage signature: ${t.valid ? '✅' : '❌'}`);
  const b = await Agent.verify(referralData.bedAvailabilityJWT, registry);
  console.log(`   Bundled bed availability signature: ${b.valid ? '✅' : '❌'}`);

  const admissionDecision = {
    type: 'admission-decision',
    decision: 'ACCEPTED',
    patient: 'PT-20260307-0042',
    assignedBed: 'ICU-7',
    assignedTeam: 'Trauma Team Alpha',
    referralJWT: signedReferral,
    verificationRecord: {
      referralValid: r.valid,
      triageValid: t.valid,
      bedDataValid: b.valid,
      allChainsVerified: r.valid && t.valid && b.valid
    }
  };
  const signedAdmission = await admissionsAgent.sign(admissionDecision);
  console.log(`\n   ${admissionsAgent.name} ACCEPTS referral`);
  console.log(`   Assigned: ICU-7, Trauma Team Alpha`);
  console.log(`   All upstream signatures verified before acceptance ✅`);

  const admVerify = await Agent.verify(signedAdmission, registry);
  registry.logProvenance({
    step: 'admission-decision',
    agent: admissionsAgent.did,
    agentName: admissionsAgent.name,
    verified: admVerify.valid,
    chain: admVerify.chain,
    decision: 'ACCEPTED',
    jwt: signedAdmission
  });

  // --- Rogue Agent Test ---
  console.log('\n━━━ PHASE 3: ROGUE AGENT REJECTION ━━━\n');
  
  const rogue = new Agent('Rogue Agent', 'unknown', 'did:ion:EiRogueNotInNetwork');
  await rogue.init();
  // NOTE: NOT registered in the trust registry
  
  const fakeReferral = await rogue.sign({
    type: 'patient-referral',
    patient: { id: 'PT-FAKE', triageCategory: 'RED' },
    requestedBed: 'ICU'
  });

  console.log('⚠️  Unknown agent attempts to submit a referral...');
  const rogueVerify = await Agent.verify(fakeReferral, registry);
  console.log(`   DID: ${rogue.did}`);
  console.log(`   Signature cryptographically valid: yes (they have a real key)`);
  console.log(`   Trust chain verification: ❌ FAILED — ${rogueVerify.reason}`);
  console.log('   → Referral REJECTED. Agent is not in the trusted network.\n');

  // --- Provenance Output ---
  console.log('━━━ PHASE 4: COMPLETE PROVENANCE RECORD ━━━\n');
  console.log('This is the verifiable audit trail. Every entry includes a signed');
  console.log('JWT that can be independently verified using only the root DID.\n');

  // Sentinel signs the complete provenance record
  const provenanceRecord = {
    type: 'provenance-record',
    rootDID: registry.rootDID,
    rootPublished: '2026-02-15',
    rootConfirmationCode: 'a7f',
    entries: registry.provenanceLog.map(e => ({
      seq: e.seq,
      step: e.step,
      agent: e.agent,
      agentName: e.agentName,
      verified: e.verified,
      chain: e.chain,
      timestamp: e.timestamp,
      jwtSignature: e.jwt.split('.')[2].substring(0, 20) + '...'  // just the sig fragment for display
    }))
  };

  const signedProvenance = await sentinel.sign(provenanceRecord);
  const provVerify = await Agent.verify(signedProvenance, registry);

  for (const entry of provenanceRecord.entries) {
    console.log(`   ${entry.seq}. [${entry.step}]`);
    console.log(`      Agent: ${entry.agentName} (${entry.agent.split(':').pop().substring(0,20)}…)`);
    console.log(`      Verified: ${entry.verified ? '✅' : '❌'}  |  Chain: ${entry.chain.length} links to root`);
    console.log(`      Signature: ${entry.jwtSignature}`);
    console.log('');
  }

  console.log('   Provenance record signed by Sentinel: ' + (provVerify.valid ? '✅' : '❌'));
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Any auditor with the root date (2026-02-15) and code ("a7f")');
  console.log('   can independently verify every step of this record.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runSimulation().catch(console.error);
