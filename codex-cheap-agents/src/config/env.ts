import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { AppConfig } from './schema.js';

const positiveInt = (value: string | undefined, fallback: number): number => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const expandHome = (value: string): string => value === '~' || value.startsWith('~/')
  ? resolve(homedir(), value.slice(2))
  : resolve(value);

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  workspace: expandHome(env.CHEAP_AGENTS_WORKSPACE || process.cwd()),
  artifactRoot: expandHome(env.CHEAP_AGENTS_ARTIFACT_DIR || '~/.cache/codex-cheap-agents/tasks'),
  timeoutMs: positiveInt(env.CHEAP_AGENTS_TIMEOUT_MS, 120_000),
  maxReworks: positiveInt(env.CHEAP_AGENTS_MAX_REWORKS, 2),
  qwen: { apiKey: env.QWEN_API_KEY, baseUrl: env.QWEN_BASE_URL, model: env.QWEN_MODEL },
  glm: { apiKey: env.GLM_API_KEY, baseUrl: env.GLM_BASE_URL, model: env.GLM_MODEL },
});
