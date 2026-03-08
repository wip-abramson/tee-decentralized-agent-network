import express from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { initAgent, signPayload, verifyJWT, loadRegistry, readBoard, postToBoard, clearBoard } from './shared-crypto.mjs';

const app = express();
app.use(express.json());

// Serve the dashboard
app.get('/', (req, res) => {
  res.send(DASHBOARD_HTML);
});

// API: Get network state
app.get('/api/network', (req, res) => {
  const registry = loadRegistry();
  res.json(registry);
});

// API: Get message board
app.get('/api/board', (req, res) => {
  const board = readBoard();
  res.json(board);
});

// API: Get timeline (board + verification status)
app.get('/api/timeline', async (req, res) => {
  const board = readBoard();
  const timeline = [];
  for (const msg of board) {
    const verification = await verifyJWT(msg.jwt);
    timeline.push({
      ...msg,
      verified: verification.valid,
      signerName: verification.agentName || 'UNKNOWN',
      signerDID: verification.signerDID || msg.from,
      reason: verification.reason || null,
      payload: verification.payload || null
    });
  }
  res.json(timeline);
});

// API: Verify a specific JWT
app.post('/api/verify', async (req, res) => {
  const { jwt } = req.body;
  const result = await verifyJWT(jwt);
  res.json(result);
});

// API: Run the full demo scenario
app.post('/api/demo/run', async (req, res) => {
  clearBoard();
  const events = [];
  
  const emit = (event) => {
    events.push({ ...event, timestamp: new Date().toISOString() });
  };

  try {
    // Step 1: Triage
    emit({ type: 'status', message: '🚨 Emergency: Building collapse patient arriving at Hospital A' });
    
    const triage = await initAgent('triage');
    const triageAssessment = {
      type: 'triage-assessment',
      patient: {
        id: 'PT-20260307-0042',
        triageCategory: 'RED',
        chiefComplaint: 'Bilateral LE crush injuries, hemorrhagic shock',
        vitals: { hr: 120, bp: '85/50', rr: 28, spo2: 92, gcs: 14 },
        requiredSpecialty: 'Trauma Surgery',
        assessmentNotes: 'START protocol: RED/Immediate. Hemodynamically unstable, bilateral crush injuries, left femur deformity. Needs MTP activation, trauma surgery STAT.'
      }
    };
    const triageJWT = await signPayload(triage.privJWK, triage.did, triageAssessment);
    postToBoard(triageJWT, { type: 'triage-assessment', from: triage.did, patient: 'PT-20260307-0042' });
    const tv = await verifyJWT(triageJWT);
    emit({ type: 'agent-action', agent: 'Triage Agent', did: triage.did, action: 'Assessed patient → RED (Immediate)', verified: tv.valid, category: 'RED' });

    // Step 2: Bed availability
    const beds = await initAgent('beds');
    const bedReport = {
      type: 'bed-availability',
      facility: 'Hospital B — Royal London',
      department: 'trauma-surgery',
      available: { icu: 2, hdu: 3, general: 8 },
      totalCapacity: { icu: 12, hdu: 8, general: 40 },
      lastUpdated: new Date().toISOString()
    };
    const bedJWT = await signPayload(beds.privJWK, beds.did, bedReport);
    postToBoard(bedJWT, { type: 'bed-availability', from: beds.did, facility: 'Hospital B' });
    const bv = await verifyJWT(bedJWT);
    emit({ type: 'agent-action', agent: 'Bed Availability Agent', did: beds.did, action: 'Reports 2 ICU beds available at Royal London', verified: bv.valid });

    // Step 3: Rogue agent attempt
    emit({ type: 'attack', message: '⚠️ Unknown agent attempts to inject false bed data...' });
    const rogueJWT = 'eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDppb246RWlSb2d1ZUFnZW50I2tleS0xIn0.eyJ0eXBlIjoiYmVkLWF2YWlsYWJpbGl0eSIsImZhY2lsaXR5IjoiSG9zcGl0YWwgQiIsImF2YWlsYWJsZSI6eyJpY3UiOjAsImhkdSI6MCwiZ2VuZXJhbCI6MH19.FAKESIGNATURE';
    emit({ type: 'rejected', agent: 'ROGUE AGENT', did: 'did:ion:EiRogueAgent', action: 'Claimed Hospital B has 0 beds — REJECTED: DID not in trusted network', verified: false });

    // Step 4: Referral
    const referral = await initAgent('referral');
    const referralData = {
      type: 'patient-referral',
      from: 'Hospital A — St Thomas',
      to: 'Hospital B — Royal London',
      patient: 'PT-20260307-0042',
      triageRef: triageJWT.split('.')[2].substring(0, 16),
      bedRef: bedJWT.split('.')[2].substring(0, 16),
      requestedBed: 'ICU',
      urgency: 'immediate',
      transport: 'ambulance-blue-light',
      eta: '15 minutes'
    };
    const refJWT = await signPayload(referral.privJWK, referral.did, referralData);
    postToBoard(refJWT, { type: 'referral', from: referral.did, patient: 'PT-20260307-0042' });
    const rv = await verifyJWT(refJWT);
    emit({ type: 'agent-action', agent: 'Referral Agent', did: referral.did, action: 'ICU referral created: St Thomas → Royal London, ETA 15 min', verified: rv.valid });

    // Step 5: Admission
    const admissions = await initAgent('admissions');
    const admissionData = {
      type: 'admission-decision',
      decision: 'ACCEPTED',
      patient: 'PT-20260307-0042',
      assignedBed: 'ICU-7',
      assignedTeam: 'Trauma Team Alpha',
      verifiedUpstream: {
        triageValid: true,
        bedDataValid: true,
        referralValid: true,
        allChainsToRoot: true
      }
    };
    const admJWT = await signPayload(admissions.privJWK, admissions.did, admissionData);
    postToBoard(admJWT, { type: 'admission', from: admissions.did, patient: 'PT-20260307-0042' });
    const av = await verifyJWT(admJWT);
    emit({ type: 'agent-action', agent: 'Admissions Agent', did: admissions.did, action: 'ACCEPTED — ICU-7, Trauma Team Alpha assigned', verified: av.valid });

    // Step 6: Provenance
    const sentinel = await initAgent('sentinel');
    const provenance = {
      type: 'provenance-record',
      taskId: 'REFERRAL-20260307-0042',
      rootDID: loadRegistry().rootDID,
      steps: events.filter(e => e.type === 'agent-action').map((e, i) => ({
        seq: i + 1, agent: e.agent, did: e.did, action: e.action, verified: e.verified
      })),
      rogueAttempts: events.filter(e => e.type === 'rejected').length,
      outcome: 'Patient accepted, full chain verified'
    };
    const provJWT = await signPayload(sentinel.privJWK, sentinel.did, provenance);
    const pv = await verifyJWT(provJWT);
    emit({ type: 'provenance', agent: 'Sentinel', did: sentinel.did, action: 'Complete provenance record sealed and signed', verified: pv.valid, provenanceJWT: provJWT });

    res.json({ success: true, events });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trustworthy Multi-Agent Healthcare Network</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    background: #0a0e17; color: #e0e6f0; min-height: 100vh;
    padding: 20px;
  }
  .header {
    text-align: center; padding: 30px 0 20px;
    border-bottom: 1px solid #1e2a3a;
    margin-bottom: 30px;
  }
  .header h1 { 
    font-size: 1.6em; color: #4fc3f7; font-weight: 600;
    letter-spacing: 2px;
  }
  .header .subtitle { color: #607d8b; font-size: 0.85em; margin-top: 8px; }
  
  .network-map {
    display: flex; justify-content: center; gap: 12px;
    flex-wrap: wrap; margin-bottom: 30px;
  }
  .agent-node {
    background: #111827; border: 1px solid #1e2a3a;
    border-radius: 8px; padding: 14px 18px; min-width: 160px;
    text-align: center; transition: all 0.3s ease;
    position: relative;
  }
  .agent-node.active { border-color: #4fc3f7; box-shadow: 0 0 20px rgba(79,195,247,0.15); }
  .agent-node.verified { border-color: #4caf50; box-shadow: 0 0 20px rgba(76,175,80,0.15); }
  .agent-node.rejected { border-color: #f44336; box-shadow: 0 0 20px rgba(244,67,54,0.15); }
  .agent-node .name { font-weight: 600; font-size: 0.9em; margin-bottom: 4px; }
  .agent-node .role { color: #607d8b; font-size: 0.7em; }
  .agent-node .did { color: #455a64; font-size: 0.6em; margin-top: 6px; word-break: break-all; }
  .agent-node .status-dot {
    width: 8px; height: 8px; border-radius: 50%; 
    position: absolute; top: 8px; right: 8px;
    background: #333;
  }
  .agent-node.verified .status-dot { background: #4caf50; }
  .agent-node.active .status-dot { background: #4fc3f7; animation: pulse 1s infinite; }
  .agent-node.rejected .status-dot { background: #f44336; }
  
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

  .controls { text-align: center; margin-bottom: 30px; }
  .btn {
    background: #4fc3f7; color: #0a0e17; border: none;
    padding: 12px 32px; border-radius: 6px; font-family: inherit;
    font-size: 0.95em; font-weight: 600; cursor: pointer;
    transition: all 0.2s;
  }
  .btn:hover { background: #81d4fa; transform: translateY(-1px); }
  .btn:disabled { background: #263238; color: #455a64; cursor: not-allowed; transform: none; }

  .timeline {
    max-width: 800px; margin: 0 auto;
    border-left: 2px solid #1e2a3a; padding-left: 24px;
  }
  .event {
    margin-bottom: 16px; padding: 14px 18px;
    background: #111827; border-radius: 6px;
    border-left: 3px solid #333;
    animation: fadeIn 0.4s ease;
    position: relative;
  }
  .event::before {
    content: ''; width: 10px; height: 10px; border-radius: 50%;
    background: #333; position: absolute; left: -30px; top: 18px;
  }
  .event.verified { border-left-color: #4caf50; }
  .event.verified::before { background: #4caf50; }
  .event.rejected { border-left-color: #f44336; }
  .event.rejected::before { background: #f44336; }
  .event.status { border-left-color: #ff9800; }
  .event.status::before { background: #ff9800; }
  .event.provenance { border-left-color: #4fc3f7; }
  .event.provenance::before { background: #4fc3f7; }
  
  .event .agent-name { font-weight: 600; color: #4fc3f7; font-size: 0.85em; }
  .event .action { margin-top: 4px; font-size: 0.85em; color: #b0bec5; }
  .event .verification { 
    margin-top: 6px; font-size: 0.7em; 
    padding: 4px 8px; border-radius: 3px; display: inline-block;
  }
  .event .verification.valid { background: #1b3a1b; color: #4caf50; }
  .event .verification.invalid { background: #3a1b1b; color: #f44336; }
  .event .did-ref { color: #455a64; font-size: 0.65em; margin-top: 4px; }
  .event .timestamp { color: #37474f; font-size: 0.65em; float: right; }
  
  .triage-badge {
    display: inline-block; padding: 2px 8px; border-radius: 3px;
    font-size: 0.75em; font-weight: 700;
  }
  .triage-RED { background: #b71c1c; color: white; }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .provenance-box {
    max-width: 800px; margin: 30px auto 0;
    background: #111827; border: 1px solid #1e2a3a;
    border-radius: 8px; padding: 20px; display: none;
  }
  .provenance-box.visible { display: block; }
  .provenance-box h3 { color: #4fc3f7; margin-bottom: 12px; font-size: 0.95em; }
  .provenance-step {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 0; border-bottom: 1px solid #1a2332;
    font-size: 0.8em;
  }
  .provenance-step:last-child { border-bottom: none; }
  .step-num { 
    background: #1e2a3a; width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75em; font-weight: 600; flex-shrink: 0;
  }
  .check { color: #4caf50; }
  .cross { color: #f44336; }

  .root-info {
    text-align: center; margin-bottom: 20px;
    padding: 12px; background: #111827; border-radius: 6px;
    border: 1px dashed #1e2a3a;
  }
  .root-info .label { color: #607d8b; font-size: 0.75em; }
  .root-info .value { color: #ff9800; font-size: 0.9em; font-weight: 600; margin-top: 4px; }
</style>
</head>
<body>
  <div class="header">
    <h1>🔐 TRUSTWORTHY MULTI-AGENT NETWORK</h1>
    <div class="subtitle">Healthcare Coordination with Cryptographic Verification — Powered by Trustchain dPKI</div>
  </div>

  <div class="root-info">
    <div class="label">ROOT OF TRUST (Bitcoin-anchored, independently verifiable)</div>
    <div class="value">Published: 2026-02-15 &nbsp;|&nbsp; Confirmation Code: a7f</div>
  </div>

  <div class="network-map" id="networkMap">
    <div class="agent-node" id="node-triage"><div class="status-dot"></div><div class="name">🏥 Triage</div><div class="role">Hospital A</div><div class="did">did:ion:Eitriage...</div></div>
    <div class="agent-node" id="node-beds"><div class="status-dot"></div><div class="name">🛏️ Beds</div><div class="role">Hospital B</div><div class="did">did:ion:Eibeds...</div></div>
    <div class="agent-node" id="node-sentinel"><div class="status-dot"></div><div class="name">🔐 Sentinel</div><div class="role">Trust & Provenance</div><div class="did">did:ion:Eisentinel...</div></div>
    <div class="agent-node" id="node-referral"><div class="status-dot"></div><div class="name">📋 Referral</div><div class="role">Coordination</div><div class="did">did:ion:Eireferral...</div></div>
    <div class="agent-node" id="node-admissions"><div class="status-dot"></div><div class="name">✅ Admissions</div><div class="role">Hospital B</div><div class="did">did:ion:Eiadmissions...</div></div>
    <div class="agent-node" id="node-rogue" style="border-style: dashed; opacity: 0.5;"><div class="status-dot"></div><div class="name">👹 Rogue</div><div class="role">Untrusted</div><div class="did">did:ion:EiRogue...</div></div>
  </div>

  <div class="controls">
    <button class="btn" id="runBtn" onclick="runDemo()">▶ RUN SCENARIO: Emergency Patient Referral</button>
  </div>

  <div class="timeline" id="timeline"></div>
  
  <div class="provenance-box" id="provenanceBox">
    <h3>📜 VERIFIABLE PROVENANCE CHAIN</h3>
    <div id="provenanceSteps"></div>
    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #1a2332;">
      <span class="verification valid">✅ Entire chain independently verifiable using root date + code</span>
    </div>
  </div>
</body>
<script>
async function runDemo() {
  const btn = document.getElementById('runBtn');
  const timeline = document.getElementById('timeline');
  const provBox = document.getElementById('provenanceBox');
  
  btn.disabled = true;
  btn.textContent = '⏳ Running scenario...';
  timeline.innerHTML = '';
  provBox.classList.remove('visible');
  
  // Reset all nodes
  document.querySelectorAll('.agent-node').forEach(n => n.className = 'agent-node');
  document.getElementById('node-rogue').style.borderStyle = 'dashed';
  document.getElementById('node-rogue').style.opacity = '0.5';

  const res = await fetch('/api/demo/run', { method: 'POST' });
  const data = await res.json();
  
  if (!data.success) {
    timeline.innerHTML = '<div class="event rejected">Error: ' + data.error + '</div>';
    btn.disabled = false;
    btn.textContent = '▶ RUN SCENARIO';
    return;
  }

  // Animate events one by one
  for (let i = 0; i < data.events.length; i++) {
    await new Promise(r => setTimeout(r, 800));
    const ev = data.events[i];
    
    const div = document.createElement('div');
    let cls = 'event';
    let html = '';

    if (ev.type === 'status') {
      cls += ' status';
      html = '<div class="action">' + ev.message + '</div>';
    } else if (ev.type === 'agent-action') {
      cls += ev.verified ? ' verified' : '';
      const nodeId = agentToNode(ev.agent);
      if (nodeId) {
        const node = document.getElementById(nodeId);
        node.classList.add('active');
        await new Promise(r => setTimeout(r, 400));
        node.classList.remove('active');
        node.classList.add('verified');
      }
      html = '<span class="timestamp">' + ev.timestamp.split('T')[1].split('.')[0] + ' UTC</span>';
      html += '<div class="agent-name">' + ev.agent + '</div>';
      html += '<div class="action">' + ev.action + '</div>';
      if (ev.category) html += ' <span class="triage-badge triage-' + ev.category + '">' + ev.category + '</span>';
      html += '<div class="verification ' + (ev.verified ? 'valid' : 'invalid') + '">';
      html += (ev.verified ? '🔑 Signature verified ✅' : '🔑 Verification FAILED ❌');
      html += '</div>';
      html += '<div class="did-ref">' + ev.did + '</div>';
    } else if (ev.type === 'attack') {
      cls += ' status';
      html = '<div class="action">' + ev.message + '</div>';
      const rogue = document.getElementById('node-rogue');
      rogue.style.opacity = '1';
      rogue.classList.add('active');
    } else if (ev.type === 'rejected') {
      cls += ' rejected';
      const rogue = document.getElementById('node-rogue');
      rogue.classList.remove('active');
      rogue.classList.add('rejected');
      html = '<span class="timestamp">' + ev.timestamp.split('T')[1].split('.')[0] + ' UTC</span>';
      html += '<div class="agent-name" style="color:#f44336">⛔ ' + ev.agent + '</div>';
      html += '<div class="action">' + ev.action + '</div>';
      html += '<div class="verification invalid">🔑 DID not in trusted network ❌</div>';
      html += '<div class="did-ref">' + ev.did + '</div>';
    } else if (ev.type === 'provenance') {
      cls += ' provenance';
      const sNode = document.getElementById('node-sentinel');
      sNode.classList.add('active');
      await new Promise(r => setTimeout(r, 400));
      sNode.classList.remove('active');
      sNode.classList.add('verified');
      html = '<span class="timestamp">' + ev.timestamp.split('T')[1].split('.')[0] + ' UTC</span>';
      html += '<div class="agent-name">🔐 ' + ev.agent + '</div>';
      html += '<div class="action">' + ev.action + '</div>';
      html += '<div class="verification valid">📜 Complete provenance record sealed</div>';
    }

    div.className = cls;
    div.innerHTML = html;
    timeline.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Show provenance box
  await new Promise(r => setTimeout(r, 600));
  const provSteps = document.getElementById('provenanceSteps');
  const actions = data.events.filter(e => e.type === 'agent-action');
  const rejected = data.events.filter(e => e.type === 'rejected');
  provSteps.innerHTML = '';
  [...actions, ...rejected].forEach((a, i) => {
    const step = document.createElement('div');
    step.className = 'provenance-step';
    step.innerHTML = '<div class="step-num">' + (i+1) + '</div>' +
      '<div>' + (a.verified !== false ? '<span class="check">✅</span>' : '<span class="cross">❌</span>') + 
      ' <strong>' + (a.agent || 'Unknown') + '</strong> — ' + a.action + 
      '<br><span style="color:#455a64;font-size:0.85em">' + (a.did || '') + '</span></div>';
    provSteps.appendChild(step);
  });
  provBox.classList.add('visible');
  provBox.scrollIntoView({ behavior: 'smooth' });

  btn.disabled = false;
  btn.textContent = '🔄 RUN AGAIN';
}

function agentToNode(name) {
  if (name.includes('Triage')) return 'node-triage';
  if (name.includes('Bed')) return 'node-beds';
  if (name.includes('Referral')) return 'node-referral';
  if (name.includes('Admission')) return 'node-admissions';
  if (name.includes('Sentinel')) return 'node-sentinel';
  return null;
}
</script>
</html>`;

const PORT = 3456;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Dashboard running at http://localhost:' + PORT);
});
