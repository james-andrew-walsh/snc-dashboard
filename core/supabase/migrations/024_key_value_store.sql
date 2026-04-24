-- CR-011: Run Reconciliation Edge Function
-- A tiny generic key/value table used by edge functions that need to persist
-- state between runs. Its first consumer is run-reconciliation, which rotates
-- the JD Link refresh token (JD invalidates the old one on every use).

BEGIN;

CREATE TABLE IF NOT EXISTS key_value_store (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE key_value_store ENABLE ROW LEVEL SECURITY;

-- No authenticated-role policies: this table is intended to be read/written
-- only by edge functions using the service role key, which bypasses RLS.

COMMIT;
