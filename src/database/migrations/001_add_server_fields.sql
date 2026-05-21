-- 为 posts 表添加服务器关联字段
ALTER TABLE posts ADD COLUMN server_id INTEGER NULL;
ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT 'normal';

-- post_type 可选值：
-- 'normal': 普通帖子
-- 'server_announcement': 服务器公告（系统自动创建）
-- 'server_help': 服务器问题求助
-- 'server_intro': 服务器介绍

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_posts_server_id ON posts(server_id);
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);