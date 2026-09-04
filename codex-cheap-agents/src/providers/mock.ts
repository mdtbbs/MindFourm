import type { AgentProvider, AgentRequest, AgentResponse } from './types.js';
export class MockProvider implements AgentProvider {
  public calls: AgentRequest[] = [];
  constructor(public readonly name: string, private readonly replies: Array<string | Error>) {}
  async invoke(request: AgentRequest): Promise<AgentResponse> {
    this.calls.push(request);
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    if (!reply) throw new Error(`${this.name} mock has no reply`);
    return { content: reply, model: 'mock' };
  }
}
