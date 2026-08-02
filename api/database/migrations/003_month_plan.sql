-- Itens recorrentes (catálogo da planilha) + confirmação mensal

CREATE TABLE IF NOT EXISTS recurring_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  kind ENUM('income','expense','investment','leisure') NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Geral',
  region ENUM('BR','PT','geral') NOT NULL DEFAULT 'geral',
  responsible VARCHAR(80) NULL,
  due_day TINYINT UNSIGNED NULL,
  investment_type_id INT UNSIGNED NULL,
  is_fixed TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
  INDEX idx_recurring_user (user_id),
  INDEX idx_recurring_name (user_id, kind, name(100))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recurring_item_amounts (
  recurring_item_id INT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (recurring_item_id, month),
  FOREIGN KEY (recurring_item_id) REFERENCES recurring_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS month_plan_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  recurring_item_id INT UNSIGNED NULL,
  kind ENUM('income','expense','investment','leisure') NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Geral',
  region ENUM('BR','PT','geral') NOT NULL DEFAULT 'geral',
  responsible VARCHAR(80) NULL,
  due_day TINYINT UNSIGNED NULL,
  investment_type_id INT UNSIGNED NULL,
  suggested_amount_brl DECIMAL(14,2) NOT NULL,
  confirmed_amount_brl DECIMAL(14,2) NULL,
  status ENUM('pending','confirmed','skipped') NOT NULL DEFAULT 'pending',
  transaction_id INT UNSIGNED NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recurring_item_id) REFERENCES recurring_items(id) ON DELETE SET NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
  INDEX idx_plan_ym (user_id, year, month, status)
) ENGINE=InnoDB;
