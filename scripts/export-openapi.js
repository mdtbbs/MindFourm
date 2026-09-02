/**
 * 导出 V1 OpenAPI 文档为 JSON 文件（使用已编译的 dist）
 * 用法: node scripts/export-openapi.js
 */
require('dotenv/config');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { createV1OpenApiDocument } = require('../dist/openapi/v1-openapi');
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

  // 生成 V1 OpenAPI 文档
  const document = createV1OpenApiDocument(app);

  // 输出路径
  const outputPath = path.join(__dirname, '..', 'openapi-v1.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`✅ OpenAPI V1 文档已导出到: ${outputPath}`);
  console.log(`📊 路径数量: ${Object.keys(document.paths).length}`);
  console.log(`📦 Schema 数量: ${Object.keys(document.components?.schemas || {}).length}`);
  console.log(`📏 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

  await app.close();
  process.exit(0);
}

exportOpenApi().catch((err) => {
  console.error('❌ 导出失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
