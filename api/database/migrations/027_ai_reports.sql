CREATE TABLE IF NOT EXISTS ai_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  planning_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  period_start CHAR(7) NOT NULL COMMENT 'YYYY-MM',
  period_end CHAR(7) NOT NULL COMMENT 'YYYY-MM',
  months_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
  title VARCHAR(200) NOT NULL,
  content_json LONGTEXT NOT NULL,
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ai_reports_user_day (user_id, created_at),
  INDEX idx_ai_reports_planning (planning_id, user_id, created_at)
) ENGINE=InnoDB;
