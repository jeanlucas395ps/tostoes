-- Responsável por item: referência ao usuário do planejamento em vez de texto livre

ALTER TABLE recurring_items
  ADD COLUMN responsible_user_id INT UNSIGNED NULL AFTER responsible,
  ADD CONSTRAINT fk_recurring_responsible_user
    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE month_plan_entries
  ADD COLUMN responsible_user_id INT UNSIGNED NULL AFTER responsible,
  ADD CONSTRAINT fk_plan_responsible_user
    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN responsible_user_id INT UNSIGNED NULL AFTER responsible,
  ADD CONSTRAINT fk_tx_responsible_user
    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE monthly_projections
  ADD COLUMN responsible_user_id INT UNSIGNED NULL AFTER responsible,
  ADD CONSTRAINT fk_proj_responsible_user
    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL;
