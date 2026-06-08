-- Migration: Add email notification preferences and email_logs table
-- Date: 2026-06-08

-- Add email preference columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reply_email BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS mention_email BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS message_email BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS system_email BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS digest_email BOOLEAN DEFAULT FALSE;

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  email_type VARCHAR(50) NOT NULL COMMENT 'reply, mention, message, system',
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'sent' COMMENT 'sent, failed, bounced',
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_logs_user (user_id),
  INDEX idx_email_logs_status (status),
  INDEX idx_email_logs_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Email sending logs';
