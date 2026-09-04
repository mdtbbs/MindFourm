import { OpenAiCompatibleProvider } from './openai-compatible.js';
export class GlmProvider extends OpenAiCompatibleProvider {
  constructor(config: ConstructorParameters<typeof OpenAiCompatibleProvider>[1]) { super('GLM', config); }
}
