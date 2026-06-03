-- Moeda original nos lançamentos do plano do mês (fixos e variáveis)

ALTER TABLE month_plan_entries
  ADD COLUMN currency ENUM('BRL','EUR') NOT NULL DEFAULT 'BRL' AFTER suggested_amount_brl;

ALTER TABLE month_plan_entries
  ADD COLUMN suggested_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER currency;

ALTER TABLE month_plan_entries
  ADD COLUMN confirmed_amount DECIMAL(14,2) NULL AFTER confirmed_amount_brl;
