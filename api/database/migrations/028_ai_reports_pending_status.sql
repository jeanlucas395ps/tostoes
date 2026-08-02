ALTER TABLE ai_reports
  MODIFY COLUMN status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending';
