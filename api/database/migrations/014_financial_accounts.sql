-- Contas bancárias e de investimento por planejamento

CREATE TABLE IF NOT EXISTS financial_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  planning_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('bank', 'investment') NOT NULL DEFAULT 'bank',
  currency ENUM('BRL', 'EUR') NOT NULL DEFAULT 'BRL',
  initial_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  initial_balance_date DATE NOT NULL,
  color VARCHAR(16) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_planning_account_name (planning_id, name)
) ENGINE=InnoDB;
