import { supabase } from '../lib/supabase'
import type {
  DispatchForeman,
  DispatchJob,
  DispatchReport,
  ReconciliationResult,
  ReconciliationSnapshot,
  TelematicsPoint,
} from '../lib/types'
import april17 from './april17.json'

// PDT (Pacific Daylight Time) is UTC-7. The dashboard's report dates are in PDT.
const PDT_OFFSET_HOURS = 7

const rawSeed = april17 as unknown as Omit<ReconciliationSnapshot, 'summary'> & { summary?: unknown }
const seedSnapshot: ReconciliationSnapshot = {
  report: rawSeed.report,
  jobs: rawSeed.jobs,
  foremen: rawSeed.foremen,
  equipment: rawSeed.equipment,
  summary: computeSummary(rawSeed.equipment),
}

export function classifyStatus(
  billed: number | null,
  actual: number | null,
  tolerance = 0.5,
): 'ok' | 'over' | 'under' | 'no-data' {
  if (billed == null || actual == null) return 'no-data'
  const variance = billed - actual
  if (Math.abs(variance) <= tolerance) return 'ok'
  return variance > 0 ? 'over' : 'under'
}

export function computeSummary(equipment: ReconciliationResult[]): ReconciliationSnapshot['summary'] {
  return {
    total: equipment.length,
    over: equipment.filter(e => e.status === 'over').length,
    under: equipment.filter(e => e.status === 'under').length,
    ok: equipment.filter(e => e.status === 'ok').length,
    idle: equipment.filter(e => e.status === 'idle').length,
    no_telematics: equipment.filter(e => e.status === 'no-telematics').length,
    dispatch_only: equipment.filter(e => e.status === 'dispatch-only').length,
    dispatched_not_billed: equipment.filter(e => e.status === 'dispatched-not-billed').length,
    no_job_match: equipment.filter(e => e.status === 'no-job-match').length,
    billed_not_dispatched: equipment.filter(e => e.status === 'billed-not-dispatched').length,
  }
}

async function fetchFromSupabase(reportDate: string): Promise<ReconciliationSnapshot | null> {
  const { data: reports, error: reportErr } = await supabase
    .from('dispatch_reports')
    .select('*')
    .eq('report_date', reportDate)
    .limit(1)

  if (reportErr || !reports || reports.length === 0) return null
  const report = reports[0] as DispatchReport

  const [{ data: jobs }, { data: foremen }, { data: equipment }] = await Promise.all([
    supabase.from('dispatch_jobs').select('*').eq('report_id', report.id),
    supabase.from('dispatch_foremen').select('*').eq('report_id', report.id),
    supabase.from('reconciliation_results').select('*').eq('report_id', report.id),
  ])

  if (!jobs || !foremen || !equipment) return null
  if (jobs.length === 0 || equipment.length === 0) return null

  return {
    report,
    jobs: jobs as DispatchJob[],
    foremen: foremen as DispatchForeman[],
    equipment: equipment as ReconciliationResult[],
    summary: computeSummary(equipment as ReconciliationResult[]),
  }
}

export async function fetchSnapshot(reportDate: string): Promise<ReconciliationSnapshot> {
  try {
    const snap = await fetchFromSupabase(reportDate)
    if (snap) return snap
  } catch {
    // fall through to seed
  }
  if (reportDate === seedSnapshot.report.report_date) return seedSnapshot
  return {
    report: { ...seedSnapshot.report, id: 'empty', report_date: reportDate, status: 'pending', source_file: null, notes: null },
    jobs: [],
    foremen: [],
    equipment: [],
    summary: { total: 0, over: 0, under: 0, ok: 0, idle: 0, no_telematics: 0, dispatch_only: 0, dispatched_not_billed: 0, no_job_match: 0, billed_not_dispatched: 0 },
  }
}

export async function listAvailableDates(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('dispatch_reports')
      .select('report_date')
      .order('report_date', { ascending: false })
    if (!error && data && data.length > 0) {
      return (data as { report_date: string }[]).map(r => r.report_date)
    }
  } catch {
    // fall through
  }
  return [seedSnapshot.report.report_date]
}

// Fetch raw TelematicsSnapshot rows for a given equipment code over the 24-hour
// PDT window covering reportDate (00:00–24:00 PDT). Returns an empty array when
// nothing is found or Supabase is unreachable; callers render an empty state.
export async function fetchTelematicsForDate(
  equipmentCode: string,
  reportDate: string,
): Promise<TelematicsPoint[]> {
  const startUtc = pdtMidnightUtc(reportDate)
  const endUtc = pdtMidnightUtc(addDays(reportDate, 1))
  try {
    const { data, error } = await supabase
      .from('TelematicsSnapshot')
      .select('snapshotAt, hourMeterReadingInHours')
      .eq('equipmentCode', equipmentCode)
      .gte('snapshotAt', startUtc)
      .lt('snapshotAt', endUtc)
      .order('snapshotAt', { ascending: true })
    if (error || !data) return []
    return (data as { snapshotAt: string; hourMeterReadingInHours: number | null }[]).map(r => ({
      snapshotAt: r.snapshotAt,
      hourMeter: r.hourMeterReadingInHours,
    }))
  } catch {
    return []
  }
}

function pdtMidnightUtc(reportDate: string): string {
  // 00:00 PDT == 07:00 UTC the same calendar date.
  const hh = String(PDT_OFFSET_HOURS).padStart(2, '0')
  return `${reportDate}T${hh}:00:00.000Z`
}

function addDays(reportDate: string, days: number): string {
  const dt = new Date(reportDate + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
