# codex-cheap-agents

`codex-cheap-agents` is a local MCP server that keeps the primary Codex/Sol context small while delegating routine repository work to inexpensive OpenAI-compatible providers. In V1, Qwen is the worker and GLM is the independent reviewer.

It exposes exactly three MCP tools:

- `cheap_task` investigates, proposes/applies a validated unified patch, runs safe package scripts, then sends the targeted diff to GLM. `REWORK` automatically returns to Qwen up to the configured limit.
- `cheap_investigate` asks Qwen to diagnose without applying a patch or running a review.
- `cheap_review` asks GLM to review the current Git diff without returning that diff to Sol.

All outputs pass through the Context Firewall. It returns a concise JSON result, artifact references, and (normally) no source, diff, logs, search results, or full model response. Artifacts are mode `0700` directories beneath `~/.cache/codex-cheap-agents/tasks/` by default.

## Install

```bash
cd /absolute/path/codex-cheap-agents
npm install
npm run build
```

Node.js 20 or later is required. Copy `.env.example` to `.env` and fill in the two API keys; the server loads `.env` automatically through `dotenv`. Codex's MCP configuration can instead set the same environment variables directly. API keys are never stored in artifacts or source control.

## Configure Qwen and GLM

The providers use OpenAI-compatible `POST /chat/completions`. Set the endpoint base URL (without `/chat/completions`), API key, and exact model identifiers supplied by your account:

```bash
export QWEN_API_KEY='...'
export QWEN_BASE_URL='https://coding.dashscope.aliyuncs.com/v1'
export QWEN_MODEL='qwen3.7-plus'

export GLM_API_KEY='...'
export GLM_BASE_URL='https://open.bigmodel.cn/api/paas/v4'
export GLM_MODEL='glm-5'
```

The supplied Qwen Coding endpoint is `https://coding.dashscope.aliyuncs.com/v1`; V1 defaults to `qwen3.7-plus` for the Worker and `glm-5` for the Reviewer. For code-heavy work, `qwen3-coder-next` or `qwen3-coder-plus` can replace `QWEN_MODEL`; `qwen3.6-plus`, `qwen3.5-plus`, `qwen3-max-2026-01-23`, `glm-4.7`, `kimi-k2.5`, and `MiniMax-M2.5` are likewise selectable once their compatible endpoint and account access are configured. Future OpenAI-compatible providers can reuse `OpenAiCompatibleProvider` without changing the workflow.

Optional controls:

```bash
export CHEAP_AGENTS_WORKSPACE='/absolute/path/to/repository'
export CHEAP_AGENTS_ARTIFACT_DIR='~/.cache/codex-cheap-agents/tasks'
export CHEAP_AGENTS_TIMEOUT_MS='120000'
export CHEAP_AGENTS_MAX_REWORKS='2'
```

## Configure Codex Desktop

Add this to `~/.codex/config.toml`, replacing the paths and keys. Keeping secrets in your normal shell/key-management mechanism is preferable; the `env` section is shown because Codex needs to supply them to the stdio process.

```toml
[mcp_servers.cheap_agents]
command = "node"
args = ["/absolute/path/codex-cheap-agents/dist/index.js"]
enabled = true
tool_timeout_sec = 600

[mcp_servers.cheap_agents.env]
CHEAP_AGENTS_WORKSPACE = "/absolute/path/to/repository"
QWEN_API_KEY = "..."
QWEN_BASE_URL = "https://coding.dashscope.aliyuncs.com/v1"
QWEN_MODEL = "qwen3.7-plus"
GLM_API_KEY = "..."
GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
GLM_MODEL = "glm-5"
```

Restart Codex Desktop. It discovers `cheap_task`, `cheap_investigate`, and `cheap_review` over standard MCP stdio. To make Sol route ordinary tasks here, copy [`examples/AGENTS.md`](examples/AGENTS.md) into `~/.codex/AGENTS.md` or merge its guidance into your existing file.

## Safety model

The Worker only receives a high-quality local context package: top-level tree, applicable `AGENTS.md`, `package.json`, Git status, targeted `rg` matches, and capped candidate file excerpts. It does not receive arbitrary shell access. For implementation it may return a unified diff; the bridge accepts only Git-style paths inside the selected workspace and uses `git apply --check` before applying it.

Automatic validation only runs recognized `package.json` scripts: `test`, `check`, `lint`, and `build` (up to three). It does not execute worker-supplied commands, network commands, production operations, dangerous Git operations, `sudo`, or destructive shell commands. The bridge refuses filesystem root and the home directory as workspace targets. V1 intentionally operates in the selected workspace; isolated Git worktrees are reserved for a later version.

An `ESCALATE`, an invalid patch, provider failure, or exhausted rework budget produces `needs_sol: true` with a brief reason/question rather than the full task history.

## Development and tests

```bash
npm run check
npm run build
npm test
```

Tests use `MockProvider`; they make no provider calls. Coverage includes configuration parsing, OpenAI-compatible response/error handling, malformed-output repair, artifact storage, firewall truncation, validation-failure escalation, automatic `REWORK` → `PASS`, staged/unstaged diff collection, and compact escalation handling.

## Layout

```text
src/
  mcp/          # stdio server and the three public tools
  agents/       # Qwen worker, GLM reviewer, rework workflow
  providers/    # extensible provider interface and OpenAI-compatible adapter
  context/      # local context builder and output firewall
  workspace/    # read/search/git/patch/validation safety boundary
  artifacts/    # private, per-task files and usage metadata
  prompts/      # fixed compact worker/reviewer system prompts
tests/          # offline MockProvider verification
```

## Current V1 limitations

- It requires providers that support the OpenAI-compatible chat-completions shape; no vendor-specific streaming or tool-calling adapter is included yet.
- Qwen receives curated static repository context rather than interactive filesystem tools. Large or ambiguous tasks may need a follow-up call or escalate.
- A generated patch is applied directly to the chosen local workspace after Git checks. There is no V1 Git worktree isolation or automatic rollback.
- Validation recognizes Node/npm, Go, Maven, Gradle, and common Python/Pytest manifests. Other toolchains still require a provider-specific validator or manual validation.
