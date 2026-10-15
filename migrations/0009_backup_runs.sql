CREATE TABLE IF NOT EXISTS pos_backup_runs (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  bytes BIGINT NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  created_by TEXT REFERENCES pos_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pos_backup_runs_created ON pos_backup_runs(created_at DESC);