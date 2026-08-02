-- Moeda USD + fallback de câmbio + permitir nomes repetidos em fixos
ALTER TABLE transactions
  MODIFY COLUMN currency ENUM('BRL','EUR','USD') NOT NULL DEFAULT 'BRL';

ALTER TABLE recurring_items
  MODIFY COLUMN currency ENUM('BRL','EUR','USD') NOT NULL DEFAULT 'BRL';

ALTER TABLE month_plan_entries
  MODIFY COLUMN currency ENUM('BRL','EUR','USD') NOT NULL DEFAULT 'BRL';

ALTER TABLE financial_accounts
  MODIFY COLUMN currency ENUM('BRL','EUR','USD') NOT NULL DEFAULT 'BRL';

ALTER TABLE planning_settings
  ADD COLUMN usd_to_brl DECIMAL(10,4) NOT NULL DEFAULT 5.0000 AFTER eur_to_brl;

ALTER TABLE fx_daily_rates
  ADD COLUMN usd_to_brl DECIMAL(10,6) NULL AFTER eur_to_brl;

-- Gastos/fixos com o mesmo nome são permitidos (posto 2x na semana, etc.)
-- Cria índice em user_id antes de dropar o UNIQUE (FK pode depender do prefixo).
ALTER TABLE recurring_items ADD INDEX idx_recurring_user (user_id);
ALTER TABLE recurring_items DROP INDEX uq_recurring_name;
