-- Início de uso do planejamento e contas de investimento (baseline jun/2026).
UPDATE plannings SET created_at = '2026-06-01 00:00:00';
UPDATE financial_accounts
SET created_at = '2026-06-01 00:00:00'
WHERE type = 'investment';
