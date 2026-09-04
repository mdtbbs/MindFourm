export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface AppConfig {
  workspace: string;
  artifactRoot: string;
  timeoutMs: number;
  maxReworks: number;
  qwen: ProviderConfig;
  glm: ProviderConfig;
}
