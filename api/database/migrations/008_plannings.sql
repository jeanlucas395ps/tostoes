-- Planejamentos (projetos financeiros) multi-usuário

CREATE TABLE IF NOT EXISTS plannings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS planning_members (
  planning_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('owner','member') NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (planning_id, user_id),
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS planning_settings (
  planning_id INT UNSIGNED PRIMARY KEY,
  eur_to_brl DECIMAL(10,4) NOT NULL DEFAULT 6.0000,
  leisure_monthly_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  montante_inicial_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
  cdi_monthly_rate DECIMAL(8,6) NOT NULL DEFAULT 0.009500,
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE
) ENGINE=InnoDB;
