CREATE TABLE IF NOT EXISTS pos_password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES pos_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_password_reset_user ON pos_password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pos_password_reset_expiry ON pos_password_reset_tokens(expires_at);