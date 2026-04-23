import { supabase } from '../lib/supabase'
import type {
  DispatchForeman,
  DispatchJob,
  DispatchReport,
  HistoryPoint,
  ReconciliationResult,
  ReconciliationSnapshot,
} from '../lib/types'
import april17 from './april17.json'

const seedSnapshot: ReconciliationSnapshot = april17 as unknown as ReconciliationSnapshot

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
    flagged: equipment.filter(e => e.status === 'over' || e.status === 'under').length,
    passed: equipment.filter(e => e.status === 'ok').length,
    no_data: equipment.filter(e => e.status === 'no-data').length,
    skipped: equipment.filter(e => e.status === 'skipped').length,
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
    summary: { total: 0, flagged: 0, passed: 0, no_data: 0, skipped: 0, billed_not_dispatched: 0 },
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

// Deterministic 7-day history synthesizer keyed on equipment code.
// Used by the Magnet Board detail panel when real telematics_readings are absent.
export function deterministicHistory(equipmentCode: string, days = 7): HistoryPoint[] {
  let seed = 0
  for (const ch of equipmentCode) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed & 0xffff) / 0xffff
  }
  const out: HistoryPoint[] = []
  for (let d = days - 1; d >= 0; d--) {
    const sched = 8 + Math.round(rand() * 20) / 10
    const billed = sched + (rand() - 0.5) * 2
    const ran = billed + (rand() - 0.5) * 3
    out.push({ day: d, sched, billed: +billed.toFixed(2), ran: +ran.toFixed(2) })
  }
  return out
}

export function mergeHistoryWithToday(
  history: HistoryPoint[],
  today: ReconciliationResult,
): HistoryPoint[] {
  return history.map(p =>
    p.day === 0
      ? { day: 0, sched: today.sched_hours, billed: today.billed_hours, ran: today.actual_hours }
      : p,
  )
}
