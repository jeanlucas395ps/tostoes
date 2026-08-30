-- Taxa CDI mensal opcional por conta de investimento (fallback: planning_settings.cdi_monthly_rate)

ALTER TABLE financial_accounts
  ADD COLUMN cdi_monthly_rate DECIMAL(8,6) NULL;
