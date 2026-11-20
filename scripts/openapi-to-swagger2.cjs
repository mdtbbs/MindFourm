#!/usr/bin/env node
'use strict';

// OpenAPI 3.0 → Swagger 2.0 转换器。
//
// 为什么需要这一层：cnb-sdk-generator 只解析 Swagger 2.0（go-openapi/spec +
// #/definitions 引用）。直接把 openapi-public-v1.json 交给它，requestBody 和
// 响应结构会被静默丢弃，生成的文档只剩路径和空壳。这里把公开 V1 契约折叠成
// 生成器能读的形态，转换规则都限定在「不丢失公开契约语义」范围内：
//   - components/schemas        → definitions，$ref 改写
//   - requestBody(json)         → in: body 参数；multipart → in: formData 参数
//   - responses[].content       → responses[].schema；二进制流 → type: file
//   - nullable                  → x-nullable（2.0 无此关键字）
//   - oneOf                     → type: object + x-oneOf（2.0 无此关键字）
//   - 参数 schema 内的 enum/format/default/min/max → 提升到参数级（2.0 形态）
//   - 标签统一成 ASCII slug，未打标签的操作补默认标签（无标签操作会被生成器跳过）
//   - 文件名取自 operationId（目录已带模块上下文，文件名保留全名以便与契约对照）
//   - 响应体/请求体里的「匿名内联对象」提升为命名 definition（见 hoistInlineSchemas）
//
// 产物是中间文件，不提交；它的消费方是 scripts/generate-api-skill.cjs。

const fs = require('node:fs');
const path = require('node:path');

// 公开契约里的中文标签映射到稳定的 ASCII slug，生成器用它派生目录名。
const TAG_SLUGS = {
  '联机会话': 'v1-multiplayer',
  '联机邀请': 'v1-multiplayer-invitations',
  '加入请求': 'v1-multiplayer-join-requests',
  '中继': 'v1-multiplayer-relay',
  '活动': 'v1-presence-activities',
  '游戏内容 / 云存档': 'v1-game-saves',
  '游戏内容 / 小队共享存档': 'v1-squad-saves',
  '游戏内容 / 基地延时摄影': 'v1-timelapses',
  '公共 V1 / Blob 存储': 'v1-blobs',
  '好友': 'v1-friends',
  '在线状态': 'v1-presence',
  '社交隐私': 'v1-social-privacy',
  '实时事件': 'v1-realtime-events',
};
const DEFAULT_TAG = 'v1-misc';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

function slugifyTag(tag) {
  if (TAG_SLUGS[tag]) return TAG_SLUGS[tag];
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) return tag;
  throw new Error(
    `标签「${tag}」不是 ASCII slug，也没有登记中文映射；请在 scripts/openapi-to-swagger2.cjs 的 TAG_SLUGS 中补充。`,
  );
}

// 生成器用 strings.Title+ToLower 派生目录/文件名，这里复刻同一套规则，
// 保证仓库里的产物路径可被预计算、可被 CI 校验。
function buildServiceName(tag) {
  const parts = tag.split(/[-\s]+/).filter(Boolean);
  const rest = parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return parts[0].toLowerCase() + rest.join('');
}

// 生成器把文件名的种子定为「去掉 . 和括号」的 operationId；这里复刻同一条规则。
// 不再缩短成方法名：公开契约里 241 个 operationId 全局唯一，用全名可以让产物与契约一一对应、
// 可直接 grep，也消掉了同名方法撞车后的回退命名分支。
function operationName(operationId) {
  return operationId.replace(/[.()]/g, '');
}

// 生成器只对「命名模型」渲染 JSON 结构；匿名内联对象会退化成 Go struct 转储，
// 字段顺序随 Go 的 map 遍历随机变化（实测 241 个操作里 69 个每次生成都不一样）。
// 这里把内联对象提升成命名 definition，让生成器走命名模型路径，顺带让产物稳定可校验。
const HOIST_UNSUPPORTED = new Set(['additionalProperties']);

function pascalize(value) {
  return String(value)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function routeName(route, method) {
  const tokens = route.split('/').filter(Boolean).map((part) => part.replace(/[{}]/g, ''));
  return `${pascalize(tokens.join(' '))}${method.charAt(0).toUpperCase()}${method.slice(1)}`;
}

// 单元素 allOf 只是 3.0 给 $ref 挂 description/example 的写法，折叠后再判断是否内联。
function foldSingleAllOf(schema) {
  if (!Array.isArray(schema.allOf) || schema.allOf.length !== 1) return schema;
  const [inner] = schema.allOf;
  if (!inner || inner.$ref) return schema;
  const { allOf, ...rest } = schema;
  return { ...inner, ...Object.fromEntries(Object.entries(rest).filter(([key]) => !(key in inner))) };
}

function isInlineObject(schema) {
  return Boolean(schema && !schema.$ref && typeof schema === 'object'
    && schema.type === 'object' && schema.properties && Object.keys(schema.properties).length);
}

function createHoister(definitions, usedNames) {
  function uniqueName(base) {
    let name = base;
    let index = 2;
    while (usedNames.has(name)) name = `${base}${index++}`;
    usedNames.add(name);
    definitions[name] = null; // 占位，稍后回填
    return name;
  }

  // 返回替换后的 schema：内联对象 → $ref，其余递归改写。
  function walk(schema, nameHint) {
    if (!schema || typeof schema !== 'object') return schema;
    if (schema.$ref) return schema;

    const folded = foldSingleAllOf(schema);
    if (folded !== schema) return walk(folded, nameHint);

    if (Array.isArray(schema.items)) return schema; // 2.0 的元组写法，公开契约未使用
    if (schema.items) {
      const items = walk(schema.items, `${nameHint}Item`);
      if (items === schema.items) return schema;
      return { ...schema, items };
    }

    if (!schema.properties) return schema;

    const properties = {};
    for (const [propName, rawPropSchema] of Object.entries(schema.properties)) {
      let propSchema = rawPropSchema;
      if (isInlineObject(propSchema)) {
        const name = uniqueName(`${nameHint}${pascalize(propName)}`);
        definitions[name] = walk(propSchema, name);
        propSchema = { $ref: `#/components/schemas/${name}` };
      } else if (propSchema && propSchema.items && isInlineObject(propSchema.items)) {
        const name = uniqueName(`${nameHint}${pascalize(propName)}Item`);
        definitions[name] = walk(propSchema.items, name);
        propSchema = { ...propSchema, items: { $ref: `#/components/schemas/${name}` } };
      } else {
        propSchema = walk(propSchema, `${nameHint}${pascalize(propName)}`);
      }
      properties[propName] = propSchema;
    }

    if (isInlineObject(schema)) {
      // 顶层内联对象由调用方决定是否提升，这里只递归改写子节点。
      return { ...schema, properties };
    }
    return { ...schema, properties };
  }

  // 只递归改写子节点：用于既有 definition，根节点本身已经具名。
  function rewrite(schema, nameHint) {
    return walk(schema, nameHint);
  }

  function hoistRoot(schema, baseName) {
    const folded = foldSingleAllOf(schema);
    if (folded.$ref) return folded;
    if (isInlineObject(folded)) {
      const name = uniqueName(baseName);
      definitions[name] = walk(folded, name);
      return { $ref: `#/components/schemas/${name}` };
    }
    if (folded.items && isInlineObject(foldSingleAllOf(folded.items))) {
      const name = uniqueName(`${baseName}Item`);
      definitions[name] = walk(foldSingleAllOf(folded.items), name);
      return { ...folded, items: { $ref: `#/components/schemas/${name}` } };
    }
    if (folded.properties) return walk(folded, baseName);
    return folded;
  }

  return { hoistRoot, rewrite };
}

// 把契约里的内联对象就地提升；返回新增的 definition 名字集合（供适配层判断名字是否为合成名）。
function hoistInlineSchemas(document) {
  const components = document.components || (document.components = {});
  const schemas = components.schemas || (components.schemas = {});
  const definitions = {};
  const usedNames = new Set(Object.keys(schemas));

  // 先处理已有 definition 内部的嵌套内联对象（公开契约里有 4 个）。
  {
    const { rewrite } = createHoister(definitions, usedNames);
    for (const [name, schema] of Object.entries(schemas)) {
      const rewritten = rewrite(schema, name);
      if (rewritten !== schema) schemas[name] = rewritten;
    }
  }

  const synthetic = new Set();
  const { hoistRoot } = createHoister(definitions, usedNames);
  for (const [route, pathItem] of Object.entries(document.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const responses = operation.responses || {};
      for (const [code, response] of Object.entries(responses)) {
        const json = response?.content?.['application/json'];
        if (!json?.schema) continue;
        const statusHint = code === '200' || code === '201' ? '' : pascalize(code);
        const rewritten = hoistRoot(json.schema, `${routeName(route, method)}${statusHint}Response`);
        if (rewritten !== json.schema) json.schema = rewritten;
      }

      const json = operation.requestBody?.content?.['application/json'];
      if (json?.schema) {
        const rewritten = hoistRoot(json.schema, `${routeName(route, method)}RequestBody`);
        if (rewritten !== json.schema) json.schema = rewritten;
      }
    }
  }

  for (const [name, schema] of Object.entries(definitions)) {
    if (schema === null) throw new Error(`内联 schema 提升失败：${name} 未被回填`);
    schemas[name] = schema;
    synthetic.add(name);
  }
  return synthetic;
}

// 所有公开操作用到的 tag，按是否为「首个 tag」分开。
// 只有首个 tag 决定目录名，所以只有它需要是 ASCII slug；其余 tag 只是分类信息。
function collectTags(document) {
  const primary = new Set();
  const secondary = new Set();
  for (const pathItem of Object.values(document.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      const tags = operation.tags || [];
      if (tags.length) primary.add(tags[0]);
      for (const tag of tags.slice(1)) secondary.add(tag);
    }
  }
  return { primary: [...primary].sort(), secondary: [...secondary].sort() };
}

// 规划每个公开操作最终落在哪个文件：与生成器的输出保持一致，供生成与校验共用。
function planOperations(document) {
  const entries = [];
  for (const [route, pathItem] of Object.entries(document.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      const tag = slugifyTag((operation.tags || [])[0] || DEFAULT_TAG);
      entries.push({
        path: route,
        method,
        operationId: operation.operationId,
        name: operationName(operation.operationId),
        tag,
        service: buildServiceName(tag),
        file: `${operationName(operation.operationId).toLowerCase()}.md`,
      });
    }
  }

  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.service.toLowerCase()}/${entry.file}`;
    if (seen.has(key)) throw new Error(`生成的文档路径冲突：${key}（${entry.operationId}）`);
    seen.add(key);
    entry.relativePath = key;
  }
  return entries;
}

function rewriteRef(ref) {
  return String(ref).replace(/^#\/components\/schemas\//, '#/definitions/');
}

function convertSchema(schema) {
  if (schema === null || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertSchema);

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref') out.$ref = rewriteRef(value);
    else if (key === 'nullable') out['x-nullable'] = value;
    else if (key === 'oneOf' || key === 'anyOf') out[`x-${key}`] = value.map(convertSchema);
    else if (key === 'properties') {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, value2]) => [name, convertSchema(value2)]));
    }
    else if (key === 'items') out.items = convertSchema(value);
    else if (key === 'additionalProperties') out.additionalProperties = convertSchema(value);
    else if (key === 'allOf') out.allOf = value.map(convertSchema);
    // 2.0 的 discriminator 是字符串（多态基类名），3.0 是对象；对象形态保留为扩展。
    else if (key === 'discriminator' && value && typeof value === 'object') out['x-discriminator'] = value;
    else out[key] = value;
  }

  // 单元素 allOf 只是 3.0 给 $ref 挂 description/nullable 的写法，折叠掉。
  if (Array.isArray(out.allOf) && out.allOf.length === 1) {
    const [inner] = out.allOf;
    const merged = { ...inner };
    for (const [key, value] of Object.entries(out)) {
      if (key === 'allOf') continue;
      if (!(key in merged)) merged[key] = value;
    }
    return merged;
  }
  // oneOf/anyOf 在 2.0 没有对应关键字：保留为扩展，并给一个可渲染的 type。
  if (out['x-oneOf'] || out['x-anyOf']) {
    if (!out.type && !out.$ref) out.type = 'object';
  }
  return out;
}

// 只看约束关键词，判断参数最可能是什么类型。
// 公开契约里有 128 个这样的参数（如 server_id 只有 minimum、cursor 只有 maxLength）。
function inferParameterType(schema) {
  if (schema.minimum !== undefined || schema.maximum !== undefined
    || schema.multipleOf !== undefined || schema.exclusiveMinimum !== undefined
    || schema.exclusiveMaximum !== undefined) {
    return 'number';
  }
  return 'string';
}

function convertParameter(parameter) {
  const out = {
    name: parameter.name,
    in: parameter.in,
    required: parameter.in === 'path' ? true : Boolean(parameter.required),
  };
  if (parameter.description) out.description = parameter.description;

  const schema = convertSchema(parameter.schema || {});
  const scalarKeys = ['type', 'format', 'default', 'enum', 'items', 'minimum', 'maximum',
    'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'multipleOf'];
  for (const key of scalarKeys) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }
  if (out['x-nullable'] === undefined && schema['x-nullable'] !== undefined) out['x-nullable'] = schema['x-nullable'];
  // 3.0 里查询参数可以只写约束（如 {maxLength: 300} 或 {minimum: 1}），2.0 必须有 type。
  // 按约束关键词推断：数值边界对应数字，长度/正则对应字符串，其余按字符串处理。
  if (!out.type) out.type = inferParameterType(schema);
  return out;
}

function convertRequestBody(requestBody) {
  const body = { parameters: [], consumes: [] };
  if (!requestBody || !requestBody.content) return body;
  const required = Boolean(requestBody.required);

  const json = requestBody.content['application/json'];
  if (json && json.schema) {
    body.parameters.push({
      name: 'body',
      in: 'body',
      required,
      ...(requestBody.description ? { description: requestBody.description } : {}),
      schema: convertSchema(json.schema),
    });
    body.consumes.push('application/json');
  }

  const multipart = requestBody.content['multipart/form-data'];
  if (multipart && multipart.schema) {
    const schema = multipart.schema;
    const requiredProps = new Set(schema.required || []);
    for (const [name, propSchema] of Object.entries(schema.properties || {})) {
      const prop = convertSchema(propSchema);
      const parameter = {
        name,
        in: 'formData',
        required: requiredProps.has(name),
        ...(prop.description ? { description: prop.description } : {}),
      };
      // 2.0 的 formData 只支持原始类型和 file：二进制走 file，数组降级成字符串
      // 数组，对象按「以 JSON 字符串提交」声明（契约描述里本来就这么写）。
      if (prop.format === 'binary') {
        parameter.type = 'file';
      } else if (Array.isArray(prop.type)) {
        parameter.type = 'string';
      } else if (prop.type === 'array') {
        parameter.type = 'array';
        const items = convertSchema(prop.items || {});
        parameter.items = { type: typeof items.type === 'string' ? items.type : 'string' };
        if (items.enum) parameter.items.enum = items.enum;
      } else if (prop.type && prop.type !== 'object') {
        parameter.type = prop.type;
        for (const key of ['format', 'enum', 'default']) {
          if (prop[key] !== undefined) parameter[key] = prop[key];
        }
      } else {
        parameter.type = 'string';
      }
      body.parameters.push(parameter);
    }
    body.consumes.push('multipart/form-data');
  }

  return body;
}

function convertResponse(response) {
  const out = { description: response.description || '' };
  const content = response.content || {};
  const json = content['application/json'];
  if (json && json.schema) out.schema = convertSchema(json.schema);
  else if (content['application/octet-stream'] || content['image/png'] || content['image/jpeg']) {
    out.schema = { type: 'file' };
  } else if (content['text/plain'] || content['text/markdown']) {
    out.schema = { type: 'string' };
  }
  return out;
}

function convertOperation(operation, pathItem, entry, securityDefinitions) {
  const converted = {};
  // 生成器的「接口描述」只取 summary，description 的末行会被塞进「接口权限」。
  // 这里把两段合成 summary，权限段留给适配层按 security/scopes 生成。
  // 末尾补换行：模板里 `{{end -}}` 会吃掉紧跟的换行，不留一个就会把
  // 「## 请求信息」标题粘在描述末尾（导致分节解析失败）。
  const summaryParts = [operation.summary, operation.description].filter(Boolean);
  if (summaryParts.length) converted.summary = `${summaryParts.join('\n\n')}\n`;
  converted.operationId = operation.operationId;
  converted.tags = [entry.tag];

  const parameters = [];
  for (const parameter of pathItem.parameters || []) parameters.push(convertParameter(parameter));
  for (const parameter of operation.parameters || []) parameters.push(convertParameter(parameter));

  const body = convertRequestBody(operation.requestBody);
  parameters.push(...body.parameters);
  if (parameters.length) converted.parameters = parameters;

  if (body.consumes.length) converted.consumes = body.consumes;

  converted.responses = {};
  for (const [code, response] of Object.entries(operation.responses || {})) {
    converted.responses[code] = convertResponse(response);
  }
  if (operation.responses && operation.responses.default) {
    delete converted.responses.default;
    converted.responses.default = convertResponse(operation.responses.default);
  }

  if (operation.deprecated !== undefined) converted.deprecated = operation.deprecated;
  if (operation.security !== undefined) {
    converted.security = operation.security;
    for (const requirement of operation.security) {
      for (const name of Object.keys(requirement)) securityDefinitions[name] = true;
    }
  }

  for (const [key, value] of Object.entries(operation)) {
    if (key.startsWith('x-')) converted[key] = value;
  }
  return converted;
}

function convertDocument(document) {
  const syntheticDefinitions = hoistInlineSchemas(document);
  const entries = planOperations(document);
  const entryByKey = new Map(entries.map((entry) => [`${entry.method} ${entry.path}`, entry]));

  const securityDefinitions = {};
  const paths = {};
  for (const [route, pathItem] of Object.entries(document.paths || {})) {
    const convertedPathItem = {};
    if (pathItem.parameters) {
      convertedPathItem.parameters = pathItem.parameters.map(convertParameter);
    }
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      const entry = entryByKey.get(`${method} ${route}`);
      convertedPathItem[method] = convertOperation(operation, pathItem, entry, securityDefinitions);
    }
    paths[route] = convertedPathItem;
  }

  const definitions = {};
  for (const [name, schema] of Object.entries(document.components?.schemas || {})) {
    definitions[name] = convertSchema(schema);
  }

  const security = {};
  for (const name of Object.keys(securityDefinitions)) {
    const scheme = document.components?.securitySchemes?.[name];
    if (!scheme) continue;
    security[name] = scheme.type === 'http' && scheme.scheme === 'bearer'
      ? { type: 'apiKey', name: 'Authorization', in: 'header', description: scheme.bearerFormat || 'Bearer token' }
      : scheme;
  }

  const serverUrl = (document.servers || [])[0]?.url || '';
  const swagger = {
    swagger: '2.0',
    info: {
      title: document.info?.title || 'MDTBBS Public API',
      version: document.info?.version || '1.0.0',
      ...(document.info?.description ? { description: document.info.description } : {}),
    },
    ...(serverUrl.startsWith('/') ? { basePath: serverUrl } : {}),
    produces: ['application/json'],
    consumes: ['application/json'],
    paths,
    definitions,
  };
  if (Object.keys(security).length) swagger.securityDefinitions = security;
  return { swagger, entries, syntheticDefinitions };
}

function main(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`无法识别的参数：${argv[index]}`);
    args.set(argv[index].slice(2), argv[index + 1]);
  }
  const input = args.get('input');
  const output = args.get('output');
  if (!input || !output) {
    throw new Error('用法：node scripts/openapi-to-swagger2.cjs --input openapi-public-v1.json --output swagger2.json');
  }
  const document = JSON.parse(fs.readFileSync(input, 'utf8'));
  const { swagger } = convertDocument(document);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(swagger, null, 2)}\n`);
  process.stdout.write(`已转换 ${Object.keys(swagger.paths).length} 条路径 → ${output}\n`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  TAG_SLUGS,
  DEFAULT_TAG,
  collectTags,
  convertParameter,
  slugifyTag,
  buildServiceName,
  operationName,
  planOperations,
  convertSchema,
  hoistInlineSchemas,
  convertDocument,
};
