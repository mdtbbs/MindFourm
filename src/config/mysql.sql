-- MindForum MySQL Schema
-- Run via: F:\MySQL\bin\mysql.exe -u root -p < src/config/mysql.sql

CREATE DATABASE IF NOT EXISTS mindforum CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mindforum;

-- users
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    mindauth_id INT UNIQUE NOT NULL,
    username VARCHAR(255),
    email VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    avatar_url VARCHAR(500),
    bio TEXT,
    phone_verified TINYINT(1) NOT NULL DEFAULT 0,
    phone_verified_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_mindauth_id (mindauth_id),
    INDEX idx_users_role (role),
    INDEX idx_users_username (username),
    INDEX idx_users_email (email)
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    sort_order INT DEFAULT 0,
    is_active TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_categories_slug (slug)
);

-- posts
CREATE TABLE IF NOT EXISTS posts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    category_id INT NULL,
    server_id INT NULL,
    post_type VARCHAR(50) DEFAULT 'normal',
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    is_pinned TINYINT DEFAULT 0,
    view_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_posts_user_id (user_id),
    INDEX idx_posts_category_id (category_id),
    INDEX idx_posts_status (status),
    INDEX idx_posts_deleted_at (deleted_at),
    INDEX idx_posts_pinned_created (is_pinned DESC, created_at DESC),
    INDEX idx_posts_server_id (server_id),
    INDEX idx_posts_post_type (post_type),
    INDEX idx_posts_list (deleted_at, status, is_pinned DESC, created_at DESC)
);

-- replies
CREATE TABLE IF NOT EXISTS replies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_reply_id INT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES replies(id) ON DELETE CASCADE,
    INDEX idx_replies_post_id (post_id),
    INDEX idx_replies_user_id (user_id),
    INDEX idx_replies_parent_id (parent_reply_id),
    INDEX idx_replies_status (status),
    INDEX idx_replies_post_created (post_id, created_at),
    INDEX idx_replies_list (post_id, deleted_at, created_at ASC)
);

-- tags
CREATE TABLE IF NOT EXISTS tags (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tags_slug (slug)
);

-- post_tags
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_post_tags_tag (tag_id)
);

-- session_audit (sessions stored in Redis, this is for audit trail)
CREATE TABLE IF NOT EXISTS session_audit (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    mindauth_token VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_audit_user (user_id),
    INDEX idx_session_audit_token (session_token)
);

-- operation_logs
CREATE TABLE IF NOT EXISTS operation_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(100),
    target_id INT,
    details TEXT,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_logs_user_id (user_id),
    INDEX idx_logs_action (action),
    INDEX idx_logs_target (target_type, target_id),
    INDEX idx_logs_created_at (created_at DESC),
    INDEX idx_logs_user_action (user_id, action),
    INDEX idx_logs_list (created_at DESC, user_id, action)
);

-- settings
CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_settings_category (category)
);

-- bans
CREATE TABLE IF NOT EXISTS bans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ban_type VARCHAR(50) NOT NULL,
    value VARCHAR(255) NOT NULL,
    reason TEXT,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_bans_type (ban_type),
    INDEX idx_bans_active (is_active),
    INDEX idx_bans_value (value),
    INDEX idx_bans_lookup (ban_type, value, is_active)
);

-- bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_bookmark (user_id, post_id),
    INDEX idx_bookmarks_user (user_id, created_at DESC),
    INDEX idx_bookmarks_post (post_id)
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    actor_id INT NOT NULL,
    post_id INT NULL,
    reply_id INT NULL,
    content TEXT,
    is_read TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE SET NULL,
    INDEX idx_notifications_user (user_id, is_read, created_at DESC),
    INDEX idx_notifications_actor (actor_id)
);

-- attachments
CREATE TABLE IF NOT EXISTS attachments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id INT NULL,
    reply_id INT NULL,
    user_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    download_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_attachments_post (post_id),
    INDEX idx_attachments_reply (reply_id),
    INDEX idx_attachments_user (user_id)
);

-- messages
CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    is_read TINYINT DEFAULT 0,
    read_at DATETIME NULL,
    deleted_by_sender TINYINT DEFAULT 0,
    deleted_by_recipient TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_messages_sender (sender_id, created_at DESC),
    INDEX idx_messages_recipient (recipient_id, is_read, created_at DESC),
    INDEX idx_messages_conversation (sender_id, recipient_id, created_at DESC),
    INDEX idx_messages_deleted (deleted_by_sender, deleted_by_recipient)
);

-- resource_categories
CREATE TABLE IF NOT EXISTS resource_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    sort_order INT DEFAULT 0,
    is_active TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_resource_categories_slug (slug),
    INDEX idx_resource_categories_active (is_active)
);

-- resources
CREATE TABLE IF NOT EXISTS resources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'upload',
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    file_size INT DEFAULT 0,
    mime_type VARCHAR(100),
    external_url VARCHAR(500),
    version VARCHAR(50),
    content TEXT,
    content_html TEXT,
    category_id INT NULL,
    download_count INT DEFAULT 0,
    is_public TINYINT DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL,
    INDEX idx_resources_user (user_id),
    INDEX idx_resources_status (status),
    INDEX idx_resources_public (is_public, status),
    INDEX idx_resources_created (created_at DESC),
    INDEX idx_resources_category (category_id),
    INDEX idx_resources_type (resource_type)
);

-- resource_versions
CREATE TABLE IF NOT EXISTS resource_versions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    resource_id INT NOT NULL,
    version VARCHAR(50) NOT NULL,
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    file_size INT,
    mime_type VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    UNIQUE KEY unique_version (resource_id, version),
    INDEX idx_resource_versions_resource (resource_id)
);

-- Seed default resource categories
INSERT IGNORE INTO resource_categories (name, slug, description, icon, sort_order) VALUES
('插件', 'plugin', 'Mindustry 插件/模组', 'Puzzle', 1),
('地图', 'map', '游戏地图文件', 'Map', 2),
('服务端', 'server', '服务端配置/工具', 'Server', 3),
('材质包', 'texture', '游戏材质/皮肤', 'Palette', 4),
('教程', 'tutorial', '游戏/搭建教程', 'BookOpen', 5),
('工具', 'tool', '辅助工具', 'Wrench', 6),
('其他', 'other', '其他资源', 'FileText', 7);

-- Phase 3: likes (post and reply likes)
CREATE TABLE IF NOT EXISTS post_likes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_post_like (user_id, post_id),
    INDEX idx_post_likes_user (user_id, created_at DESC),
    INDEX idx_post_likes_post (post_id)
);

CREATE TABLE IF NOT EXISTS reply_likes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    reply_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_reply_like (user_id, reply_id),
    INDEX idx_reply_likes_user (user_id, created_at DESC),
    INDEX idx_reply_likes_reply (reply_id)
);

-- Add like_count columns to posts and replies (run as ALTER if columns don't exist)
-- ALTER TABLE posts ADD COLUMN like_count INT DEFAULT 0 AFTER view_count;
-- ALTER TABLE replies ADD COLUMN like_count INT DEFAULT 0 AFTER status;
