import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Workflow } from '../agents/workflow.js';

const base = { task: z.string().min(3).max(10_000).describe('The user goal.'), workspace: z.string().optional().describe('Absolute workspace path; defaults to CHEAP_AGENTS_WORKSPACE.'), constraints: z.array(z.string().max(1_000)).max(20).optional() };
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
export const createMcpServer = (workflow: Workflow, defaultWorkspace: string): McpServer => {
  const server = new McpServer({ name: 'codex-cheap-agents', version: '0.1.0' });
  server.tool('cheap_investigate', 'Investigate without changing code. Returns a context-firewalled result and artifact references.', base, async ({ task, workspace, constraints }) => text(await workflow.investigate(withConstraints(task, constraints), workspace ?? defaultWorkspace)));
  server.tool('cheap_review', 'Review the current workspace diff. Returns concise findings and artifact references.', base, async ({ task, workspace, constraints }) => text(await workflow.review(withConstraints(task, constraints), workspace ?? defaultWorkspace)));
  server.tool('cheap_task', 'Investigate, implement safely by patch, validate, and independently review. Returns only a compact result.', { ...base, mode: z.enum(['auto', 'fix', 'implement', 'refactor']).optional() }, async ({ task, workspace, constraints, mode }) => text(await workflow.execute(withConstraints(task, constraints), workspace ?? defaultWorkspace, mode ?? 'auto', true)));
  return server;
};
export const startStdio = async (server: McpServer): Promise<void> => server.connect(new StdioServerTransport());
const withConstraints = (task: string, constraints?: string[]) => constraints?.length ? `${task}\nConstraints:\n${constraints.map((item) => `- ${item}`).join('\n')}` : task;
