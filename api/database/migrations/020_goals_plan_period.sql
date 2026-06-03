-- Metas com período, valor inicial e confirmação mensal em Movimentos

ALTER TABLE financial_goals
  ADD COLUMN start_date DATE NULL AFTER description,
  ADD COLUMN end_date DATE NULL AFTER start_date,
  ADD COLUMN start_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER target_amount_brl,
  ADD COLUMN due_day TINYINT UNSIGNED NULL DEFAULT 1 AFTER end_date;

ALTER TABLE month_plan_entries
  ADD COLUMN financial_goal_id INT UNSIGNED NULL AFTER recurring_item_id;
