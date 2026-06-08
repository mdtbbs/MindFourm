-- Migration: Add search history and popular searches tables
-- Date: 2026-06-08

CREATE TABLE IF NOT EXISTS search_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL,
  query VARCHAR(255) NOT NULL,
  search_type ENUM('post', 'user', 'global') DEFAULT 'global',
  results_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_search_history_user_created (user_id, created_at DESC),
  INDEX idx_search_history_query (query),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='User search history';

CREATE TABLE IF NOT EXISTS popular_searches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  query VARCHAR(255) UNIQUE NOT NULL,
  count INT DEFAULT 0,
  last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_popular_searches_count (count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Popular search terms';
