'use strict';

// 覆盖 3.0→2.0 转换层与适配层里「靠约定、易回归」的部分：
// 内联 schema 提升、参数约束提升、命名规则、注释剥离、文档结构。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const converter = require(path.join(__dirname, 'openapi-to-swagger2.cjs'));
const renderer = require(path.join(__dirname, 'render-api-skill-docs.cjs'));

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'openapi-public-v1.json'), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('转换器输出的操作数与契约一致', () => {
  const entries = converter.planOperations(contract);
  const expected = Object.entries(contract.paths).flatMap(([route, pathItem]) => Object.keys(pathItem)
    .filter((method) => ['get', 'put', 'post', 'delete', 'patch'].includes(method))
    .map((method) => `${method} ${route}`));
  assert.equal(entries.length, expected.length);
  assert.equal(new Set(entries.map((entry) => entry.relativePath)).size, entries.length, '产物路径必须唯一');
});

test('内联响应结构被提升为命名 definition，转换后不再有匿名对象', () => {
  const document = clone(contract);
  const synthetic = converter.hoistInlineSchemas(document);
  assert.ok(synthetic.size > 0, '公开契约里存在内联结构，应当有提升结果');

  // 提升后，成功响应要么是 $ref，要么是标量/数组；不能再是内联对象。
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (method === 'parameters') continue;
      for (const [code, response] of Object.entries(operation.responses || {})) {
        const schema = response?.content?.['application/json']?.schema;
        if (!schema) continue;
        if (schema.oneOf) continue;
        assert.ok(
          schema.$ref || !schema.properties,
          `${method} ${route} ${code} 仍有内联响应对象（会让生成器退化成 Go struct 转储）`,
        );
      }
    }
  }
});

test('提升产生的名字不与应用自身的 definition 冲突', () => {
  const document = clone(contract);
  const before = new Set(Object.keys(document.components.schemas));
  const synthetic = converter.hoistInlineSchemas(document);
  for (const name of synthetic) {
    assert.ok(!before.has(name), `${name} 与既有 definition 重名`);
  }
});

test('既有 definition 不会被再次提升（不产生 Foo2 这种名字）', () => {
  const document = clone(contract);
  const synthetic = converter.hoistInlineSchemas(document);
  for (const name of synthetic) {
    assert.ok(!/^[A-Za-z0-9]+Dto\d+$/.test(name), `可疑的重复提升命名：${name}`);
  }
});

test('每个操作的首个 tag 都能映射成 ASCII slug（决定产物目录名）', () => {
  const { primary } = converter.collectTags(contract);
  assert.ok(primary.length > 0);
  for (const tag of primary) {
    assert.match(converter.slugifyTag(tag), /^[A-Za-z0-9][A-Za-z0-9._-]*$/, `标签「${tag}」没有 ASCII 目录名`);
  }
});

test('未映射的中文 tag（次级分类）不会影响产物路径', () => {
  const { secondary } = converter.collectTags(contract);
  const entries = converter.planOperations(contract);
  for (const entry of entries) {
    assert.match(entry.relativePath, /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.md$/, `产物路径必须全 ASCII：${entry.relativePath}`);
  }
  // 次级 tag 只作说明用途；存在未映射的也不该抛错。
  const unmapped = secondary.filter((tag) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)
    && !Object.prototype.hasOwnProperty.call(converter.TAG_SLUGS, tag));
  assert.doesNotThrow(() => converter.planOperations(contract));
  assert.ok(unmapped.every((tag) => typeof tag === 'string'));
});

test('参数级 schema 的约束被提升到参数上（2.0 形态）', () => {
  const swagger = converter.convertDocument(clone(contract)).swagger;
  const limit = swagger.paths['/v1/me/bookmarks'].get.parameters.find((parameter) => parameter.name === 'limit');
  assert.equal(limit.maximum, 50);
  assert.equal(limit.minimum, 1);
  assert.equal(limit.type, 'number', '只有数值边界的参数应推断为数字');
});

test('只写约束的参数也能推断出类型与约束文案', () => {
  assert.equal(converter.convertParameter({ name: 'server_id', in: 'query', schema: { minimum: 1 } }).type, 'number');
  assert.equal(converter.convertParameter({ name: 'cursor', in: 'query', schema: { maxLength: 300 } }).type, 'string');
  assert.equal(converter.convertParameter({ name: 'q', in: 'query', schema: { maxLength: 100 } }).type, 'string');
  const limit = converter.convertParameter({ name: 'limit', in: 'query', schema: { minimum: 1, maximum: 100 } });
  assert.equal(limit.minimum, 1);
  assert.equal(limit.maximum, 100);
});

test('契约里每个参数都能拿到类型（不允许出现未声明的参数类型）', () => {
  const entries = converter.planOperations(contract);
  for (const entry of entries) {
    const pathItem = contract.paths[entry.path];
    const operation = pathItem[entry.method];
    for (const raw of [...(pathItem.parameters || []), ...(operation.parameters || [])]) {
      const converted = converter.convertParameter(raw);
      assert.ok(converted.type, `${entry.method} ${entry.path} 的参数 ${raw.name} 没有类型`);
    }
  }
});

test('请求体变成 body/formData 参数，multipart 保留 file 字段', () => {
  const swagger = converter.convertDocument(clone(contract)).swagger;
  const blobs = swagger.paths['/v1/blobs'].post;
  assert.ok(blobs.parameters.some((parameter) => parameter.in === 'body'));

  const upload = swagger.paths['/v1/resources'].post;
  const file = upload.parameters.find((parameter) => parameter.in === 'formData' && parameter.name === 'file');
  assert.equal(file.type, 'file', '二进制上传字段必须映射成 2.0 的 file');
});

test('响应 content 折叠成 schema，二进制响应标成 file', () => {
  const swagger = converter.convertDocument(clone(contract)).swagger;
  const created = swagger.paths['/v1/blobs'].post.responses['201'];
  assert.match(created.schema.$ref, /^#\/definitions\//);
  const binary = swagger.paths['/v1/blobs/{blobId}/content'].get.responses['200'];
  assert.equal(binary.schema.type, 'file');
});

test('summary 末尾保留换行，避免生成器把下一节标题粘在描述后', () => {
  const swagger = converter.convertDocument(clone(contract)).swagger;
  const summary = swagger.paths['/v1/blobs'].post.summary;
  assert.ok(summary.endsWith('\n'));
});

test('注释剥离后是合法 JSON', () => {
  const source = '{\n  "a": "x", // 行尾注释\n  "b": ["y"], // 另一个\n  "c": {\n    "d": 1 // 深层\n  }\n}';
  assert.doesNotThrow(() => JSON.parse(renderer.cleanupJson(source)));
  assert.equal(renderer.cleanupJson(source).includes('//'), false);
});

test('注释剥离不误伤字符串里的双斜杠', () => {
  const source = '{\n  "url": "https://example.invalid/a", // 注释\n  "n": 1\n}';
  const parsed = JSON.parse(renderer.cleanupJson(source));
  assert.equal(parsed.url, 'https://example.invalid/a');
});

test('类型文案覆盖数组、二进制与未声明 items 的数组', () => {
  assert.equal(renderer.typeLabel({ type: 'string' }, contract), '字符串');
  assert.equal(renderer.typeLabel({ type: 'array', items: { type: 'string' } }, contract), '字符串数组');
  assert.equal(renderer.typeLabel({ type: 'array' }, contract), '数组');
  assert.equal(renderer.typeLabel({ type: 'string', format: 'binary' }, contract), '文件');
  assert.equal(renderer.typeLabel({ type: 'string', format: 'uuid' }, contract), '字符串（UUID）');
  assert.equal(renderer.typeLabel({ $ref: '#/components/schemas/FooDto' }, contract), 'FooDto');
});

test('约束文案带出枚举与边界', () => {
  assert.deepEqual(renderer.constraintNotes({ enum: ['a', 'b'] }), ['可选值：a / b']);
  assert.ok(renderer.constraintNotes({ minLength: 1, maxLength: 5 }).includes('最长 5'));
  assert.ok(renderer.constraintNotes({ minimum: 1, maximum: 50 }).includes('最小 1'));
  assert.ok(renderer.constraintNotes({ 'x-nullable': true }).includes('可为 null'));
});

test('drift 检查能识别缺失文件', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'api-skill-check-'));
  try {
    fs.mkdirSync(dir, { recursive: true });
    const problems = renderer.checkApiSkillDocs({ contract, outputDir: dir });
    assert.ok(problems.some((problem) => problem.includes('SKILL.md')), '空目录应报缺 SKILL.md');
    assert.ok(problems.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('drift 检查能识别 CNB 专有内容残留', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'api-skill-check-'));
  try {
    const entries = converter.planOperations(contract);
    const sample = entries[0];
    const target = path.join(dir, sample.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# index\n');
    fs.writeFileSync(target, `# x\n\nGET ${sample.path}\n\n\`200\`\n\n\`${sample.path}\`\n\n\${CNB_API_ENDPOINT}\n`);
    const problems = renderer.checkApiSkillDocs({ contract, outputDir: dir });
    assert.ok(problems.some((problem) => problem.includes('CNB')), `应报 CNB 残留：${problems.join('; ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('每个操作都在契约里有对应路径（产物与契约一一对应）', () => {
  const entries = converter.planOperations(contract);
  for (const entry of entries) {
    assert.ok(contract.paths[entry.path], `${entry.path} 不在契约里`);
    assert.ok(contract.paths[entry.path][entry.method], `${entry.method} ${entry.path} 不在契约里`);
  }
});
