-- CR-010: Dispatch PDF Extract Edge Function — schema additions
-- Adds columns needed by the new dispatch-extract edge function.

BEGIN;

-- Storage path for the PDF that was processed (e.g. "dispatcher_reports/2026-04-17.pdf")
ALTER TABLE dispatch_reports
  ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- SNC's operational alt-code: "<TYPE> <CODE>" (e.g. "LD 7707")
ALTER TABLE dispatch_equipment_assignments
  ADD COLUMN IF NOT EXISTS alt_code TEXT;

ALTER TABLE reconciliation_results
  ADD COLUMN IF NOT EXISTS alt_code TEXT;

-- Allow a new status value emitted by the extractor.
ALTER TABLE dispatch_reports
  DROP CONSTRAINT IF EXISTS dispatch_reports_status_check;
ALTER TABLE dispatch_reports
  ADD CONSTRAINT dispatch_reports_status_check
  CHECK (status IN ('pending', 'ingested', 'extracted', 'reconciled', 'error'));

COMMIT;
