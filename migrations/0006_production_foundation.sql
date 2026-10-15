-- Phase 1: additive production POS foundation.
-- Existing tables and records are deliberately left untouched.
CREATE TABLE IF NOT EXISTS pos_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES restaurant_orders(id),
  entry_type TEXT NOT NULL DEFAULT 'payment' CHECK (entry_type IN ('payment','refund','reversal')),
  payment_method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','successful','failed','cancelled','refunded','partially_refunded')),
  provider_reference TEXT,
  parent_payment_id TEXT REFERENCES pos_payments(id),
  idempotency_key TEXT UNIQUE,
  cashier_user_id TEXT REFERENCES pos_users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_payments_order ON pos_payments(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_payments_status ON pos_payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_payments_method ON pos_payments(payment_method, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_loyalty_ledger (
  id TEXT PRIMARY KEY,
  customer_phone TEXT NOT NULL REFERENCES restaurant_customers(phone),
  order_id TEXT REFERENCES restaurant_orders(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earned','redeemed','expired','adjusted','reversed')),
  points INTEGER NOT NULL CHECK (points <> 0),
  reason TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,
  performed_by TEXT REFERENCES pos_users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_loyalty_customer ON pos_loyalty_ledger(customer_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_loyalty_order ON pos_loyalty_ledger(order_id);

CREATE TABLE IF NOT EXISTS pos_audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES pos_users(id),
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  request_id TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_audit_entity ON pos_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_audit_actor ON pos_audit_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  unit TEXT NOT NULL DEFAULT 'unit',
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_low_stock ON pos_inventory_items(active, current_stock, reorder_level);

CREATE TABLE IF NOT EXISTS pos_suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_purchase_orders (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES pos_suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES pos_users(id),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_purchases_created ON pos_purchase_orders(created_at DESC, status);

CREATE TABLE IF NOT EXISTS pos_purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES pos_purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES pos_inventory_items(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_purchase_items_order ON pos_purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS pos_recipes (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  yield_quantity NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_recipes_menu_item ON pos_recipes(menu_item_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS pos_recipe_items (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES pos_recipes(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES pos_inventory_items(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS pos_inventory_movements (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES pos_inventory_items(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','wastage','adjustment','refund','reversal')),
  quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  performed_by TEXT REFERENCES pos_users(id),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_movement_item ON pos_inventory_movements(inventory_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_reference TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES pos_users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_expenses_date ON pos_expenses(expense_date DESC, category);

CREATE TABLE IF NOT EXISTS pos_shifts (
  id TEXT PRIMARY KEY,
  cashier_user_id TEXT NOT NULL REFERENCES pos_users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_cash NUMERIC(12,2),
  cash_difference NUMERIC(12,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_cashier ON pos_shifts(cashier_user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_status ON pos_shifts(status, opened_at DESC);

CREATE TABLE IF NOT EXISTS pos_cash_drawer_entries (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES pos_shifts(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('cash_in','cash_out','opening_float','cash_sale','cash_refund','closing_adjustment')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL DEFAULT '',
  order_id TEXT REFERENCES restaurant_orders(id),
  performed_by TEXT REFERENCES pos_users(id),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_cash_drawer_shift ON pos_cash_drawer_entries(shift_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_kitchen_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  routing JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_kitchen_tickets (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES restaurant_orders(id),
  station_id TEXT REFERENCES pos_kitchen_stations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','served','cancelled')),
  instructions TEXT NOT NULL DEFAULT '',
  reprint_count INTEGER NOT NULL DEFAULT 0 CHECK (reprint_count >= 0),
  created_by TEXT REFERENCES pos_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_queue ON pos_kitchen_tickets(status, station_id, created_at);

CREATE TABLE IF NOT EXISTS pos_kitchen_ticket_items (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES pos_kitchen_tickets(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','served','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_ticket_items ON pos_kitchen_ticket_items(ticket_id, status);

CREATE TABLE IF NOT EXISTS pos_request_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS idx_pos_idempotency_expiry ON pos_request_idempotency(expires_at);