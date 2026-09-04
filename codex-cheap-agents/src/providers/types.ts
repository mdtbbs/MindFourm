export interface AgentRequest {
  system: string;
  prompt: string;
  timeoutMs: number;
  responseFormat?: 'json';
}

export interface AgentResponse {
  content: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AgentProvider {
  readonly name: string;
  invoke(request: AgentRequest): Promise<AgentResponse>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable = false, public readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}
