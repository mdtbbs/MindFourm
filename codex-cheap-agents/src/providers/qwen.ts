import { OpenAiCompatibleProvider } from './openai-compatible.js';
export class QwenProvider extends OpenAiCompatibleProvider {
  constructor(config: ConstructorParameters<typeof OpenAiCompatibleProvider>[1]) { super('Qwen', config); }
}
