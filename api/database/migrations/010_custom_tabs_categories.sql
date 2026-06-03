-- Abas personalizadas (ex.: Brasil, Portugal) e categorias de item (ex.: Mercado, Moradia)

CREATE TABLE IF NOT EXISTS planning_custom_tabs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  planning_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_planning_tab_name (planning_id, name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS planning_item_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  planning_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_planning_category_name (planning_id, name)
) ENGINE=InnoDB;
