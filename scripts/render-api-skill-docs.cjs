#!/usr/bin/env node
'use strict';

// 把 cnb-sdk-generator 的 skill 产物适配成 MindFourm 的 API 文档。
//
// 为什么需要适配层：生成器的模板是给 CNB 平台自己用的 —— 请求地址写
// ${CNB_API_ENDPOINT}、认证头写 $CNB_TOKEN、要求 curl 带 traceparent、来源链接指向
// api.cnb.cool，而且会丢掉 HTTP 状态码表、请求头参数、OAuth 权限范围与参数约束。
//
// 分工（两个生成器都保留，各做自己擅长的）：
//   - cnb-sdk-generator：操作清单与文件布局（每个服务一个目录、operationId 命名）、
//     以及把 schema 展开成带注释的 JSON 结构示例（$ref 解析、循环引用、字段注释）。
//   - 本模块：所有 MindFourm 语义 —— 认证与权限范围、请求地址与调用示例、参数表、
//     HTTP 状态码表、类型与约束文案。
//
// 用法（一般由 scripts/generate-api-skill.cjs 调用）：
//   node scripts/render-api-skill-docs.cjs --raw <生成器输出目录> --output docs/api/skill

const fs = require('node:fs');
const path = require('node:path');

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

const TYPE_LABELS = {
  string: '字符串',
  integer: '整数',
  number: '数字',
  boolean: '布尔值',
  object: '对象',
  array: '数组',
  file: '文件',
};

const FORMAT_LABELS = {
  'date-time': '日期时间',
  uuid: 'UUID',
  uri: '网址',
  email: '电子邮箱',
  binary: '二进制文件',
  int32: '32 位整数',
  int64: '64 位整数',
};

const BASE_URL_VAR = '$FORUM_BASE_URL';
const TOKEN_VAR = '$ACCESS_TOKEN';

// ---------- 通用小工具 ----------

function table(headers, rows) {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

function inlineCode(value) {
  return `\`${String(value).replace(/`/g, '\\`')}\``;
}

function collapse(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// 表格单元格里的换行会拆坏表格；竖线会让列错位。
function cell(text) {
  return collapse(text).replace(/\|/g, '\\|') || '-';
}

// 说明文案常常自带句号，再接约束列表会出现「。。；」。统一去掉句末标点后再拼。
function joinNotes(...groups) {
  const parts = groups
    .flat()
    .map((part) => collapse(part))
    .filter(Boolean)
    .map((part) => part.replace(/[。；;]+$/, ''));
  return cell(parts.join('；'));
}

function resolveRef(contract, ref) {
  if (!ref) return undefined;
  const name = String(ref).replace('#/components/schemas/', '');
  return contract.components?.schemas?.[name];
}

function unwrapRoot(schema, contract) {
  // 单元素 allOf 只是给 $ref 挂 description/example 的写法，拆掉外壳。
  if (Array.isArray(schema?.allOf) && schema.allOf.length === 1 && !schema.allOf[0].properties) {
    return { ...schema.allOf[0], ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== 'allOf')) };
  }
  return schema;
}

function typeLabel(schema, contract) {
  if (!schema) return '未声明';
  if (schema.$ref) return String(schema.$ref).split('/').pop();
  const resolved = unwrapRoot(schema, contract);
  if (resolved?.type === 'array') {
    return resolved.items ? `${typeLabel(resolved.items, contract)}数组` : '数组';
  }
  // 二进制上传字段走 formData：对调用方来说它就是「文件」，不必暴露 JSON 类型。
  if (resolved?.format === 'binary') return '文件';
  const raw = resolved?.type || (resolved?.properties ? 'object' : undefined);
  if (!raw) return '未声明';
  const label = TYPE_LABELS[raw] || raw;
  const format = resolved.format ? FORMAT_LABELS[resolved.format] || resolved.format : '';
  return format ? `${label}（${format}）` : label;
}

function constraintNotes(schema) {
  const resolved = schema || {};
  const notes = [];
  if (Array.isArray(resolved.enum)) notes.push(`可选值：${resolved.enum.map((item) => String(item)).join(' / ')}`);
  if (resolved.minLength != null) notes.push(`最短 ${resolved.minLength}`);
  if (resolved.maxLength != null) notes.push(`最长 ${resolved.maxLength}`);
  if (resolved.minimum != null) notes.push(`最小 ${resolved.minimum}`);
  if (resolved.maximum != null) notes.push(`最大 ${resolved.maximum}`);
  if (resolved.default != null) notes.push(`默认 ${String(resolved.default)}`);
  if (resolved['x-nullable']) notes.push('可为 null');
  return notes;
}

// 契约里同一请求头有时会以不同大小写出现两次（如 idempotency-key / Idempotency-Key）。
// 按「位置 + 小写名」合并，保留必填标记与更完整的描述。
function mergeParameters(parameters) {
  const merged = new Map();
  for (const parameter of parameters) {
    const key = `${parameter.in}\u0000${String(parameter.name).toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...parameter });
      continue;
    }
    merged.set(key, {
      ...existing,
      required: Boolean(existing.required || parameter.required),
      description: (parameter.description || '').length > (existing.description || '').length
        ? parameter.description
        : existing.description,
    });
  }
  return [...merged.values()];
}

function operationParameters(pathItem, operation) {
  return mergeParameters([...(pathItem.parameters || []), ...(operation.parameters || [])]);
}

function successCodes(operation) {
  return Object.keys(operation.responses || {})
    .filter((code) => /^2\d\d$/.test(code))
    .sort();
}

function authKind(operation) {
  const security = operation.security;
  if (security === undefined || security === null || security.length === 0) return 'public';
  const bearer = security.some((requirement) => Object.prototype.hasOwnProperty.call(requirement, 'MindAuthBearer'));
  const anonymous = security.some((requirement) => Object.keys(requirement).length === 0);
  if (bearer && anonymous) return 'optional';
  if (bearer) return 'required';
  return 'public';
}

// ---------- 从生成器产物里取 JSON 结构示例 ----------

// 生成器把 schema 展开成带 `// 说明` 注释的 JSON。取出围栏内的内容。
function extractJsonBlocks(markdown) {
  const blocks = [];
  const pattern = /```json\n([\s\S]*?)\n```/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) blocks.push(match[1]);
  return blocks;
}

function splitSections(markdown) {
  const sections = new Map();
  const parts = markdown.split(/^## /m);
  for (const part of parts.slice(1)) {
    sections.set(part.split('\n', 1)[0].trim(), part);
  }
  return sections;
}

// 去掉 `// 行尾注释` 与尾逗号，得到可放进 shell heredoc 的合法 JSON。
// 生成器输出的注释挂在值后面，所以按字符扫一遍、跳过注释区间，保留换行与缩进。
function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      // 跳到行尾，但不要把换行本身吃掉。
      while (index < text.length && text[index] !== '\n') index += 1;
      index -= 1;
      continue;
    }
    out += char;
  }
  return out;
}

function cleanupJson(text) {
  const withoutComments = stripJsonComments(text)
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line, index, all) => !(line === '' && index === all.length - 1))
    .join('\n');
  // 去掉 `}` 或 `]` 之前的尾逗号。
  return withoutComments.replace(/,(\s*[}\]])/g, '$1');
}

function extractRequestJson(sections) {
  const request = sections.get('请求信息') || '';
  const blocks = extractJsonBlocks(request);
  return blocks.length ? blocks[blocks.length - 1] : null;
}

function extractResponseJson(sections) {
  const response = sections.get('响应信息') || '';
  const blocks = extractJsonBlocks(response);
  return blocks.length ? blocks[0] : null;
}

// ---------- 各段落渲染 ----------

function renderAuthSection(operation, contract) {
  const kind = authKind(operation);
  const lines = ['## 认证与权限', ''];
  if (kind === 'public') lines.push('- 认证：公开；无需 access token。');
  else if (kind === 'optional') lines.push('- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。');
  else lines.push('- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。');

  const required = operation['x-required-scopes'] || [];
  const optional = operation['x-oauth-scopes-if-bearer'] || [];
  if (required.length) lines.push(`- 必须的权限范围：${required.map(inlineCode).join('、')}。`);
  else if (optional.length) lines.push(`- 带 Bearer 时需要的权限范围：${optional.map(inlineCode).join('、')}。`);
  if (required.length && optional.length) {
    lines.push(`- 带 Bearer 时需要的权限范围：${optional.map(inlineCode).join('、')}。`);
  }
  if (kind === 'required' || kind === 'optional') {
    lines.push('- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。');
  }

  const rateLimit = operation['x-rate-limit'];
  if (rateLimit?.limit != null) {
    const basis = rateLimit.basis === 'authenticated_user_or_session_or_ip'
      ? '按账号 / 会话 / 来源 IP'
      : String(rateLimit.basis);
    lines.push(`- 限流：${rateLimit.limit} 次 / ${rateLimit.window_seconds} 秒（${basis}）；超限返回 \`429\`，按 \`Retry-After\` 等待。`);
  }
  return lines.join('\n');
}

// 参数的类型与约束统一以转换器的判断为准：契约是 3.0（约束写在 schema 里），
// 转换器会把它折叠成 2.0 的参数形态。两边各判一次迟早会漂移。
function toSwaggerParameter(parameter) {
  const converter = require(path.join(__dirname, 'openapi-to-swagger2.cjs'));
  return converter.convertParameter(parameter);
}

function renderParameterRows(parameters, contract) {
  return parameters.map((raw) => {
    const parameter = toSwaggerParameter(raw);
    const schema = { ...(parameter.schema || parameter) };
    return [
      inlineCode(parameter.name),
      typeLabel(schema, contract),
      parameter.required ? '是' : '否',
      joinNotes(parameter.description, constraintNotes(schema)),
    ];
  });
}

function renderRequestSection(entry, operation, pathItem, contract, requestJson) {
  const lines = ['## 请求', ''];
  lines.push(`**方法：** ${inlineCode(entry.method.toUpperCase())}`, '');
  const basePath = (contract.servers?.[0]?.url) || '';
  lines.push(`**地址：** ${inlineCode(`${BASE_URL_VAR}${basePath}${entry.path}`)}`, '');

  const headerParams = operationParameters(pathItem, operation)
    .filter((parameter) => parameter.in === 'header');
  if (headerParams.length) {
    lines.push('### 请求头', '');
    lines.push(table(['请求头', '类型', '必填', '说明'], renderParameterRows(headerParams, contract)));
    lines.push('');
  }

  const pathParams = operationParameters(pathItem, operation)
    .filter((parameter) => parameter.in === 'path');
  if (pathParams.length) {
    lines.push('### 路径参数', '');
    lines.push(table(['参数', '类型', '必填', '说明'], renderParameterRows(pathParams, contract)));
    lines.push('');
  }

  const queryParams = operationParameters(pathItem, operation)
    .filter((parameter) => parameter.in === 'query');
  if (queryParams.length) {
    lines.push('### 查询参数', '');
    lines.push(table(['参数', '类型', '必填', '说明'], renderParameterRows(queryParams, contract)));
    lines.push('');
  }

  const requestBody = operation.requestBody;
  const multipart = requestBody?.content?.['multipart/form-data'];
  if (multipart?.schema) {
    const schema = multipart.schema;
    const required = new Set(schema.required || []);
    lines.push('### 表单参数', '', `内容类型：${inlineCode('multipart/form-data')}。`, '');
    lines.push(table(['参数', '类型', '必填', '说明'], Object.entries(schema.properties || {}).map(([name, property]) => {
      return [
        inlineCode(name),
        typeLabel(property, contract),
        required.has(name) ? '是' : '否',
        joinNotes(property.description, constraintNotes(property)),
      ];
    })));
    lines.push('');
  } else if (requestJson) {
    lines.push('### 请求体', '');
    lines.push(`内容类型：${inlineCode('application/json')}${requestBody?.required ? '；请求体必填' : '；请求体可省略'}。`, '');
    lines.push('```json', requestJson, '```', '');
  } else if (requestBody?.content) {
    const contentType = Object.keys(requestBody.content)[0];
    lines.push('### 请求体', '', `内容类型：${inlineCode(contentType || '未声明')}。`, '');
  }

  return lines.join('\n').replace(/\n+$/, '');
}

function renderResponseSection(entry, operation, contract, responseJson, syntheticNames) {
  const lines = ['## 响应', ''];
  const responses = operation.responses || {};
  const rows = Object.entries(responses).map(([code, response]) => {
    const status = code === 'default' ? 'default' : code;
    const note = response.description ? collapse(response.description) : '';
    const extra = code === 'default' ? '（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)）' : '';
    return [inlineCode(status), `${cell(note)}${extra}`.trim()];
  });
  if (rows.length) {
    lines.push('HTTP 状态码：', '', table(['状态', '说明'], rows), '');
  }

  const success = successCodes(operation);
  if (!success.length) {
    lines.push('> 契约未声明成功响应：该接口是否可用、返回什么，取决于站点策略与运行时状态。', '');
    lines.push('调用方应按状态码分支处理，不要假设返回 JSON 结构。', '');
    return lines.join('\n').replace(/\n+$/, '');
  }

  const code = success.includes('200') ? '200' : success[0];
  const response = responses[code];
  const content = response.content || {};
  const contentType = Object.keys(content)[0];
  const schema = contentType ? content[contentType]?.schema : undefined;

  if (!contentType) {
    lines.push(`成功响应（${inlineCode(code)}）没有响应体。`, '');
  } else if (!contentType.includes('json')) {
    lines.push(`成功响应（${inlineCode(code)}）返回 ${inlineCode(contentType)}：直接是文件内容，不使用 \`{ data, meta }\` 信封。`, '');
    lines.push('调用方应检查状态码、`Content-Type`、`ETag` 或文件哈希，不要按 JSON 解析。', '');
  } else if (!schema) {
    lines.push(`当前契约尚未声明成功响应（${inlineCode(code)}）的字段结构，只能提供状态说明。`, '');
  } else {
    const refName = schema.$ref ? String(schema.$ref).split('/').pop() : null;
    const label = refName
      ? (syntheticNames.has(refName) ? '对象（内联结构）' : refName)
      : (Array.isArray(schema.oneOf) ? '以下两种形态之一' : typeLabel(schema, contract));
    lines.push(`**响应结构：** ${label}`, '');
    if (Array.isArray(schema.oneOf)) {
      lines.push('该接口按查询参数返回两种分页形态中的一种：', '');
    }
    if (responseJson) {
      lines.push('```json', responseJson, '```', '');
    }
    if (response.headers) {
      lines.push(`**响应头：** ${Object.keys(response.headers).map(inlineCode).join('、')}。`, '');
    }
  }
  return lines.join('\n').replace(/\n+$/, '');
}

function renderCurlSection(entry, operation, pathItem, contract, requestJson) {
  const basePath = (contract.servers?.[0]?.url) || '';
  const kind = authKind(operation);
  const allParameters = operationParameters(pathItem, operation);

  const queryParams = allParameters.filter((parameter) => parameter.in === 'query');
  const query = queryParams.map((parameter) => `${parameter.name}=<${parameter.name}>`).join('&');
  const url = `${BASE_URL_VAR}${basePath}${entry.path}${query ? `?${query}` : ''}`;

  const lines = ['## 调用示例', '', '```bash'];
  if (kind === 'optional') lines.push('# 可选：带上 Bearer 时按账号权限返回');
  lines.push(`curl --fail-with-body${entry.method === 'get' ? '' : ` -X ${entry.method.toUpperCase()}`} \\`);
  lines.push(`  "${url}" \\`);
  if (kind !== 'public') lines.push(`  -H "Authorization: Bearer ${TOKEN_VAR}" \\`);

  for (const parameter of allParameters.filter((item) => item.in === 'header')) {
    const canonical = parameter.name.replace(/(^|-)([a-z])/g, (match, dash, char) => `${dash}${char.toUpperCase()}`);
    lines.push(`  -H "${canonical}: <${parameter.name}>" \\`);
  }

  const multipart = operation.requestBody?.content?.['multipart/form-data'];
  if (multipart?.schema) {
    const required = new Set(multipart.schema.required || []);
    const fields = Object.entries(multipart.schema.properties || {});
    // 只列必填字段，可选字段用注释提示；否则示例会长得没法读。
    for (const [name, property] of fields) {
      if (!required.has(name)) continue;
      lines.push(property.format === 'binary' ? `  -F "${name}=@/path/to/${name}" \\` : `  -F "${name}=<${name}>" \\`);
    }
    const optional = fields.filter(([name]) => !required.has(name)).map(([name]) => name);
    if (optional.length) lines.push(`  # 可选字段：${optional.join('、')}`);
    else lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  } else if (requestJson) {
    lines.push('  -H "Content-Type: application/json" \\');
    lines.push("  --data @- <<'JSON'");
    lines.push(cleanupJson(requestJson));
    lines.push('JSON');
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }
  lines.push('```');
  return lines.join('\n');
}

// ---------- 文档组装 ----------

function renderDocument({ contract, entry, operation, pathItem, generatorMarkdown, syntheticNames }) {
  const sections = splitSections(generatorMarkdown);
  const requestJson = extractRequestJson(sections);
  const responseJson = extractResponseJson(sections);

  const parts = [`# ${operation.operationId}`, ''];
  parts.push(`> ${entry.method.toUpperCase()} ${(contract.servers?.[0]?.url || '')}${entry.path} · 契约：openapi-public-v1.json`, '');

  const summary = collapse(operation.summary);
  const description = (operation.description || '').trim();
  if (summary) parts.push(summary, '');
  if (description) parts.push(description, '');

  parts.push(renderAuthSection(operation, contract), '');
  parts.push(renderRequestSection(entry, operation, pathItem, contract, requestJson), '');
  parts.push(renderResponseSection(entry, operation, contract, responseJson, syntheticNames), '');
  parts.push(renderCurlSection(entry, operation, pathItem, contract, requestJson), '');

  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function renderSkillIndex({ contract, entries, operations }) {
  const lines = [
    '---',
    'name: MindFourm-API',
    'description: 调用 MindFourm 公开 V1 API（论坛讨论、资源中心、云存档、联机会话等）的完整技能包。'
      + `需要设置 ${BASE_URL_VAR} 与 ${TOKEN_VAR} 环境变量。`,
    'requires:',
    '  bins: [curl]',
    `  env: [${BASE_URL_VAR.replace('$', '')}]`,
    '---',
    '',
    '# MindFourm API 技能文档',
    '',
    '本技能包由 `openapi-public-v1.json` 生成，覆盖公开 V1 契约中的全部接口。',
    '每个接口一个文档，包含认证要求、权限范围、参数、响应结构与可直接运行的 curl 示例。',
    '',
    '## 基础配置',
    '',
    `- \`${BASE_URL_VAR}\`：站点地址，例如 \`https://mdtbbs.cn\`。`,
    `- \`${TOKEN_VAR}\`：MindAuth access token；公开接口无需携带。`,
    '- 请求头：认证用 `Authorization: Bearer <token>`；JSON 请求体用 `Content-Type: application/json`。',
    '',
    '## 约定',
    '',
    '- JSON 接口返回 `{ data, meta }` 信封；错误返回 `{ error, meta }`，详见 [errors-v1.md](../errors-v1.md)。',
    '- 控制流应依据 HTTP 状态码与稳定的 `error.code`，不要匹配 `message` 文案。',
    '- 限流、权限范围按接口分别声明，见各接口文档的「认证与权限」。',
    '- 文件、图片与重定向接口返回原始内容，不走 JSON 信封。',
    '',
    '## 接口索引',
    '',
  ];

  const byService = new Map();
  for (const entry of entries) {
    if (!byService.has(entry.service)) byService.set(entry.service, []);
    byService.get(entry.service).push(entry);
  }
  for (const service of [...byService.keys()].sort()) {
    lines.push(`### ${service}`, '');
    lines.push(table(['接口', '说明'], byService.get(service).map((entry) => {
      const operation = operations.get(`${entry.method} ${entry.path}`);
      // 契约里 122 个操作没有 summary；退回「方法 + 路径」，比空占位有用。
      const summary = collapse(operation.summary) || `${entry.method.toUpperCase()} ${entry.path}`;
      return [`[${operation.operationId}](./${entry.relativePath})`, cell(summary)];
    })));
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// ---------- 对外接口 ----------

function collectOperations(contract) {
  const operations = new Map();
  for (const [route, pathItem] of Object.entries(contract.paths || {})) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) operations.set(`${method} ${route}`, pathItem[method]);
    }
  }
  return operations;
}

function renderApiSkillDocs({ contract, entries, rawDir, outputDir }) {
  const operations = collectOperations(contract);
  const converter = require(path.join(__dirname, 'openapi-to-swagger2.cjs'));
  // 提升产生的合成名靠跑一遍转换器得到，不靠命名规则猜。
  const probe = JSON.parse(JSON.stringify(contract));
  const syntheticNames = converter.hoistInlineSchemas(probe);

  fs.rmSync(outputDir, { recursive: true, force: true });
  const written = [];
  for (const entry of entries) {
    const rawPath = path.join(rawDir, entry.service.toLowerCase(), entry.file);
    const generatorMarkdown = fs.readFileSync(rawPath, 'utf8');
    const operation = operations.get(`${entry.method} ${entry.path}`);
    const pathItem = contract.paths[entry.path];
    const document = renderDocument({
      contract,
      entry,
      operation,
      pathItem,
      generatorMarkdown,
      syntheticNames,
    });
    const target = path.join(outputDir, entry.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, document);
    written.push(entry.relativePath);
  }

  fs.writeFileSync(path.join(outputDir, 'SKILL.md'), renderSkillIndex({ contract, entries, operations }));
  return written;
}

// CI 漂移检查：产物必须与契约一致，且不能残留 CNB 专有内容。
// 这里不重跑生成器（CI 不该依赖外部二进制与网络），而是从契约重新推导每个文档
// 必须出现的事实 —— 改契约不重新生成、或手改文档改坏语义，都会在这里失败。
function checkApiSkillDocs({ contract, outputDir }) {
  const converter = require(path.join(__dirname, 'openapi-to-swagger2.cjs'));
  const problems = [];
  const entries = converter.planOperations(contract);
  const operations = collectOperations(contract);

  if (!fs.existsSync(path.join(outputDir, 'SKILL.md'))) {
    problems.push('缺少 SKILL.md');
  }

  // 内联提升出来的合成名靠跑一遍转换器得到，不靠命名规则猜。
  const probe = JSON.parse(JSON.stringify(contract));
  const synthetic = converter.hoistInlineSchemas(probe);

  const expected = new Set(entries.map((entry) => entry.relativePath));
  for (const entry of entries) {
    const target = path.join(outputDir, entry.relativePath);
    if (!fs.existsSync(target)) {
      problems.push(`缺少 ${entry.relativePath}`);
      continue;
    }
    const text = fs.readFileSync(target, 'utf8');
    const operation = operations.get(`${entry.method} ${entry.path}`);
    const report = (message) => problems.push(`${entry.relativePath}：${message}`);

    if (!text.includes(`\`${entry.method.toUpperCase()}\``)) report('缺少请求方法');
    if (text.includes('CNB_API_ENDPOINT') || text.includes('CNB_TOKEN') || text.includes('api.cnb.cool')
      || text.includes('traceparent') || text.includes('vnd.cnb')) {
      report('残留 CNB 专有内容');
    }
    if (text.includes('ibase.') || text.includes('struct {') || text.includes('interface{}')) {
      report('残留 Go 类型转储');
    }

    const basePath = contract.servers?.[0]?.url || '';
    if (!text.includes(`${basePath}${entry.path}`)) report('请求地址与契约不符');

    // 认证与权限范围：契约怎么声明，文档就得怎么写。
    const kind = authKind(operation);
    const expectedAuth = {
      public: '认证：公开',
      optional: '认证：可选',
      required: '认证：需要 MindAuth access token',
    }[kind];
    if (!text.includes(expectedAuth)) report(`认证标注与契约不符（应为「${expectedAuth}」）`);
    for (const scope of operation['x-required-scopes'] || []) {
      if (!text.includes(`\`${scope}\``)) report(`缺少权限范围 ${scope}`);
    }
    for (const scope of operation['x-oauth-scopes-if-bearer'] || []) {
      if (!text.includes(`\`${scope}\``)) report(`缺少 Bearer 权限范围 ${scope}`);
    }

    // 限流：契约给了数字，文档就得给同样的数字。
    const rateLimit = operation['x-rate-limit'];
    if (rateLimit?.limit != null) {
      if (!text.includes(`${rateLimit.limit} 次`)) report(`缺少限流次数 ${rateLimit.limit}`);
      if (!text.includes(`${rateLimit.window_seconds} 秒`)) report(`缺少限流窗口 ${rateLimit.window_seconds}`);
    }

    // 参数：路径/查询/请求头一个都不能丢。
    for (const parameter of operationParameters(contract.paths[entry.path], operation)) {
      if (!text.includes(`\`${parameter.name}\``)) report(`缺少${parameter.in}参数 ${parameter.name}`);
    }

    // HTTP 状态码表。
    for (const status of Object.keys(operation.responses || {})) {
      if (!text.includes(`\`${status}\``)) report(`缺少 HTTP 状态 ${status}`);
    }

    // 成功响应的模型名：契约引用了哪个 definition，文档里就要出现哪个名字
    // （内联提升出来的合成名除外，那些在文档里显示为「对象（内联结构）」）。
    const success = successCodes(operation);
    if (success.length) {
      const code = success.includes('200') ? '200' : success[0];
      const schema = operation.responses[code]?.content?.['application/json']?.schema;
      const refName = schema?.$ref ? String(schema.$ref).split('/').pop() : null;
      if (refName && !synthetic.has(refName) && !text.includes(refName)) {
        report(`缺少响应模型 ${refName}`);
      }
    }

    // 正文里的响应示例带 `// 说明` 注释，是给人读的；但 curl 段里 heredoc 的
    // 内容是直接发给服务器的，必须是合法 JSON。
    for (const heredoc of text.matchAll(/<<'JSON'\n([\s\S]*?)\nJSON\n/g)) {
      try {
        JSON.parse(heredoc[1]);
      } catch (error) {
        report(`curl 示例里的 JSON 不合法（${error.message}）`);
      }
    }

    // curl 示例必须存在。
    if (!/## 调用示例\n\n```bash\n/.test(text)) report('缺少调用示例');
  }

  // 产物里多出来的操作文档 = 契约删了接口但文档没重新生成。
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return walk(full);
    return item.name === 'SKILL.md' ? [] : [path.relative(outputDir, full)];
  });
  if (fs.existsSync(outputDir)) {
    for (const file of walk(outputDir)) {
      if (!expected.has(file)) problems.push(`多余的产物：${file}`);
    }
  }

  // 索引必须列出全部接口，且链接可达。
  const skillPath = path.join(outputDir, 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    const index = fs.readFileSync(skillPath, 'utf8');
    for (const entry of entries) {
      const link = `](./${entry.relativePath})`;
      if (!index.includes(link)) problems.push(`SKILL.md 未收录 ${entry.relativePath}`);
    }
  }
  return problems;
}

function main(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    options.set(argv[index].replace(/^--/, ''), argv[index + 1]);
  }
  const contractPath = options.get('contract') || path.join(__dirname, '..', 'openapi-public-v1.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const converter = require(path.join(__dirname, 'openapi-to-swagger2.cjs'));
  const entries = converter.planOperations(contract);
  const files = renderApiSkillDocs({
    contract,
    entries,
    rawDir: options.get('raw'),
    outputDir: path.resolve(options.get('output')),
  });
  process.stdout.write(`已渲染 ${files.length} 个接口文档 → ${options.get('output')}\n`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { renderApiSkillDocs, checkApiSkillDocs, stripJsonComments, cleanupJson, typeLabel, constraintNotes };
