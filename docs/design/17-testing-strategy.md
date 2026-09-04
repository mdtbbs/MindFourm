# 测试策略设计

> 本文档记录了论坛系统的测试策略。
> 创建时间: 2026-06-07

## 测试架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        测试体系                                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ 单元     │  │ 集成     │  │ E2E      │  │ API          │   │
│  │ 测试     │  │ 测试     │  │ 测试     │  │ 契约测试     │   │
│  │ (Jest)   │  │ (Jest)   │  │(Playwright)│ │ (OpenAPI)   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. 单元测试

### 测试范围
- Service 层业务逻辑
- 工具函数（敏感词过滤、Markdown 渲染、@提及解析等）
- 管道（验证管道、解析管道）
- Guard（权限守卫、频率限制守卫）

### 工具
- **Jest**：测试框架
- **ts-jest**：TypeScript 支持
- **@nestjs/testing**：NestJS 测试模块（用于集成测试）
- **TypeORM Repository Mock**：单元测试中使用模拟仓库

### 示例：帖子服务单元测试

单元测试使用模拟的 TypeORM Repository，避免真实的数据库依赖：

```typescript
// modules/posts/posts.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PostService } from './posts.service';
import { Post } from './entities/post.entity';
import { Repository } from 'typeorm';

describe('PostService', () => {
  let service: PostService;
  let mockRepo: jest.Mocked<Repository<Post>>;

  beforeEach(async () => {
    // 创建模拟仓库
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
        getManyAndCount: jest.fn(),
        andWhere: jest.fn().mockReturnThis(),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        {
          provide: getRepositoryToken(Post),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
  });

  it('should create a post successfully', async () => {
    const dto: CreatePostDto = {
      title: 'Test Post',
      content: 'Test Content',
      categoryId: 1,
      tags: ['test'],
    };
    const userId = 1;
    const mockPost = { id: 1, ...dto, user_id: userId, created_at: new Date() };

    mockRepo.create.mockReturnValue(mockPost as any);
    mockRepo.save.mockResolvedValue(mockPost as any);

    const result = await service.create(dto, userId);

    expect(result.title).toBe('Test Post');
    expect(result.user_id).toBe(userId);
    expect(mockRepo.create).toHaveBeenCalledWith({ ...dto, user_id: userId });
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('should return null when post not found', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await service.findOne(999);

    expect(result).toBeNull();
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: 999 });
  });

  it('should use cursor pagination correctly', async () => {
    const mockPosts = [
      { id: 1, title: 'Post 1', created_at: new Date('2024-01-01') },
      { id: 2, title: 'Post 2', created_at: new Date('2024-01-02') },
      { id: 3, title: 'Post 3', created_at: new Date('2024-01-03') },
    ];

    mockRepo.createQueryBuilder().getMany.mockResolvedValue(mockPosts);

    const result = await service.getPostsWithCursor({ limit: 2, cursor: null });

    expect(result.data).toHaveLength(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.nextCursor).toBe(mockPosts[1].created_at);
  });
});
```

### 示例：敏感词过滤工具测试
```typescript
// shared/utils/content-filter.util.spec.ts
describe('ContentFilterUtil', () => {
  it('should detect sensitive words', () => {
    const filter = new ContentFilterUtil(['敏感词', '测试']);
    const result = filter.filter('这是一个敏感词内容');

    expect(result.filtered).toBe('这是一个***内容');
    expect(result.flags).toHaveLength(1);
  });

  it('should block content with high severity words', () => {
    const filter = new ContentFilterUtil([
      { word: '严重词', action: 'block', severity: 'high' }
    ]);
    const result = filter.filter('包含严重词的内容');

    expect(result.action).toBe('blocked');
  });

  it('should handle no sensitive words', () => {
    const filter = new ContentFilterUtil(['敏感词']);
    const result = filter.filter('这是一个安全的内容');

    expect(result.filtered).toBe('这是一个安全的内容');
    expect(result.flags).toHaveLength(0);
  });
});
```

---

## 2. 集成测试

### 测试范围
- Controller + Service 组合
- 数据库操作
- Redis 操作
- HTTP 请求完整流程

### 示例：帖子 API 集成测试
```typescript
// modules/posts/posts.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { createTestDatabase, closeTestDatabase } from '../../test/db-helper';

describe('PostsController (integration)', () => {
  let app: INestApplication;
  let dbConnection;

  beforeAll(async () => {
    dbConnection = await createTestDatabase();
    
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  describe('POST /api/posts', () => {
    it('should create a post when authenticated', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password' });

      const cookie = loginResponse.headers['set-cookie'][0];

      const response = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Cookie', cookie)
        .send({
          title: 'Integration Test Post',
          content: 'Test content',
          categoryId: 1,
        })
        .expect(201);

      expect(response.body.data.title).toBe('Integration Test Post');
      expect(response.body.data.id).toBeDefined();
    });

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/posts')
        .send({ title: 'Test', content: 'Content' })
        .expect(401);
    });

    it('should return 400 when title is empty', async () => {
      // 登录后请求
      const response = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Cookie', validCookie)
        .send({ title: '', content: 'Content' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

---

## 3. E2E 测试

### 测试范围
- 用户完整操作流程
- 前后端完整交互
- 跨模块功能

### 工具
- **Playwright**：浏览器自动化（E2E 测试）
- **测试数据库**：每个测试使用独立的测试数据

> **注意**：E2E 测试使用 Playwright，而非 Jest。Jest 用于单元测试和集成测试。

### 测试文件位置
```
MindFourm/tests/
├── e2e/
│   ├── auth.spec.ts        # 登录/登出流程
│   ├── post-flow.spec.ts   # 发帖/回复/删除流程
│   ├── admin.spec.ts       # 管理后台操作
│   └── notification.spec.ts # 通知流程
├── integration/
│   └── api/
│       ├── posts.spec.ts   # 帖子 API 集成测试
│       ├── users.spec.ts   # 用户 API 集成测试
│       └── auth.spec.ts    # 认证 API 集成测试
└── unit/
    └── services/
        ├── post.service.spec.ts
        ├── user.service.spec.ts
        └── notification.service.spec.ts
```

### 示例：用户发帖 E2E 测试
```typescript
// tests/e2e/post-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('User Post Flow', () => {
  test('should allow user to create and view a post', async ({ page }) => {
    // 1. 登录
    await page.goto('http://localhost:3000/login');
    await page.fill('[name="username"]', 'testuser');
    await page.click('[type="submit"]');
    
    // 等待登录成功跳转
    await page.waitForURL('http://localhost:3000/');
    
    // 2. 创建帖子
    await page.click('text=发布帖子');
    await page.fill('[name="title"]', 'E2E Test Post');
    
    // Markdown 编辑器（textarea + 预览模式）
    await page.fill('[name="content"]', 'This is the test post content in **Markdown**.');
    
    // 选择分类
    await page.selectOption('[name="category"]', '1');
    
    // 添加标签
    await page.fill('[name="tags"]', 'test, e2e');
    
    // 提交
    await page.click('[type="submit"]');
    
    // 等待跳转到帖子详情页
    await page.waitForURL(/\/posts\/\d+/);
    
    // 3. 验证帖子创建成功
    await expect(page.locator('h1')).toContainText('E2E Test Post');
    await expect(page.locator('.post-content')).toContainText('This is the test post content');
    // 验证 Markdown 渲染（bold 标签）
    await expect(page.locator('.post-content strong')).toBeVisible();
  });

  test('should allow user to reply to a post', async ({ page }) => {
    // ... 登录 → 进入帖子 → 发表回复 → 验证回复显示
  });

  test('should allow user to like a post', async ({ page }) => {
    // ... 登录 → 进入帖子 → 点击点赞 → 验证点赞数增加
  });

  test('should send notification when someone replies', async ({ page }) => {
    // ... 用户 A 发帖 → 用户 B 回复 → 用户 A 收到通知
  });
});
```

---

## 4. API 契约测试

### 测试范围
- API 响应格式符合 OpenAPI 规范
- 请求参数验证
- 错误码一致性

### 工具
- **openapi-validator**：验证 API 响应符合 OpenAPI Schema
- **ajv**：JSON Schema 验证

### 示例
```typescript
// tests/api-contract/api.spec.ts
import { validateResponse } from 'openapi-response-validator';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

const spec = yaml.load(fs.readFileSync('./docs/openapi.yaml', 'utf8'));

describe('API Contract Tests', () => {
  const validator = new validateResponse({
    responses: spec.paths['/api/posts'].get.responses,
  });

  it('GET /api/posts response matches OpenAPI spec', async () => {
    const response = await fetch('http://localhost:3001/api/posts');
    const body = await response.json();

    const errors = validator.validateResponse(200, body);
    expect(errors).toBeNull();
  });

  it('POST /api/posts error response matches spec', async () => {
    const response = await fetch('http://localhost:3001/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // 缺少必填字段
    });
    const body = await response.json();

    const errors = validator.validateResponse(400, body);
    expect(errors).toBeNull();
  });
});
```

---

## 测试覆盖率目标

| 层级 | 目标覆盖率 |
|------|------------|
| 单元测试 | > 80% |
| 集成测试 | 核心 API > 90% |
| E2E 测试 | 核心用户流程 > 95% |
| API 契约测试 | 所有公开端点 100% |

> **注意**：覆盖率目标已调整为现实水平。100% 覆盖率是不现实且不必要的，重点覆盖核心业务逻辑和关键用户流程。

---

## 测试运行命令

```bash
# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# E2E 测试
npm run test:e2e

# API 契约测试
npm run test:api

# 所有测试
npm run test

# 覆盖率报告
npm run test:cov
```

---

## CI/CD 集成

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: forum_test
        ports:
          - 3306:3306
      redis:
        image: redis:7
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:api
      - run: npm run test:cov
        env:
          MYSQL_HOST: localhost
          REDIS_HOST: localhost
```
