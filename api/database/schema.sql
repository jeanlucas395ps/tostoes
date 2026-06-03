CREATE DATABASE IF NOT EXISTS gastos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gastos;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  gender ENUM('male','female') NOT NULL DEFAULT 'male',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_settings (
  user_id INT UNSIGNED PRIMARY KEY,
  eur_to_brl DECIMAL(10,4) NOT NULL DEFAULT 6.0000,
  leisure_monthly_brl DECIMAL(14,2) NOT NULL DEFAULT 3200.00,
  montante_inicial_brl DECIMAL(14,2) NOT NULL DEFAULT 101000.00,
  cdi_monthly_rate DECIMAL(8,6) NOT NULL DEFAULT 0.009500,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE investment_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#3fb950',
  target_monthly_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_slug (user_id, slug)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  registered_by_user_id INT UNSIGNED NULL,
  transaction_date DATE NOT NULL,
  kind ENUM('income','expense','investment','leisure') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency ENUM('BRL','EUR') NOT NULL DEFAULT 'BRL',
  amount_brl DECIMAL(14,2) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Geral',
  region ENUM('BR','PT','geral') NOT NULL DEFAULT 'geral',
  responsible VARCHAR(80) NULL,
  notes TEXT NULL,
  investment_type_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (registered_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
  INDEX idx_user_date (user_id, transaction_date),
  INDEX idx_user_kind_date (user_id, kind, transaction_date)
) ENGINE=InnoDB;

CREATE TABLE monthly_projections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  kind ENUM('income','expense','investment','leisure') NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Geral',
  region ENUM('BR','PT','geral') NOT NULL DEFAULT 'geral',
  amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  investment_type_id INT UNSIGNED NULL,
  due_day TINYINT UNSIGNED NULL,
  responsible VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
  UNIQUE KEY uq_projection (user_id, year, month, kind, name(100)),
  INDEX idx_user_ym (user_id, year, month)
) ENGINE=InnoDB;
