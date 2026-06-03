-- Campos extras para itens fixos (EUR, correção mensal)

ALTER TABLE recurring_items
  ADD COLUMN IF NOT EXISTS currency ENUM('BRL','EUR') NOT NULL DEFAULT 'BRL' AFTER default_amount_brl;

ALTER TABLE recurring_items
  ADD COLUMN IF NOT EXISTS amount_original DECIMAL(14,2) NULL AFTER currency;

ALTER TABLE recurring_items
  ADD COLUMN IF NOT EXISTS monthly_adjustment_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER amount_original;

ALTER TABLE investment_types
  ADD COLUMN IF NOT EXISTS current_balance_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER target_monthly_brl;
