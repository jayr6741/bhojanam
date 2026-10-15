ALTER TABLE pos_loyalty_ledger ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_pos_loyalty_expiry ON pos_loyalty_ledger(expires_at) WHERE entry_type='earned';

CREATE TABLE IF NOT EXISTS pos_loyalty_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  minimum_points INTEGER NOT NULL DEFAULT 0 CHECK (minimum_points >= 0),
  earning_multiplier NUMERIC(6,3) NOT NULL DEFAULT 1 CHECK (earning_multiplier > 0),
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_loyalty_rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  reward_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reward_value >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pos_loyalty_tiers(id,name,minimum_points,earning_multiplier,benefits) VALUES
('tier-member','Member',0,1,'[]'::jsonb),
('tier-silver','Silver',500,1.25,'["Priority rewards"]'::jsonb),
('tier-gold','Gold',1500,1.5,'["Priority rewards","Birthday reward"]'::jsonb),
('tier-platinum','Platinum',5000,2,'["Priority rewards","Birthday reward","Exclusive offers"]'::jsonb)
ON CONFLICT(name) DO NOTHING;