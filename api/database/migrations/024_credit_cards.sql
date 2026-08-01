-- Cartões de crédito: tipo credit + limite e dias de fechamento/vencimento
ALTER TABLE financial_accounts
  MODIFY COLUMN type ENUM('bank', 'investment', 'credit') NOT NULL DEFAULT 'bank',
  ADD COLUMN credit_limit DECIMAL(14,2) NULL AFTER initial_balance,
  ADD COLUMN closing_day TINYINT UNSIGNED NULL AFTER credit_limit,
  ADD COLUMN due_day TINYINT UNSIGNED NULL AFTER closing_day;
