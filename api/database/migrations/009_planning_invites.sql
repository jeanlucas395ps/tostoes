-- E-mail em usuários + convites para planejamentos

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL AFTER username;

CREATE TABLE IF NOT EXISTS planning_invites (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  planning_id INT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) NOT NULL,
  invited_by_user_id INT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invite_token (token),
  FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_invite_email (email),
  INDEX idx_invite_planning_status (planning_id, status)
) ENGINE=InnoDB;
