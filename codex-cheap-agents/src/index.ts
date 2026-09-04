import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Workflow } from './agents/workflow.js';
import { loadConfig } from './config/env.js';
import { createMcpServer, startStdio } from './mcp/server.js';
import { GlmProvider } from './providers/glm.js';
import { QwenProvider } from './providers/qwen.js';
import { QwenWorker } from './agents/qwen-worker.js';
import { GlmReviewer } from './agents/glm-reviewer.js';

// The MCP process may be launched from a Codex workspace, not this project.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
const config = loadConfig();
const workflow = new Workflow({ config, worker: new QwenWorker(new QwenProvider(config.qwen), config.timeoutMs), reviewer: new GlmReviewer(new GlmProvider(config.glm), config.timeoutMs) });
await startStdio(createMcpServer(workflow, config.workspace));
