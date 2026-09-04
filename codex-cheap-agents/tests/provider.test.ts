import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiCompatibleProvider } from '../src/providers/openai-compatible.js';
import { ProviderError } from '../src/providers/types.js';

test('OpenAI-compatible provider parses completion response', async () => {
  const provider = new OpenAiCompatibleProvider('Test', { apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'model' }, async () => new Response(JSON.stringify({ model: 'model', choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200 }));
  const response = await provider.invoke({ system: 's', prompt: 'p', timeoutMs: 100 });
  assert.equal(response.content, '{"ok":true}'); assert.equal(response.usage?.inputTokens, 3);
});
test('OpenAI-compatible provider hides non-retryable HTTP bodies', async () => {
  const provider = new OpenAiCompatibleProvider('Test', { apiKey: 'key', baseUrl: 'https://example.test', model: 'model' }, async () => new Response('{"secret":"do not leak"}', { status: 401 }));
  await assert.rejects(() => provider.invoke({ system: 's', prompt: 'p', timeoutMs: 100 }), (error: unknown) => error instanceof ProviderError && error.message === 'Test request failed (401)');
});
