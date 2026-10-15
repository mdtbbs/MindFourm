#!/usr/bin/env node
'use strict';

// 用 cnb-sdk-generator 从公开 V1 契约生成 API Skill 文档包。
//
// 流水线分三步，每步都有存在的硬理由：
//   1. 转换 scripts/openapi-to-swagger2.cjs：生成器只认 Swagger 2.0。直接喂
//      OpenAPI 3.0 会静默丢掉 requestBody 与响应结构，且匿名内联对象会退化成
//      Go struct 转储（字段顺序随运行变化）。
//   2. 生成 cnb-sdk-generator：产出每个操作的骨架文档 + SKILL.md 索引。
//   3. 适配 scripts/render-api-skill-docs.cjs：生成器的模板是 CNB 平台专用的
//      （${CNB_API_ENDPOINT}、CNB_TOKEN、traceparent、api.cnb.cool）。适配层按
//      MindFourm 契约重写正文，并补齐生成器模板丢掉的 HTTP 状态码、请求头参数、
//      OAuth 权限范围与限流说明。
//
// 用法：
//   node scripts/generate-api-skill.cjs [--output docs/api/skill] [--check]
//   --check 只校验产物是否与契约一致（CI 用），不重新生成。

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const converterPath = path.join(__dirname, 'openapi-to-swagger2.cjs');
const rendererPath = path.join(__dirname, 'render-api-skill-docs.cjs');
const contractPath = path.join(root, 'openapi-public-v1.json');

// 生成器版本与各平台哈希一起钉住：CI 与本地要产出同一份文档，
// 换版本必须显式改这里，顺带强制复查模板变化。
const GENERATOR_VERSION = '1.1.5';
const GENERATOR_ASSETS = {
  'linux-x64': { name: 'cnb-sdk-generator_linux_amd64', sha256: 'b9422743244607f7fd5474f39ed85c5a83327d51fc67ed5f5ce2a877aa9f745b' },
  'linux-arm64': { name: 'cnb-sdk-generator_linux_arm64', sha256: '7cf68e43c639094812e75327d65ee33edf44c07a6500969a6b5faca92695e9e5' },
  'darwin-x64': { name: 'cnb-sdk-generator_darwin_amd64', sha256: 'e4f7ca5b70bd0063081129200485ff696fa28935e3739fc34f59f7007b8433c6' },
  'darwin-arm64': { name: 'cnb-sdk-generator_darwin_arm64', sha256: 'b05aaad06be774acab00c406dfb60138e0f0d8718ca022d78976775e94f312c4' },
};

const DEFAULT_OUTPUT = path.join(root, 'docs', 'api', 'skill');

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, check: false, generator: process.env.CNB_SDK_GENERATOR_PATH || '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index]);
    else if (arg === '--generator') options.generator = path.resolve(argv[++index]);
    else throw new Error(`无法识别的参数：${arg}`);
  }
  return options;
}

function platformKey() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${process.platform}-${arch}`;
}

function downloadGenerator(target) {
  const asset = GENERATOR_ASSETS[platformKey()];
  if (!asset) {
    throw new Error(`cnb-sdk-generator ${GENERATOR_VERSION} 没有 ${platformKey()} 预编译产物；`
      + '请用 --generator 指定本地二进制。');
  }
  const url = `https://cnb.cool/cnb/sdk/cnb-sdk-generator/-/releases/download/${GENERATOR_VERSION}/${asset.name}`;
  process.stderr.write(`[api-skill] 下载 ${url}\n`);
  execFileSync('curl', ['--fail', '--location', '--retry', '3', '--output', target, url], { stdio: ['ignore', 'ignore', 'inherit'] });

  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  if (digest !== asset.sha256) {
    throw new Error(`cnb-sdk-generator 哈希不匹配：期望 ${asset.sha256}，实际 ${digest}。`
      + '上游可能重新发布了同名版本，请复查模板变化后更新 GENERATOR_ASSETS。');
  }
  fs.chmodSync(target, 0o755);
}

function resolveGenerator(options) {
  if (options.generator) return options.generator;
  const cached = path.join(os.tmpdir(), `cnb-sdk-generator-${GENERATOR_VERSION}-${platformKey()}`);
  if (fs.existsSync(cached)) {
    const asset = GENERATOR_ASSETS[platformKey()];
    const digest = crypto.createHash('sha256').update(fs.readFileSync(cached)).digest('hex');
    if (asset && digest === asset.sha256) return cached;
    fs.rmSync(cached, { force: true });
  }
  downloadGenerator(cached);
  return cached;
}

function main(argv) {
  const options = parseArgs(argv);
  const converter = require(converterPath);
  const renderer = require(rendererPath);

  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  if (options.check) {
    const problems = renderer.checkApiSkillDocs({ contract, outputDir: options.output });
    if (problems.length) {
      process.stderr.write(`[api-skill] 产物与契约不一致（${problems.length} 处）：\n`);
      for (const problem of problems.slice(0, 40)) process.stderr.write(`  - ${problem}\n`);
      if (problems.length > 40) process.stderr.write(`  ... 其余 ${problems.length - 40} 处省略\n`);
      process.stderr.write('[api-skill] 运行 `node scripts/generate-api-skill.cjs` 重新生成。\n');
      process.exitCode = 1;
    } else {
      process.stdout.write(`[api-skill] ${options.output} 与契约一致。\n`);
    }
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindfourm-api-skill-'));
  const swaggerPath = path.join(workDir, 'swagger2.json');
  const rawDir = path.join(workDir, 'raw');

  // 步骤 1：OpenAPI 3.0 → Swagger 2.0（含内联 schema 提升）
  const { swagger, entries } = converter.convertDocument(contract);
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(swaggerPath, `${JSON.stringify(swagger, null, 2)}\n`);

  // 步骤 2：调用生成器。它会把 SKILL.md 写到当前工作目录，所以 cwd 要设成临时目录。
  const generator = resolveGenerator(options);
  execFileSync(generator, ['-l', 'skill', '-i', swaggerPath, '-o', rawDir], { cwd: workDir, stdio: ['ignore', 'ignore', 'inherit'] });

  // 步骤 3：按 MindFourm 契约重写正文
  const files = renderer.renderApiSkillDocs({
    contract,
    entries,
    rawDir,
    outputDir: options.output,
  });

  process.stdout.write(`[api-skill] 已生成 ${files.length} 个操作文档 + SKILL.md → ${path.relative(root, options.output)}\n`);
  fs.rmSync(workDir, { recursive: true, force: true });
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[api-skill] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { GENERATOR_VERSION, GENERATOR_ASSETS, DEFAULT_OUTPUT, parseArgs };
