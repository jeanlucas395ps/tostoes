-- Metas financeiras por planejamento

CREATE TABLE IF NOT EXISTS financial_goals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  planning_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#00AB55',
  target_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  deadline_date DATE NULL,
  investment_type_id INT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
  INDEX idx_goals_planning (planning_id, is_active, sort_order)
) ENGINE=InnoDB;
