/**
 * 导出 V1 OpenAPI 文档为 JSON 文件
 * 用法: npx ts-node scripts/export-openapi.ts
 * 或: npm run build && node dist/scripts/export-openapi.js
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { createV1OpenApiDocument } from '../src/openapi/v1-openapi';
import * as fs from 'fs';
import * as path from 'path';

async function exportOpenApi() {
  // 创建最小化应用（不监听端口）
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    bodyParser: false,
  });

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
}

exportOpenApi().catch((err) => {
  console.error('❌ 导出失败:', err.message);
  process.exit(1);
});
