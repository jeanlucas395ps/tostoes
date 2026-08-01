-- kind transfer: movimentação interna entre contas (não entra no grafo)
ALTER TABLE transactions
  MODIFY COLUMN kind ENUM('income','expense','investment','leisure','transfer') NOT NULL;

ALTER TABLE month_plan_entries
  MODIFY COLUMN kind ENUM('income','expense','investment','leisure','transfer') NOT NULL;

ALTER TABLE recurring_items
  MODIFY COLUMN kind ENUM('income','expense','investment','leisure','transfer') NOT NULL;
