-- SNC Equipment Reconciliation Dashboard v2 — core schema
-- Per PRD.md Section 3.
-- Preserves: auth.users, user_profiles, TelematicsSnapshot, TelematicsProvider.

BEGIN;

-- uuid extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── dispatch_reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  source_file TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'ingested', 'reconciled', 'error')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── dispatch_jobs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      UUID NOT NULL REFERENCES dispatch_reports(id) ON DELETE CASCADE,
  job_code       TEXT NOT NULL,
  job_name       TEXT NOT NULL,
  heavyjob_uuid  UUID,
  location       TEXT,
  contact        TEXT,
  daily_notes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, job_code)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_report ON dispatch_jobs(report_id);

-- ─── dispatch_foremen ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_foremen (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                  UUID NOT NULL REFERENCES dispatch_reports(id) ON DELETE CASCADE,
  job_id                     UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  foreman_code               TEXT NOT NULL,
  foreman_name               TEXT NOT NULL,
  timecard_id                TEXT,
  timecard_rev               INT,
  dispatch_assigned          INT DEFAULT 0,
  timecard_equipment_count   INT DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_foremen_job ON dispatch_foremen(job_id);

-- ─── dispatch_operators ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_operators (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      UUID NOT NULL REFERENCES dispatch_reports(id) ON DELETE CASCADE,
  job_id         UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  operator_code  TEXT NOT NULL,
  operator_name  TEXT,
  union_local    TEXT,
  equipment_code TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── dispatch_laborers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_laborers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      UUID NOT NULL REFERENCES dispatch_reports(id) ON DELETE CASCADE,
  job_id         UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  laborer_code   TEXT NOT NULL,
  laborer_name   TEXT,
  union_local    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── dispatch_equipment_assignments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_equipment_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        UUID NOT NULL REFERENCES dispatch_reports(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  foreman_code     TEXT,
  equipment_code   TEXT NOT NULL,
  description      TEXT,
  kind             TEXT,
  provider         TEXT,
  sched_start      TIMESTAMPTZ,
  sched_end        TIMESTAMPTZ,
  sched_hours      FLOAT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_equip_job ON dispatch_equipment_assignments(job_id);

-- ─── telematics_readings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telematics_readings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        UUID REFERENCES dispatch_reports(id) ON DELETE SET NULL,
  equipment_code   TEXT NOT NULL,
  provider         TEXT NOT NULL DEFAULT 'JDLink',
  reading_time     TIMESTAMPTZ NOT NULL,
  hour_meter_value FLOAT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telematics_readings_code_time
  ON telematics_readings(equipment_code, reading_time);

-- ─── reconciliation_results ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        UUID NOT NULL REFERENCES dispatch_reports(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  foreman_id       UUID REFERENCES dispatch_foremen(id) ON DELETE SET NULL,
  foreman_code     TEXT,
  equipment_code   TEXT NOT NULL,
  description      TEXT,
  kind             TEXT,
  provider         TEXT,
  sched_hours      FLOAT,
  billed_hours     FLOAT,
  actual_hours     FLOAT,
  variance         FLOAT,
  status           TEXT,
  reading_count    INT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recon_report ON reconciliation_results(report_id);
CREATE INDEX IF NOT EXISTS idx_recon_job ON reconciliation_results(job_id);
CREATE INDEX IF NOT EXISTS idx_recon_foreman ON reconciliation_results(foreman_id);
CREATE INDEX IF NOT EXISTS idx_recon_equip ON reconciliation_results(equipment_code);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE dispatch_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_foremen ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_laborers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_equipment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE telematics_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;

-- Authenticated read across all new tables
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'dispatch_reports', 'dispatch_jobs', 'dispatch_foremen',
    'dispatch_operators', 'dispatch_laborers',
    'dispatch_equipment_assignments', 'telematics_readings',
    'reconciliation_results'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read" ON %I', t);
    EXECUTE format('CREATE POLICY "authenticated_read" ON %I FOR SELECT TO authenticated USING (TRUE)', t);
  END LOOP;
END $$;

-- Admin write on all new tables (identified via user_profiles.role = 'admin')
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'dispatch_reports', 'dispatch_jobs', 'dispatch_foremen',
    'dispatch_operators', 'dispatch_laborers',
    'dispatch_equipment_assignments', 'telematics_readings',
    'reconciliation_results'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_write" ON %I', t);
    EXECUTE format($f$
      CREATE POLICY "admin_write" ON %I FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','agent_write','dispatcher')))
        WITH CHECK (EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','agent_write','dispatcher')))
    $f$, t);
  END LOOP;
END $$;

COMMIT;
