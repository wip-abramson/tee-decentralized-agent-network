// Sentinel's signing toolkit
// Generates a keypair, signs a message, and verifies it

import { generateKeyPair, SignJWT, jwtVerify, exportJWK } from 'jose';

async function main() {
  // 1. Generate an Ed25519 keypair (same type used in DIDs)
  console.log('🔑 Generating Ed25519 keypair...\n');
  const { publicKey, privateKey } = await generateKeyPair('EdDSA');

  const pubJWK = await exportJWK(publicKey);
  console.log('Public key (JWK):');
  console.log(JSON.stringify(pubJWK, null, 2));

  // 2. Sign a message
  const message = {
    from: 'did:sentinel:001',
    to: 'did:openclaw-responder:001',
    type: 'agent-hello',
    body: 'Hey, this is Sentinel. Verify me.',
    timestamp: new Date().toISOString()
  };

  console.log('\n📝 Message to sign:');
  console.log(JSON.stringify(message, null, 2));

  const jwt = await new SignJWT(message)
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt()
    .setIssuer('did:sentinel:001')
    .sign(privateKey);

  console.log('\n✍️  Signed JWT:');
  console.log(jwt);

  // 3. Verify it
  console.log('\n🔍 Verifying signature...');
  const { payload } = await jwtVerify(jwt, publicKey);
  console.log('✅ Signature valid! Verified payload:');
  console.log(JSON.stringify(payload, null, 2));

  // 4. Tamper test — try verifying with a different key
  console.log('\n🧪 Tamper test: verifying with wrong key...');
  const { publicKey: wrongKey } = await generateKeyPair('EdDSA');
  try {
    await jwtVerify(jwt, wrongKey);
    console.log('❌ This should not happen!');
  } catch (e) {
    console.log('✅ Correctly rejected: ' + e.message);
  }
}

main().catch(console.error);
