// Initialize all agent identities and register them in the trust network
import { initAgent, registerAgent, saveRegistry, clearBoard } from './shared-crypto.mjs';

async function setup() {
  console.log('Setting up agent network...\n');
  
  // Clear previous state
  clearBoard();
  
  const agents = [
    { id: 'sentinel', name: 'Sentinel', role: 'trust-provenance' },
    { id: 'triage', name: 'Triage Agent', role: 'clinical-triage' },
    { id: 'beds', name: 'Bed Availability Agent', role: 'resource-management' },
    { id: 'referral', name: 'Referral Agent', role: 'referral-coordination' },
    { id: 'admissions', name: 'Admissions Agent', role: 'patient-admissions' },
  ];

  const root = await initAgent('health-authority');
  saveRegistry({ 
    rootDID: root.did, 
    rootPublished: '2026-02-15', 
    rootCode: 'a7f',
    agents: [] 
  });

  registerAgent('health-authority', 'Health Authority', 'root', root.did, root.pubJWK);

  for (const a of agents) {
    const keys = await initAgent(a.id);
    registerAgent(a.id, a.name, a.role, keys.did, keys.pubJWK);
    console.log(`✅ ${a.name} — ${keys.did}`);
  }

  console.log('\nNetwork ready. All agents registered and trusted.');
  console.log('Keys stored in: tools/crypto/keys/');
  console.log('Registry at: tools/crypto/registry.json');
  console.log('Message board at: tools/crypto/message-board.json');
}

setup().catch(console.error);
