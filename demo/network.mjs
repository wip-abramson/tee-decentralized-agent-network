// Network — message bus connecting agents

export class Network {
  constructor() {
    this.agents = new Map(); // did → agent
    this.logs = [];
    this.onLogCallback = null;
  }

  register(agent) {
    agent.network = this;
    this.agents.set(agent.did, agent);
  }

  deliver(fromDid, toDid, message) {
    const target = this.agents.get(toDid);
    if (target) {
      target.receive(fromDid, message);
    } else {
      console.error(`[NET] No agent found for ${toDid.slice(0, 30)}...`);
    }
  }

  onLog(entry) {
    this.logs.push(entry);
    if (this.onLogCallback) this.onLogCallback(entry);
  }

  // Process all pending messages across all agents (one round)
  async tick() {
    for (const [did, agent] of this.agents) {
      await agent.processMessages();
    }
  }

  // Run multiple ticks until no messages remain
  async run(maxTicks = 20) {
    for (let i = 0; i < maxTicks; i++) {
      const totalQueued = [...this.agents.values()].reduce((sum, a) => sum + a.messageQueue.length, 0);
      if (totalQueued === 0) break;
      await this.tick();
    }
  }
}
