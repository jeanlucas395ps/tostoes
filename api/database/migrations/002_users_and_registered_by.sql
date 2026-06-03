-- Migração: gênero nos usuários + quem registrou o lançamento

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender ENUM('male','female') NOT NULL DEFAULT 'male' AFTER name;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS registered_by_user_id INT UNSIGNED NULL AFTER user_id,
  ADD CONSTRAINT fk_transactions_registered_by
    FOREIGN KEY (registered_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
