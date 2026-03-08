import { readBoard, verifyJWT } from './shared-crypto.mjs';

const board = readBoard();
console.log(`Messages on board: ${board.length}\n`);

for (const msg of board) {
  console.log('--- Message ---');
  console.log('Type:', msg.type);
  console.log('From:', msg.from);
  console.log('Patient:', msg.patient);
  console.log('Posted:', msg.postedAt);
  
  const result = await verifyJWT(msg.jwt);
  console.log('Signature valid:', result.valid);
  if (result.valid) {
    console.log('Verified signer:', result.agentName, '(' + result.signerDID + ')');
    console.log('Payload:', JSON.stringify(result.payload, null, 2));
  } else {
    console.log('Failure:', result.reason);
  }
  console.log('');
}
