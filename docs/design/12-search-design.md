# 搜索系统设计

> 本文档记录了论坛系统的搜索设计方案。
> 创建时间: 2026-06-07

## 搜索架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        搜索系统                                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ MySQL    │  │ 关键词   │  │ 搜索历史 │  │ 热门搜索     │   │
│  │ LIKE     │  │ 高亮     │  │ 记录     │  │ 推荐         │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 搜索范围

### 帖子搜索
| 字段 | 搜索方式 | 权重 |
|------|----------|------|
| 标题 | LIKE 模糊匹配 | 高 |
| 正文 | LIKE 模糊匹配 | 中 |
| 作者名 | 关联用户表 LIKE 匹配 | 低 |

### 用户搜索
| 字段 | 搜索方式 |
|------|----------|
| 用户名 | LIKE 模糊匹配 |
| 个人简介 | LIKE 模糊匹配 |

---

## 初期方案：MySQL LIKE

### 帖子搜索
```sql
-- 基础搜索
SELECT p.*, u.username, c.name AS category_name
FROM posts p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.status = 'published'
  AND (
    p.title LIKE '%keyword%'
    OR p.content LIKE '%keyword%'
    OR u.username LIKE '%keyword%'
  )
ORDER BY p.created_at DESC
LIMIT 20 OFFSET 0;
```

### 性能优化
```sql
-- 为常用搜索字段创建全文索引（MySQL 8 支持）
CREATE FULLTEXT INDEX idx_posts_fulltext ON posts(title, content);

-- 使用全文索引搜索（性能优于 LIKE）
SELECT p.*, MATCH(p.title, p.content) AGAINST('keyword' IN NATURAL LANGUAGE MODE) AS relevance
FROM posts p
WHERE MATCH(p.title, p.content) AGAINST('keyword' IN NATURAL LANGUAGE MODE)
ORDER BY relevance DESC;
```

### 关键词高亮
```typescript
// shared/utils/search-highlight.util.ts
export function highlightKeywords(text: string, keywords: string[]): string {
  if (!keywords || keywords.length === 0) return text;
  
  const escapedKeywords = keywords
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length); // 长的关键词先匹配
  
  const pattern = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
  
  return text.replace(pattern, '<mark class="search-highlight">$1</mark>');
}
```

### 前端高亮样式
```css
/* globals.css */
.search-highlight {
  background-color: #fef08a;
  padding: 0 2px;
  border-radius: 2px;
}
```

---

## 搜索历史

### 数据库表
```sql
-- 搜索历史表
CREATE TABLE search_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,                          -- NULL 表示游客
  query VARCHAR(255) NOT NULL,
  search_type ENUM('post', 'user', 'global') DEFAULT 'global',
  results_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_query (query)
);
```

### 热门搜索
```sql
-- 热门搜索表
CREATE TABLE popular_searches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  query VARCHAR(255) UNIQUE NOT NULL,
  count INT DEFAULT 0,
  last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_count (count DESC)
);
```

### 更新热门搜索
```typescript
// modules/search/search.service.ts
async recordSearch(query: string, userId: number | null, resultsCount: number): Promise<void> {
  // 记录搜索历史
  await this.searchHistoryRepo.save({
    user_id: userId,
    query,
    search_type: 'global',
    results_count: resultsCount,
  });

  // 更新热门搜索（使用 Redis 原子操作）
  const cacheKey = 'popular_searches';
  await this.redisService.zIncrBy(cacheKey, 1, query.toLowerCase());
}

async getPopularSearches(limit: number = 10): Promise<string[]> {
  // 获取 Redis 中 Top N
  return this.redisService.zRevRange('popular_searches', 0, limit - 1);
}
```

---

## 搜索 API

### 端点
```
GET /api/search?q=keyword&type=post&page=1&pageSize=20
```

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 是 | 搜索关键词 |
| type | string | 否 | 搜索类型（post/user/global），默认 global |
| category | string | 否 | 按分类筛选 |
| sort | string | 否 | 排序方式（relevance/newest/oldest），默认 relevance |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

### 响应格式
```json
{
  "data": {
    "posts": [
      {
        "id": 1,
        "title": "帖子标题（含 <mark>关键词</mark>）",
        "excerpt": "...关键词出现在这里...",
        "author": { "id": 1, "username": "作者名" },
        "category": { "id": 1, "name": "分类名" },
        "reply_count": 10,
        "like_count": 5,
        "created_at": "2026-06-07T10:00:00Z"
      }
    ],
    "users": [],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  },
  "popular_searches": ["热门1", "热门2", "热门3"],
  "recent_searches": ["keyword1", "keyword2"]
}
```

---

## 搜索服务实现

```typescript
// modules/search/search.service.ts
@Injectable()
export class SearchService {
  async searchPosts(query: string, options: SearchOptions): Promise<PaginatedResult<Post>> {
    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'user')
      .leftJoinAndSelect('p.category', 'category')
      .where('p.status = :status', { status: 'published' });

    // 关键词搜索
    if (query) {
      qb.andWhere(
        '(p.title LIKE :query OR p.content LIKE :query OR user.username LIKE :query)',
        { query: `%${query}%` }
      );
    }

    // 分类筛选
    if (options.category) {
      qb.andWhere('category.slug = :category', { category: options.category });
    }

    // 排序
    if (options.sort === 'relevance') {
      // LIKE 排序：标题匹配优先
      qb.orderBy('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'DESC');
      qb.addOrderBy('p.created_at', 'DESC');
    } else if (options.sort === 'newest') {
      qb.orderBy('p.created_at', 'DESC');
    } else {
      qb.orderBy('p.created_at', 'ASC');
    }

    // 分页
    qb.skip((options.page - 1) * options.pageSize)
      .take(options.pageSize);

    const [posts, total] = await qb.getManyAndCount();

    // 关键词高亮
    const highlightedPosts = posts.map(post => ({
      ...post,
      title: highlightKeywords(post.title, [query]),
      excerpt: this.generateExcerpt(post.content, query),
    }));

    return {
      data: highlightedPosts,
      total,
      page: options.page,
      pageSize: options.pageSize,
      totalPages: Math.ceil(total / options.pageSize),
    };
  }

  private generateExcerpt(content: string, query: string, maxLength: number = 200): string {
    const index = content.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) {
      return content.substring(0, maxLength);
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 100);
    let excerpt = content.substring(start, end);

    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';

    return excerpt;
  }
}
```

---

## 升级路径：从 LIKE 到全文索引

### 阶段 1：LIKE 搜索（当前）
- 实现简单，无需额外配置
- 性能可接受（数据量 < 10 万帖子）

### 阶段 2：MySQL Full-Text Index
- 当数据量超过 10 万时切换
- 创建全文索引：`CREATE FULLTEXT INDEX idx_posts_ft ON posts(title, content)`
- 修改查询使用 `MATCH() AGAINST()`
- 支持自然语言和布尔模式

### 阶段 3：Elasticsearch（可选）
- 当数据量超过 100 万时考虑
- 支持分词、拼音、语义搜索
- 独立部署，不影响现有架构

---

## 搜索缓存

| 缓存内容 | 过期时间 | 策略 |
|----------|----------|------|
| 热门搜索列表 | 5 分钟 | Redis STRING |
| 搜索结果（精确匹配） | 1 分钟 | Redis STRING |
| 用户搜索历史 | 不缓存 | 实时查询 |

```typescript
// 搜索结果缓存
async searchWithCache(query: string, options: SearchOptions): Promise<any> {
  const cacheKey = `search:${query}:${JSON.stringify(options)}`;
  
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await this.searchPosts(query, options);
  
  // 只缓存精确匹配的结果
  if (options.sort === 'relevance' && !options.category) {
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
  }

  return result;
}
```
