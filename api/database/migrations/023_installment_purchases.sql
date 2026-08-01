-- Compras parceladas: mesmo fluxo de gasto fixo, com janela de meses
ALTER TABLE recurring_items
  ADD COLUMN is_installment TINYINT(1) NOT NULL DEFAULT 0 AFTER is_fixed,
  ADD COLUMN start_date DATE NULL AFTER is_installment,
  ADD COLUMN end_date DATE NULL AFTER start_date;

CREATE INDEX idx_recurring_installment ON recurring_items (planning_id, is_installment, active);
