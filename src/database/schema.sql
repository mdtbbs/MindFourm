-- users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mindauth_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- posts
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    is_pinned INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- replies
CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_reply_id INTEGER,
    content TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES replies(id) ON DELETE CASCADE
);

-- tags
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- post_tags
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    mindauth_token TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- operation_logs
CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_category_id ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_posts_pinned_created ON posts(is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies(post_id);
CREATE INDEX IF NOT EXISTS idx_replies_user_id ON replies(user_id);
CREATE INDEX IF NOT EXISTS idx_replies_parent_id ON replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(status);
CREATE INDEX IF NOT EXISTS idx_replies_post_created ON replies(post_id, created_at);

CREATE INDEX IF NOT EXISTS idx_users_mindauth_id ON users(mindauth_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_logs_user_id ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_target ON operation_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_action ON operation_logs(user_id, action);

-- settings (key-value store for admin configuration)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- bans (IP/user blocking)
CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ban_type TEXT NOT NULL,
    value TEXT NOT NULL,
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bans_type ON bans(ban_type);
CREATE INDEX IF NOT EXISTS idx_bans_active ON bans(is_active);
CREATE INDEX IF NOT EXISTS idx_bans_value ON bans(value);

-- Composite index for main post listing query (filter + sort)
CREATE INDEX IF NOT EXISTS idx_posts_list ON posts(deleted_at, status, is_pinned DESC, created_at DESC);

-- Composite index for reply listing with deleted_at filter
CREATE INDEX IF NOT EXISTS idx_replies_list ON replies(post_id, deleted_at, created_at ASC);

-- Indexes for user search (username/email LIKE)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Composite index for ban lookups
CREATE INDEX IF NOT EXISTS idx_bans_lookup ON bans(ban_type, value, is_active);

-- Composite index for log listing
CREATE INDEX IF NOT EXISTS idx_logs_list ON operation_logs(created_at DESC, user_id, action);

-- Composite index for session validation
CREATE INDEX IF NOT EXISTS idx_sessions_validate ON sessions(session_token, expires_at);

-- Composite index for post_tags reverse lookups (tag_id-only queries, not covered by PK)
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);

-- Phase 2: user profile fields
-- (Migrated via database/index.js to handle existing tables)

-- Phase 2: bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post ON bookmarks(post_id);

-- Phase 2: notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    actor_id INTEGER NOT NULL,
    post_id INTEGER,
    reply_id INTEGER,
    content TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_actor ON notifications(actor_id);

-- Attachments for posts and replies
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    reply_id INTEGER,
    user_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    download_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attachments_post ON attachments(post_id);
CREATE INDEX IF NOT EXISTS idx_attachments_reply ON attachments(reply_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);

-- Private messages
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    is_read INTEGER DEFAULT 0,
    read_at DATETIME,
    deleted_by_sender INTEGER DEFAULT 0,
    deleted_by_recipient INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_by_sender, deleted_by_recipient);

-- Resource center (migrated)
CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    resource_type TEXT NOT NULL DEFAULT 'file',
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT,
    external_url TEXT,
    version TEXT,
    content TEXT,
    content_html TEXT,
    category_id INTEGER,
    download_count INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_public ON resources(is_public, status);
CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(created_at DESC);

-- Resource categories
CREATE TABLE IF NOT EXISTS resource_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resource_categories_slug ON resource_categories(slug);
CREATE INDEX IF NOT EXISTS idx_resource_categories_active ON resource_categories(is_active);

-- Resource versions
CREATE TABLE IF NOT EXISTS resource_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    UNIQUE(resource_id, version)
);
CREATE INDEX IF NOT EXISTS idx_resource_versions_resource ON resource_versions(resource_id);

-- Performance optimization indexes
-- Composite index for resource listing query (status + category + created_at)
CREATE INDEX IF NOT EXISTS idx_resources_list ON resources(status, category_id, created_at DESC);

-- Composite index for notifications unread count query
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- Posts composite index for user's posts query
CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts(user_id, status, created_at DESC);
