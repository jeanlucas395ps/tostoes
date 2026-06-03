-- Conta de saída (origem) e destino em fixos, lançamentos e metas

ALTER TABLE recurring_items
  ADD COLUMN source_financial_account_id INT UNSIGNED NULL
    AFTER financial_account_id;

ALTER TABLE month_plan_entries
  ADD COLUMN source_financial_account_id INT UNSIGNED NULL
    AFTER financial_account_id;

ALTER TABLE financial_goals
  ADD COLUMN source_financial_account_id INT UNSIGNED NULL
    AFTER investment_type_id,
  ADD COLUMN target_financial_account_id INT UNSIGNED NULL
    AFTER source_financial_account_id;
