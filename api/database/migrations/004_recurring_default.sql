-- Valor padrão mensal no catálogo de fixos
ALTER TABLE recurring_items
  ADD COLUMN IF NOT EXISTS default_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER investment_type_id;
