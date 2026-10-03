/**
 * 导出 V1 OpenAPI 文档为 JSON 文件
 * 用法: npx ts-node scripts/export-openapi.ts
 * 或: npm run build && node dist/scripts/export-openapi.js
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { createInternalV1OpenApiDocument, createV1OpenApiDocument } from '../src/openapi/v1-openapi';
import * as fs from 'fs';
import * as path from 'path';

async function exportOpenApi() {
  // 创建最小化应用（不监听端口）
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    bodyParser: false,
  });

  const publicDocument = createV1OpenApiDocument(app);
  const internalDocument = createInternalV1OpenApiDocument(app);
  const publicOutputPath = path.join(__dirname, '..', 'openapi-public-v1.json');
  const internalOutputPath = path.join(__dirname, '..', 'openapi-internal-v1.json');
  const legacyOutputPath = path.join(__dirname, '..', 'openapi-v1.json');

  fs.writeFileSync(publicOutputPath, JSON.stringify(publicDocument, null, 2));
  fs.writeFileSync(internalOutputPath, JSON.stringify(internalDocument, null, 2));
  fs.writeFileSync(legacyOutputPath, JSON.stringify(publicDocument, null, 2));

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
}

exportOpenApi().catch((err) => {
  console.error('❌ 导出失败:', err.message);
  process.exit(1);
});
