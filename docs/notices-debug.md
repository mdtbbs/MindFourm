# 公告不显示问题诊断

## 问题描述
- 管理后台显示已发布的公告
- 公告中心（/notices）页面不显示公告

## 诊断步骤

### 1. 检查数据库数据

```sql
-- 查看 notices_content 的值
SELECT `key`, `value` 
FROM settings 
WHERE `key` = 'notices_content';

-- 预期结果应该是 JSON 数组，例如：
-- [{"title":"测试公告","content":"内容","published_at":"2026-08-24","pinned":false}]
```

### 2. 检查后端 API 返回

```bash
# 直接访问后端 API
curl http://localhost:4000/api/settings 2>/dev/null | jq '.notices_content'

# 如果没有 jq，使用：
curl http://localhost:4000/api/settings 2>/dev/null | grep -o '"notices_content":"[^"]*"'
```

**预期结果**：应该返回公告 JSON 数据

### 3. 检查前端页面

```bash
# 访问公告中心页面
curl http://localhost:3000/notices 2>/dev/null | grep "暂时没有公告" && echo "问题：页面显示空" || echo "公告已显示"

# 检查页面中是否有公告标题
curl http://localhost:3000/notices 2>/dev/null | grep -o '<h2[^>]*>[^<]*</h2>' | head -5
```

### 4. 检查环境变量

确保后端 `.env` 文件中配置了：
```bash
FRONTEND_URL=http://localhost:3000
SETTINGS_REVALIDATE_SECRET=your-random-secret-key
```

## 可能的原因及解决方案

### 原因 1：Next.js 缓存问题（已修复）
- 现已添加 `export const dynamic = 'force-dynamic'`
- 重启服务后生效

### 原因 2：缓存重新验证未配置
- 检查 `SETTINGS_REVALIDATE_SECRET` 是否配置
- 检查后端日志是否有警告：
  ```
  SETTINGS_REVALIDATE_SECRET is not configured; skipped Next settings revalidation
  ```

### 原因 3：前端获取数据失败
- 打开浏览器开发者工具
- 访问 `/notices` 页面
- 检查 Network 标签是否有请求失败

## 快速验证命令

```bash
# 一键检查
echo "=== 1. 检查数据库 ===" && \
mysql -u root -p mindforum -e "SELECT \`key\`, LEFT(\`value\`, 100) FROM settings WHERE \`key\` = 'notices_content'" 2>/dev/null && \
echo "" && \
echo "=== 2. 检查后端 API ===" && \
curl -s http://localhost:4000/api/settings | jq -r '.notices_content // "null"' && \
echo "" && \
echo "=== 3. 检查前端页面 ===" && \
curl -s http://localhost:3000/notices | grep -q "暂时没有公告" && echo "问题：页面显示空" || echo "公告已显示"
```

## 重启服务

```bash
# 重启后端
cd MindFourm && npm run dev

# 重启前端
cd MindFourm/frontend && npm run dev
```