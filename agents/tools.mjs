// Tool definitions — exposed to the Claude agent via the Anthropic SDK tool_use API
// Each tool wraps a Wallet + Network operation with real BIP-340 cryptography

export function createToolDefs() {
  return [
    {
      name: 'get_identity',
      description: 'Get your own DID, wallet state, contacts, and credentials held. Use this to check your current state before taking actions.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'list_agents',
      description: 'List all agents registered on the network with their DIDs and names.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'send_auth_challenge',
      description: 'Send a DID Auth challenge to another agent. This initiates the authentication handshake. The remote agent must sign the challenge to prove they control their DID.',
      input_schema: {
        type: 'object',
        properties: {
          to_did: { type: 'string', description: 'The DID of the agent to challenge' }
        },
        required: ['to_did']
      }
    },
    {
      name: 'check_messages',
      description: 'Check your inbox for new messages from other agents. Returns all pending messages. You should process each one and respond appropriately.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'respond_to_challenge',
      description: 'Sign and respond to a DID Auth challenge from another agent. This proves you control your DID by creating a BIP-340 Schnorr signature over the challenge.',
      input_schema: {
        type: 'object',
        properties: {
          challenge: { type: 'object', description: 'The DIDAuthChallenge message to respond to' },
          challenger_did: { type: 'string', description: 'The DID of the agent who sent the challenge' }
        },
        required: ['challenge', 'challenger_did']
      }
    },
    {
      name: 'verify_auth_response',
      description: 'Verify a DID Auth response from another agent. Checks the BIP-340 signature, validates the nonce, and if valid, adds the agent to your authenticated contacts.',
      input_schema: {
        type: 'object',
        properties: {
          response: { type: 'object', description: 'The DIDAuthResponse message to verify' },
          responder_did: { type: 'string', description: 'The DID of the agent who responded' }
        },
        required: ['response', 'responder_did']
      }
    },
    {
      name: 'issue_credential',
      description: 'Issue a W3C Verifiable Credential to another agent. Creates a signed VC with BIP-340 proof. Only issue credentials to authenticated contacts.',
      input_schema: {
        type: 'object',
        properties: {
          subject_did: { type: 'string', description: 'DID of the agent receiving the credential' },
          credential_type: { type: 'string', description: 'Type of credential (e.g., "AgentAuthorization")' },
          claims: { type: 'object', description: 'Claims to include in the credential (e.g., role, permissions)' }
        },
        required: ['subject_did', 'credential_type', 'claims']
      }
    },
    {
      name: 'send_credential',
      description: 'Send a Verifiable Credential to another agent via the network.',
      input_schema: {
        type: 'object',
        properties: {
          to_did: { type: 'string', description: 'DID of the recipient' },
          credential: { type: 'object', description: 'The signed VC to send' }
        },
        required: ['to_did', 'credential']
      }
    },
    {
      name: 'store_credential',
      description: 'Verify and store a received Verifiable Credential in your wallet. Checks the issuer\'s BIP-340 signature before storing.',
      input_schema: {
        type: 'object',
        properties: {
          credential: { type: 'object', description: 'The VC to verify and store' }
        },
        required: ['credential']
      }
    },
    {
      name: 'request_presentation',
      description: 'Ask another agent to present their Verifiable Credentials. Sends a PresentationRequest message.',
      input_schema: {
        type: 'object',
        properties: {
          to_did: { type: 'string', description: 'DID of the agent to request credentials from' },
          credential_type: { type: 'string', description: 'Optional: specific credential type to request' }
        },
        required: ['to_did']
      }
    },
    {
      name: 'present_credentials',
      description: 'Create and send a Verifiable Presentation containing your credentials. Wraps your VCs in a signed VP envelope.',
      input_schema: {
        type: 'object',
        properties: {
          to_did: { type: 'string', description: 'DID of the requesting agent' },
          credential_type: { type: 'string', description: 'Optional: filter to specific credential type' }
        },
        required: ['to_did']
      }
    },
    {
      name: 'verify_presentation',
      description: 'Verify a received Verifiable Presentation. Checks the VP envelope signature and each contained VC\'s issuer signature. Reports whether issuers are trusted contacts.',
      input_schema: {
        type: 'object',
        properties: {
          presentation: { type: 'object', description: 'The VP to verify' }
        },
        required: ['presentation']
      }
    },
    {
      name: 'send_signed_message',
      description: 'Send a cryptographically signed message to another agent. The message is signed with your BIP-340 key and includes a Data Integrity proof. Only send to authenticated contacts.',
      input_schema: {
        type: 'object',
        properties: {
          to_did: { type: 'string', description: 'DID of the recipient' },
          payload: { type: 'object', description: 'The message payload to sign and send' }
        },
        required: ['to_did', 'payload']
      }
    },
    {
      name: 'verify_signed_message',
      description: 'Verify a received signed message. Checks the sender\'s BIP-340 signature and whether they are an authenticated contact.',
      input_schema: {
        type: 'object',
        properties: {
          message: { type: 'object', description: 'The signed message to verify' }
        },
        required: ['message']
      }
    }
  ];
}

// Execute a tool call against a wallet and network
export function executeTool(toolName, toolInput, wallet, network) {
  switch (toolName) {
    case 'get_identity':
      return wallet.getState();

    case 'list_agents':
      return network.listAgents();

    case 'send_auth_challenge': {
      const challenge = wallet.createChallenge();
      const result = network.send(wallet.did, toolInput.to_did, challenge);
      return { challenge_sent: true, nonce: challenge.nonce, ...result };
    }

    case 'check_messages': {
      const messages = network.receive(wallet.did);
      if (messages.length === 0) return { messages: [], note: 'No new messages' };
      return { messages };
    }

    case 'respond_to_challenge': {
      const signed = wallet.signChallenge(toolInput.challenge);
      const result = network.send(wallet.did, toolInput.challenger_did, signed);
      return { response_sent: true, signed_with: wallet.did, ...result };
    }

    case 'verify_auth_response': {
      const result = wallet.verifyAuthResponse(toolInput.response);
      if (result.verified) {
        network.send(wallet.did, toolInput.responder_did, {
          type: 'DIDAuthConfirmed',
          did: wallet.did,
          authenticated: result.did,
          status: 'verified'
        });
      }
      return result;
    }

    case 'issue_credential': {
      const vc = wallet.issueCredential(toolInput.subject_did, toolInput.credential_type, toolInput.claims);
      return { credential_issued: true, credential: vc };
    }

    case 'send_credential': {
      const result = network.send(wallet.did, toolInput.to_did, toolInput.credential);
      return { credential_sent: true, ...result };
    }

    case 'store_credential': {
      return wallet.storeCredential(toolInput.credential);
    }

    case 'request_presentation': {
      const request = {
        type: 'PresentationRequest',
        from: wallet.did,
        credentialType: toolInput.credential_type,
        timestamp: new Date().toISOString()
      };
      const result = network.send(wallet.did, toolInput.to_did, request);
      return { presentation_requested: true, ...result };
    }

    case 'present_credentials': {
      const vp = wallet.createPresentation(toolInput.credential_type);
      const result = network.send(wallet.did, toolInput.to_did, vp);
      return { presentation_sent: true, credentials_included: vp.verifiableCredential?.length || 0, ...result };
    }

    case 'verify_presentation': {
      return wallet.verifyPresentation(toolInput.presentation);
    }

    case 'send_signed_message': {
      const signed = wallet.signMessage(toolInput.payload);
      const result = network.send(wallet.did, toolInput.to_did, signed);
      return { message_sent: true, signed_with: wallet.did, ...result };
    }

    case 'verify_signed_message': {
      return wallet.verifySignedMessage(toolInput.message);
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
