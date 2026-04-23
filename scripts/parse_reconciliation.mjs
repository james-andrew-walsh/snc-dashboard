#!/usr/bin/env node
// Parses an SNC reconciliation text report and emits:
//   - src/data/april17.json  (structured data consumed by the dashboard adapter)
//   - core/supabase/migrations/002_seed_april17.sql  (INSERT statements for Supabase)
//
// Usage:
//   node scripts/parse_reconciliation.mjs <txt-path> <report-date> <out-json> <out-sql>

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const [, , txtPath, reportDate, outJsonPath, outSqlPath] = process.argv
if (!txtPath || !reportDate || !outJsonPath || !outSqlPath) {
  console.error('Usage: parse_reconciliation.mjs <txt> <date> <out-json> <out-sql>')
  process.exit(2)
}

function sha1Uuid(parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16), '8' + h.slice(17, 20), h.slice(20, 32)].join('-')
}

const raw = fs.readFileSync(txtPath, 'utf-8')
// Stop at the final RECONCILIATION SUMMARY section so we don't double-count the variance summary block.
const cutoff = raw.indexOf('RECONCILIATION SUMMARY')
const lines = (cutoff >= 0 ? raw.slice(0, cutoff) : raw).split('\n')

const jobs = []
const foremen = []
const equipment = []
let currentJob = null
let currentForeman = null
let pendingEquipment = null

const JOB_RE = /^\s{2}JOB\s+(\S+)\s+—\s+(.+)$/
const JOB_UUID_RE = /UUID:\s+([0-9a-f-]+)/
const FOREMAN_RE = /┌─\s+FOREMAN:\s+(.+?)\s+\(([A-Z0-9]+)\)\s+\(timecard\s+([0-9a-f]+),\s+rev\s+(\d+)\)/
const DISPATCHED_RE = /Dispatch equipment assigned:\s+(\d+)/
const TIMECARD_EQ_RE = /HeavyJob timecard equipment:\s+(\d+)/

// Status rows. Two broad shapes:
// Shape A (variance/pass/no-data): [STATUS] code kind?desc Sched:Xh Billed:Yh Actual:Zh Var:+Wh  (Actual may be "NO READINGS")
// Shape B (skipped/billed-not-dispatched/no-data stub): [STATUS] code descOnly
const STATUS_LINES = [
  { marker: '[✅ PASS]', status: 'ok' },
  { marker: '[🔴 VARIANCE]', status: 'variance' },
  { marker: '[🔴 IDLE]', status: 'idle' },
  { marker: '[NO DATA]', status: 'no-data' },
  { marker: '[SKIPPED — no JD Link]', status: 'skipped' },
  { marker: '[⚠  BILLED, NOT DISPATCHED]', status: 'billed-not-dispatched' },
  { marker: '[SKIPPED]', status: 'skipped' },
]

function parseMetricLine(rest) {
  // Returns { sched, billed, actual, variance, idle?, description, kind? }
  // rest is e.g. "7707        LD, 20 JD 544L WHEEL LOADER  Sched:9.0h  Billed:16.0h  Actual:2.10h  Var:+13.90h"
  const schedMatch = rest.match(/Sched:\s*([0-9.]+)\s*h/)
  const billedMatch = rest.match(/Billed:\s*([0-9.]+)\s*h/)
  const actualMatch = rest.match(/Actual:\s*([0-9.]+|NO READINGS)\s*h?/i)
  const varMatch = rest.match(/Var:\s*([+-]?[0-9.]+)\s*h/)
  return {
    sched: schedMatch ? parseFloat(schedMatch[1]) : null,
    billed: billedMatch ? parseFloat(billedMatch[1]) : null,
    actual: actualMatch ? (/^NO READINGS$/i.test(actualMatch[1]) ? null : parseFloat(actualMatch[1])) : null,
    variance: varMatch ? parseFloat(varMatch[1]) : null,
  }
}

function splitCodeDesc(rest) {
  // rest starts with spaces, then equipment code (ALNUM up to 12 chars), then spaces, then description
  const m = rest.match(/^\s*([A-Z0-9]+)\s{2,}(.*)$/)
  if (!m) return { code: null, description: rest.trim() }
  return { code: m[1], description: m[2].trim() }
}

function kindFromDescription(desc) {
  const m = desc.match(/^([A-Z]{2}),\s*/)
  if (m) {
    const k = m[1]
    const map = { TK: 'TRUCK', LD: 'LOADER', EX: 'EXCAVATOR', MS: 'MISC', TR: 'TRAILER', RL: 'ROLLER', DZ: 'DOZER', BL: 'GRADER', PV: 'PAVER' }
    if (k.startsWith('R')) return 'RENTAL'
    return map[k] ?? 'MISC'
  }
  if (desc.match(/\bR[0-9]/i)) return 'RENTAL'
  return 'MISC'
}

function stripKindPrefix(desc) {
  return desc.replace(/^[A-Z]{1,3},\s*/, '').trim()
}

function providerFromStatus(status) {
  if (status === 'skipped') return 'NO TLMTRY'
  if (status === 'billed-not-dispatched') return 'NO TLMTRY'
  return 'JDLink'
}

function classify(sched, billed, actual, tol = 0.5) {
  if (actual === null || actual === undefined) return 'no-data'
  if (billed === null || billed === undefined) return 'no-data'
  const variance = billed - actual
  if (Math.abs(variance) <= tol) return 'ok'
  return variance > 0 ? 'over' : 'under'
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const jobMatch = line.match(JOB_RE)
  if (jobMatch) {
    currentJob = {
      job_code: jobMatch[1],
      job_name: jobMatch[2].trim(),
      heavyjob_uuid: null,
    }
    jobs.push(currentJob)
    currentForeman = null
    pendingEquipment = null
    continue
  }
  if (currentJob && !currentJob.heavyjob_uuid) {
    const u = line.match(JOB_UUID_RE)
    if (u) currentJob.heavyjob_uuid = u[1]
  }
  const fMatch = line.match(FOREMAN_RE)
  if (fMatch) {
    currentForeman = {
      job_code: currentJob.job_code,
      foreman_name: fMatch[1].trim(),
      foreman_code: fMatch[2],
      timecard_id: fMatch[3],
      timecard_rev: parseInt(fMatch[4], 10),
      dispatch_assigned: 0,
      timecard_equipment: 0,
    }
    foremen.push(currentForeman)
    pendingEquipment = null
    continue
  }
  if (currentForeman) {
    const d = line.match(DISPATCHED_RE)
    if (d) { currentForeman.dispatch_assigned = parseInt(d[1], 10); continue }
    const t = line.match(TIMECARD_EQ_RE)
    if (t) { currentForeman.timecard_equipment = parseInt(t[1], 10); continue }
  }

  // handle "No timecards" stub
  if (/No timecards found/i.test(line)) {
    // Create a synthetic foreman record so the job still has an entry
    currentForeman = {
      job_code: currentJob.job_code,
      foreman_name: '— no timecards —',
      foreman_code: 'NONE',
      timecard_id: 'no-timecards-' + currentJob.job_code,
      timecard_rev: 0,
      dispatch_assigned: 0,
      timecard_equipment: 0,
    }
    foremen.push(currentForeman)
    continue
  }

  // status line detection
  for (const { marker, status } of STATUS_LINES) {
    const idx = line.indexOf(marker)
    if (idx === -1) continue
    const rest = line.slice(idx + marker.length)
    // Shape-A if "Sched:" appears on same line
    const { code, description } = splitCodeDesc(rest.replace(/Sched:.*$/, ''))
    let metrics = { sched: null, billed: null, actual: null, variance: null }
    if (rest.includes('Sched:')) {
      metrics = parseMetricLine(rest)
    }
    if (!code) break
    const kind = kindFromDescription(description)
    const cleanDesc = stripKindPrefix(description)
    const machineNotRun = /machine not run/i.test(lines[i] + (lines[i + 1] || ''))
    const eqStatus = status === 'idle' ? 'over' : status === 'variance'
      ? (metrics.variance !== null && metrics.variance < 0 ? 'under' : 'over')
      : status === 'skipped' ? 'skipped'
      : status === 'billed-not-dispatched' ? 'billed-not-dispatched'
      : status === 'no-data' ? 'no-data'
      : status === 'ok' ? 'ok' : 'unknown'
    const provider = status === 'skipped' ? 'NO TLMTRY'
      : status === 'billed-not-dispatched' ? 'NO TLMTRY'
      : 'JDLink'
    // The next line may contain "N JD Link readings" — capture if present
    let readingCount = null
    if (i + 1 < lines.length) {
      const rm = lines[i + 1].match(/(\d+)\s+JD Link readings/)
      if (rm) readingCount = parseInt(rm[1], 10)
    }
    const rec = {
      job_code: currentJob.job_code,
      foreman_code: currentForeman ? currentForeman.foreman_code : 'NONE',
      timecard_id: currentForeman ? currentForeman.timecard_id : null,
      equipment_code: code,
      description: cleanDesc,
      kind,
      provider,
      sched_hours: metrics.sched,
      billed_hours: status === 'skipped' ? null : metrics.billed,
      actual_hours: metrics.actual,
      variance: metrics.variance,
      status: eqStatus,
      reading_count: readingCount,
      notes: status === 'billed-not-dispatched' ? 'BILLED NOT DISPATCHED'
        : status === 'skipped' ? 'SKIPPED — no JD Link'
        : status === 'idle' ? 'MACHINE NOT RUN'
        : status === 'no-data' ? 'NO READINGS'
        : null,
    }
    equipment.push(rec)
    break
  }
}

// Detach unique foremen-per-job; id them.
const jobMap = {}
for (const j of jobs) {
  j.id = sha1Uuid(['job', reportDate, j.job_code])
  jobMap[j.job_code] = j
}
const foremanMap = {}
for (const f of foremen) {
  f.id = sha1Uuid(['foreman', reportDate, f.job_code, f.foreman_code, f.timecard_id])
  f.job_id = jobMap[f.job_code].id
  foremanMap[`${f.job_code}|${f.foreman_code}|${f.timecard_id}`] = f
}
for (const e of equipment) {
  e.id = sha1Uuid(['equip', reportDate, e.job_code, e.foreman_code, e.timecard_id || 'nt', e.equipment_code, String(equipment.indexOf(e))])
  const j = jobMap[e.job_code]
  e.job_id = j.id
  const fKey = `${e.job_code}|${e.foreman_code}|${e.timecard_id}`
  const f = foremanMap[fKey]
  e.foreman_id = f ? f.id : null
}

// Build summary
const summary = {
  total: equipment.length,
  flagged: equipment.filter(e => e.status === 'over' || e.status === 'under').length,
  passed: equipment.filter(e => e.status === 'ok').length,
  no_data: equipment.filter(e => e.status === 'no-data').length,
  skipped: equipment.filter(e => e.status === 'skipped').length,
  billed_not_dispatched: equipment.filter(e => e.status === 'billed-not-dispatched').length,
}

const reportId = sha1Uuid(['report', reportDate])

const data = {
  report: {
    id: reportId,
    report_date: reportDate,
    source_file: path.basename(txtPath),
    status: 'reconciled',
    notes: null,
  },
  jobs,
  foremen,
  equipment,
  summary,
}

fs.writeFileSync(outJsonPath, JSON.stringify(data, null, 2))
console.error(`Wrote JSON: ${outJsonPath}`)
console.error(`Jobs: ${jobs.length}, Foremen: ${foremen.length}, Equipment: ${equipment.length}`)
console.error(`Summary:`, summary)

// Emit SQL
function sqlEsc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `'${String(v).replace(/'/g, "''")}'`
}

const sqlBuf = []
sqlBuf.push(`-- Seed: reconciliation for ${reportDate}`)
sqlBuf.push(`-- Generated from ${path.basename(txtPath)}`)
sqlBuf.push(``)
sqlBuf.push(`BEGIN;`)
sqlBuf.push(``)
sqlBuf.push(`-- Clear existing rows for this date (idempotent seeding)`)
sqlBuf.push(`DELETE FROM reconciliation_results WHERE report_id = ${sqlEsc(reportId)};`)
sqlBuf.push(`DELETE FROM dispatch_foremen WHERE report_id = ${sqlEsc(reportId)};`)
sqlBuf.push(`DELETE FROM dispatch_jobs WHERE report_id = ${sqlEsc(reportId)};`)
sqlBuf.push(`DELETE FROM dispatch_reports WHERE id = ${sqlEsc(reportId)};`)
sqlBuf.push(``)
sqlBuf.push(`INSERT INTO dispatch_reports (id, report_date, source_file, status, notes) VALUES`)
sqlBuf.push(`  (${sqlEsc(reportId)}, ${sqlEsc(reportDate)}, ${sqlEsc(path.basename(txtPath))}, 'reconciled', NULL);`)
sqlBuf.push(``)
sqlBuf.push(`INSERT INTO dispatch_jobs (id, report_id, job_code, job_name, heavyjob_uuid) VALUES`)
sqlBuf.push(jobs.map(j => `  (${sqlEsc(j.id)}, ${sqlEsc(reportId)}, ${sqlEsc(j.job_code)}, ${sqlEsc(j.job_name)}, ${sqlEsc(j.heavyjob_uuid)})`).join(',\n') + ';')
sqlBuf.push(``)
sqlBuf.push(`INSERT INTO dispatch_foremen (id, report_id, job_id, foreman_code, foreman_name, timecard_id, timecard_rev, dispatch_assigned, timecard_equipment_count) VALUES`)
sqlBuf.push(foremen.map(f => `  (${sqlEsc(f.id)}, ${sqlEsc(reportId)}, ${sqlEsc(f.job_id)}, ${sqlEsc(f.foreman_code)}, ${sqlEsc(f.foreman_name)}, ${sqlEsc(f.timecard_id)}, ${sqlEsc(f.timecard_rev)}, ${sqlEsc(f.dispatch_assigned)}, ${sqlEsc(f.timecard_equipment)})`).join(',\n') + ';')
sqlBuf.push(``)
sqlBuf.push(`INSERT INTO reconciliation_results (id, report_id, job_id, foreman_id, foreman_code, equipment_code, description, kind, provider, sched_hours, billed_hours, actual_hours, variance, status, reading_count, notes) VALUES`)
sqlBuf.push(equipment.map(e => `  (${sqlEsc(e.id)}, ${sqlEsc(reportId)}, ${sqlEsc(e.job_id)}, ${sqlEsc(e.foreman_id)}, ${sqlEsc(e.foreman_code)}, ${sqlEsc(e.equipment_code)}, ${sqlEsc(e.description)}, ${sqlEsc(e.kind)}, ${sqlEsc(e.provider)}, ${sqlEsc(e.sched_hours)}, ${sqlEsc(e.billed_hours)}, ${sqlEsc(e.actual_hours)}, ${sqlEsc(e.variance)}, ${sqlEsc(e.status)}, ${sqlEsc(e.reading_count)}, ${sqlEsc(e.notes)})`).join(',\n') + ';')
sqlBuf.push(``)
sqlBuf.push(`COMMIT;`)

fs.writeFileSync(outSqlPath, sqlBuf.join('\n'))
console.error(`Wrote SQL: ${outSqlPath}`)
