export type ReconStatus =
  | 'ok' | 'over' | 'under' | 'idle'
  | 'no-telematics' | 'dispatch-only' | 'dispatched-not-billed'
  | 'no-job-match' | 'billed-not-dispatched' | 'unknown'

export type EquipmentKind =
  | 'TRUCK' | 'LOADER' | 'EXCAVATOR' | 'RENTAL' | 'TRAILER'
  | 'ROLLER' | 'MISC' | 'DOZER' | 'GRADER' | 'PAVER'

export type TelematicsProvider = 'JDLink' | 'VisionLink' | 'e360' | 'MyKomatsu' | 'NO TLMTRY' | null

export interface DispatchReport {
  id: string
  report_date: string
  source_file: string | null
  status: 'pending' | 'ingested' | 'reconciled' | 'error'
  notes: string | null
}

export interface DispatchJob {
  id: string
  report_id: string
  job_code: string
  job_name: string
  heavyjob_uuid: string | null
  location?: string | null
  contact?: string | null
  daily_notes?: string | null
}

export interface DispatchForeman {
  id: string
  report_id: string
  job_id: string
  foreman_code: string
  foreman_name: string
  timecard_id: string | null
  timecard_rev: number | null
  dispatch_assigned: number
  timecard_equipment_count: number
}

export interface ReconciliationResult {
  id: string
  report_id: string
  job_id: string
  foreman_id: string | null
  foreman_code: string | null
  equipment_code: string
  description: string | null
  alt_code: string | null
  kind: EquipmentKind | string
  provider: TelematicsProvider | string
  sched_hours: number | null
  billed_hours: number | null
  actual_hours: number | null
  variance: number | null
  status: ReconStatus | string
  reading_count: number | null
  notes: string | null
  dispatch_notes: string | null
  timecard_notes: string | null
}

export interface DashboardSummary {
  total: number
  over: number
  under: number
  ok: number
  idle: number
  no_telematics: number
  dispatch_only: number
  dispatched_not_billed: number
  no_job_match: number
  billed_not_dispatched: number
}

export interface ReconciliationSnapshot {
  report: DispatchReport
  jobs: DispatchJob[]
  foremen: DispatchForeman[]
  equipment: ReconciliationResult[]
  summary: DashboardSummary
}

export interface TelematicsPoint {
  snapshotAt: string
  hourMeter: number | null
}
