-- CR-012: Add dispatch_notes and timecard_notes to reconciliation_results.
-- Populated by run-reconciliation edge function so the dashboard can display
-- per-row context without an extra join.

ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS timecard_notes TEXT;
