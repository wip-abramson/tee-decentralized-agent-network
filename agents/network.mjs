// Network — shared message relay between agents
// In-memory for the demo; could be replaced with WebSocket/HTTP for distributed agents

export class Network {
  constructor() {
    this.agents = new Map();  // did → { wallet, inbox: [] }
    this.log = [];
    this.onLogCallback = null;
  }

  register(wallet) {
    this.agents.set(wallet.did, { wallet, inbox: [] });
  }

  send(fromDid, toDid, message) {
    const target = this.agents.get(toDid);
    if (!target) {
      return { delivered: false, error: `No agent registered for ${toDid.slice(0, 30)}...` };
    }
    target.inbox.push({ from: fromDid, message, receivedAt: Date.now() });

    const entry = { time: Date.now(), type: 'send', from: fromDid, to: toDid, msgType: message.type || 'unknown' };
    this.log.push(entry);
    if (this.onLogCallback) this.onLogCallback(entry);

    return { delivered: true, to: toDid };
  }

  receive(did) {
    const agent = this.agents.get(did);
    if (!agent) return [];
    const messages = agent.inbox.splice(0);
    return messages;
  }

  listAgents() {
    return [...this.agents.keys()].map(did => {
      const a = this.agents.get(did);
      return { did, name: a.wallet.name };
    });
  }
}
