/**
 * 导出 V1 OpenAPI 文档为 JSON 文件（使用已编译的 dist）
 * 用法: node scripts/export-openapi.js
 */
require('dotenv/config');
// OpenAPI generation needs Nest's controller graph and TypeORM repository tokens,
// but it must not connect to a database or run migrations just to export a spec.
process.env.OPENAPI_EXPORT = 'true';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { createInternalV1OpenApiDocument, createV1OpenApiDocument } = require('../dist/openapi/v1-openapi');
const fs = require('fs');
const path = require('path');

async function exportOpenApi() {
  console.log('🚀 正在初始化应用...');

  // 创建最小化应用（不监听端口）
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    bodyParser: false,
  });

  console.log('📝 正在生成 OpenAPI V1 文档...');

  const publicDocument = createV1OpenApiDocument(app);
  const internalDocument = createInternalV1OpenApiDocument(app);
  const legacyOutputPath = path.join(__dirname, '..', 'openapi-v1.json');
  const publicOutputPath = process.env.OPENAPI_PUBLIC_OUTPUT_PATH
    || process.env.OPENAPI_OUTPUT_PATH
    || path.join(__dirname, '..', 'openapi-public-v1.json');
  const internalOutputPath = process.env.OPENAPI_INTERNAL_OUTPUT_PATH
    || path.join(__dirname, '..', 'openapi-internal-v1.json');

  fs.writeFileSync(publicOutputPath, JSON.stringify(publicDocument, null, 2));
  fs.writeFileSync(internalOutputPath, JSON.stringify(internalDocument, null, 2));
  if (!process.env.OPENAPI_PUBLIC_OUTPUT_PATH && !process.env.OPENAPI_OUTPUT_PATH) {
    fs.writeFileSync(legacyOutputPath, JSON.stringify(publicDocument, null, 2));
  }

  for (const [label, outputPath, document] of [
    ['Public V1', publicOutputPath, publicDocument],
    ['Internal V1', internalOutputPath, internalDocument],
  ]) {
    console.log(`✅ ${label} OpenAPI 文档已导出到: ${outputPath}`);
    console.log(`📊 路径数量: ${Object.keys(document.paths).length}`);
    console.log(`📦 Schema 数量: ${Object.keys(document.components?.schemas || {}).length}`);
    console.log(`📏 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  }

  await app.close();
  process.exit(0);
}

exportOpenApi().catch((err) => {
  console.error('❌ 导出失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
