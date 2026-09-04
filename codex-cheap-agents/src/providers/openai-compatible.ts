import type { AgentProvider, AgentRequest, AgentResponse } from './types.js';
import { ProviderError } from './types.js';

export class OpenAiCompatibleProvider implements AgentProvider {
  constructor(
    public readonly name: string,
    private readonly config: { apiKey?: string; baseUrl?: string; model?: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async invoke(request: AgentRequest): Promise<AgentResponse> {
    if (!this.config.apiKey || !this.config.baseUrl || !this.config.model) {
      throw new ProviderError(`${this.name} is not configured (API key, base URL, and model are required)`);
    }
    const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({ model: this.config.model, messages: [
            { role: 'system', content: request.system }, { role: 'user', content: request.prompt },
          ], response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined, temperature: 0.1 }),
        });
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < 2) { await delay(300 * (attempt + 1)); continue; }
          throw new ProviderError(`${this.name} request failed (${response.status})`, retryable, response.status);
        }
        const content = (body.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new ProviderError(`${this.name} returned no assistant content`);
        const usage = body.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        return { content, model: typeof body.model === 'string' ? body.model : this.config.model,
          usage: { inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens } };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (attempt < 2) { await delay(300 * (attempt + 1)); continue; }
        throw new ProviderError(`${this.name} request failed: ${error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network error'}`, true);
      } finally { clearTimeout(timer); }
    }
    throw new ProviderError(`${this.name} request exhausted retries`, true);
  }
}

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
