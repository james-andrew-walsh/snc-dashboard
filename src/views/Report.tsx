import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchSnapshot, listAvailableDates } from '../data/adapter'
import type { ReconciliationSnapshot } from '../lib/types'

const DEFAULT_DATE = '2026-04-17'

type StatusFilter = 'all' | 'over' | 'under' | 'ok'

type SortKey =
  | 'job_code'
  | 'foreman_name'
  | 'equipment_code'
  | 'description'
  | 'sched_hours'
  | 'billed_hours'
  | 'actual_hours'
  | 'variance'
  | 'status'

interface Row {
  id: string
  job_code: string
  job_name: string
  foreman_name: string
  foreman_code: string | null
  equipment_code: string
  description: string | null
  sched_hours: number | null
  billed_hours: number | null
  actual_hours: number | null
  variance: number | null
  status: string
  kind: string
  provider: string
  reading_count: number | null
  notes: string | null
}

export function Report() {
  const { role } = useAuth()
  const [date, setDate] = useState<string>(DEFAULT_DATE)
  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [jobFilter, setJobFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('job_code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    listAvailableDates().then(setAvailableDates)
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchSnapshot(date).then(snap => {
      if (alive) {
        setSnapshot(snap)
        setLoading(false)
      }
    })
    return () => { alive = false }
  }, [date])

  const canIngest = role === 'admin' || role === 'dispatcher'
  const canReconcile = role === 'admin'

  const rows = useMemo<Row[]>(() => {
    if (!snapshot) return []
    const jobById = new Map(snapshot.jobs.map(j => [j.id, j]))
    const foremanById = new Map(snapshot.foremen.map(f => [f.id, f]))
    return snapshot.equipment
      .filter(e => e.status === 'ok' || e.status === 'over' || e.status === 'under' || e.status === 'no-data')
      .map<Row>(e => {
        const j = jobById.get(e.job_id)
        const f = e.foreman_id ? foremanById.get(e.foreman_id) : null
        return {
          id: e.id,
          job_code: j?.job_code ?? '',
          job_name: j?.job_name ?? '',
          foreman_name: f?.foreman_name ?? '',
          foreman_code: f?.foreman_code ?? e.foreman_code ?? null,
          equipment_code: e.equipment_code,
          description: e.description,
          sched_hours: e.sched_hours,
          billed_hours: e.billed_hours,
          actual_hours: e.actual_hours,
          variance: e.variance,
          status: e.status,
          kind: String(e.kind ?? ''),
          provider: String(e.provider ?? ''),
          reading_count: e.reading_count,
          notes: e.notes,
        }
      })
  }, [snapshot])

  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) if (!seen.has(r.job_code)) seen.set(r.job_code, r.job_name)
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
  }, [rows])

  const filtered = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (jobFilter !== 'all' && r.job_code !== jobFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (q) {
        const hay = `${r.equipment_code} ${r.description ?? ''} ${r.foreman_name} ${r.job_code} ${r.job_name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, statusFilter, jobFilter, search])

  const sorted = useMemo<Row[]>(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const out = [...filtered]
    out.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return out
  }, [filtered, sortKey, sortDir])

  const counts = useMemo(() => {
    let over = 0, under = 0, ok = 0, netVar = 0
    for (const r of rows) {
      if (r.status === 'over') over++
      else if (r.status === 'under') under++
      else if (r.status === 'ok') ok++
      if (r.variance != null) netVar += r.variance
    }
    return { total: rows.length, over, under, ok, netVar }
  }, [rows])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function exportCsv() {
    if (!snapshot) return
    const header = ['job_code', 'job_name', 'foreman_code', 'foreman_name', 'equipment_code', 'description', 'kind', 'provider', 'sched_hours', 'billed_hours', 'actual_hours', 'variance', 'status', 'reading_count', 'notes']
    const data = sorted.map(r => [
      r.job_code, r.job_name, r.foreman_code ?? '', r.foreman_name,
      r.equipment_code, r.description ?? '', r.kind, r.provider,
      r.sched_hours ?? '', r.billed_hours ?? '', r.actual_hours ?? '',
      r.variance ?? '', r.status, r.reading_count ?? '', r.notes ?? '',
    ])
    const csv = [header, ...data].map(row => row.map(v => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snc-reconciliation-${snapshot.report.report_date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || !snapshot) {
    return <div className="p-8 text-slate-400">Loading reconciliation report for {date}…</div>
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-4 lg:p-5 flex flex-wrap items-center gap-3 lg:gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Report Date</div>
          {availableDates.length > 0 ? (
            <select
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
              {!availableDates.includes(date) && <option value={date}>{date}</option>}
            </select>
          ) : (
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Job</div>
          <select
            value={jobFilter}
            onChange={e => setJobFilter(e.target.value)}
            className="mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 max-w-[320px] truncate"
          >
            <option value="all">All jobs ({jobOptions.length})</option>
            {jobOptions.map(j => (
              <option key={j.code} value={j.code}>{j.code} — {j.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Status</div>
          <StatusBanner status={snapshot.report.status} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={!canIngest || busy !== null}
            onClick={() => { setBusy('ingest'); setTimeout(() => setBusy(null), 900) }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={canIngest ? 'Invoke dispatch_ingest edge function' : 'Admin/dispatcher only'}
          >
            {busy === 'ingest' ? 'Ingesting…' : 'Ingest Dispatch'}
          </button>
          <button
            disabled={!canReconcile || busy !== null}
            onClick={() => { setBusy('reconcile'); setTimeout(() => setBusy(null), 900) }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={canReconcile ? 'Invoke run_reconciliation edge function' : 'Admin only'}
          >
            {busy === 'reconcile' ? 'Running…' : 'Run Reconciliation'}
          </button>
          <button
            onClick={exportCsv}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-600 hover:bg-slate-700 cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Total"    value={counts.total} tint="slate" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <SummaryCard label="Over"     value={counts.over}  tint="red"   active={statusFilter === 'over'} onClick={() => setStatusFilter('over')} />
        <SummaryCard label="Under"    value={counts.under} tint="blue"  active={statusFilter === 'under'} onClick={() => setStatusFilter('under')} />
        <SummaryCard label="OK"       value={counts.ok}    tint="green" active={statusFilter === 'ok'} onClick={() => setStatusFilter('ok')} />
        <NetVarianceCard value={counts.netVar} />
      </div>

      {/* ── Status toggle + search ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="All"   active={statusFilter === 'all'}   onClick={() => setStatusFilter('all')} />
        <FilterChip label="Over"  active={statusFilter === 'over'}  onClick={() => setStatusFilter('over')} color="red" />
        <FilterChip label="Under" active={statusFilter === 'under'} onClick={() => setStatusFilter('under')} color="blue" />
        <FilterChip label="OK"    active={statusFilter === 'ok'}    onClick={() => setStatusFilter('ok')} color="green" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, description, foreman…"
          className="ml-auto bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 min-w-[240px]"
        />
      </div>

      {/* ── Data table ──────────────────────────────────────────── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-baseline justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/80">
          <div className="text-sm text-slate-300">
            Showing <span className="font-semibold text-slate-100">{sorted.length}</span> of {counts.total} items
          </div>
          <div className="text-xs text-slate-500">{snapshot.jobs.length} jobs · {snapshot.foremen.length} foremen</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-800/80">
              <tr>
                <Th col="job_code"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Job</Th>
                <Th col="foreman_name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Foreman</Th>
                <Th col="equipment_code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Equipment</Th>
                <Th col="status"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Status</Th>
                <Th col="variance"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Variance h</Th>
                <Th col="description"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Description</Th>
                <Th col="sched_hours"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Sched h</Th>
                <Th col="billed_hours"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Billed h</Th>
                <Th col="actual_hours"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Actual h</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map(r => <DataRow key={r.id} r={r} />)}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm">
              No rows match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Th(props: {
  children: React.ReactNode
  col: SortKey
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = props.sortKey === props.col
  const arrow = active ? (props.sortDir === 'asc' ? '▲' : '▼') : ''
  return (
    <th className={`px-3 py-2 font-medium ${props.align === 'right' ? 'text-right' : ''}`}>
      <button
        onClick={() => props.onSort(props.col)}
        className={`cursor-pointer hover:text-slate-200 ${active ? 'text-orange-300' : ''}`}
      >
        {props.children} <span className="text-[9px] ml-0.5">{arrow}</span>
      </button>
    </th>
  )
}

function DataRow({ r }: { r: Row }) {
  return (
    <tr className="text-slate-300 hover:bg-slate-800/60">
      <td className="px-3 py-2 font-mono text-orange-400 whitespace-nowrap" title={r.job_name}>{r.job_code}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="text-slate-200">{r.foreman_name || <span className="text-slate-600">—</span>}</div>
        {r.foreman_code && <div className="text-[10px] font-mono text-slate-500">{r.foreman_code}</div>}
      </td>
      <td className="px-3 py-2 font-mono text-slate-100">{r.equipment_code}</td>
      <td className="px-3 py-2"><StatusChip status={r.status} /></td>
      <td className={`px-3 py-2 font-mono text-right font-semibold ${varianceColor(r)}`}>{fmtVar(r.variance)}</td>
      <td className="px-3 py-2 text-slate-300 max-w-[360px] truncate" title={r.description ?? ''}>{r.description}</td>
      <td className="px-3 py-2 font-mono text-right">{fmtH(r.sched_hours)}</td>
      <td className="px-3 py-2 font-mono text-right">{fmtH(r.billed_hours)}</td>
      <td className="px-3 py-2 font-mono text-right">{fmtH(r.actual_hours)}</td>
    </tr>
  )
}

function StatusBanner({ status }: { status: string }) {
  const conf = {
    pending:    { bg: 'bg-slate-500/15',   fg: 'text-slate-300',   label: 'Pending' },
    ingested:   { bg: 'bg-blue-500/15',    fg: 'text-blue-300',    label: 'Ingested' },
    reconciled: { bg: 'bg-emerald-500/15', fg: 'text-emerald-300', label: 'Reconciled' },
    error:      { bg: 'bg-red-500/15',     fg: 'text-red-300',     label: 'Error' },
  }[status] ?? { bg: 'bg-slate-500/15', fg: 'text-slate-300', label: status }
  return (
    <span className={`inline-flex items-center gap-1.5 mt-1 rounded-full px-2.5 py-1 text-xs font-semibold ${conf.bg} ${conf.fg}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {conf.label}
    </span>
  )
}

function SummaryCard(props: { label: string; value: number; tint: 'red' | 'green' | 'amber' | 'blue' | 'slate'; onClick?: () => void; active?: boolean }) {
  const tint = {
    red:   'border-red-500/40 bg-red-500/5 text-red-300',
    green: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300',
    amber: 'border-amber-500/40 bg-amber-500/5 text-amber-300',
    blue:  'border-blue-500/40 bg-blue-500/5 text-blue-300',
    slate: 'border-slate-600 bg-slate-800 text-slate-300',
  }[props.tint]
  return (
    <button
      onClick={props.onClick}
      className={`text-left rounded-xl border px-4 py-3 transition-all cursor-pointer hover:brightness-125 ${tint} ${props.active ? 'ring-2 ring-orange-400' : ''}`}
      disabled={!props.onClick}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">{props.label}</div>
      <div className="text-2xl font-bold font-mono mt-0.5">{props.value}</div>
    </button>
  )
}

function NetVarianceCard({ value }: { value: number }) {
  const tone = Math.abs(value) < 0.05
    ? 'border-slate-600 bg-slate-800 text-slate-300'
    : value > 0
      ? 'border-red-500/40 bg-red-500/5 text-red-300'
      : 'border-blue-500/40 bg-blue-500/5 text-blue-300'
  const sign = value > 0 ? '+' : ''
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">Net Variance</div>
      <div className="text-2xl font-bold font-mono mt-0.5">{sign}{value.toFixed(2)}h</div>
    </div>
  )
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: 'red' | 'green' | 'amber' | 'blue' }) {
  const activeColor =
    color === 'red'   ? 'bg-red-500/25 text-red-200 border-red-500/40' :
    color === 'green' ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40' :
    color === 'amber' ? 'bg-amber-500/25 text-amber-200 border-amber-500/40' :
    color === 'blue'  ? 'bg-blue-500/25 text-blue-200 border-blue-500/40' :
                        'bg-orange-500/25 text-orange-200 border-orange-500/40'
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${active ? activeColor : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
    >
      {label}
    </button>
  )
}

function varianceColor(r: Row): string {
  if (r.status === 'over') return 'text-red-400'
  if (r.status === 'under') return 'text-blue-400'
  if (r.status === 'ok') return 'text-emerald-400'
  return 'text-slate-500'
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    ok:        { bg: 'bg-emerald-500/20', fg: 'text-emerald-300', label: 'OK' },
    over:      { bg: 'bg-red-500/20',     fg: 'text-red-300',     label: 'OVER' },
    under:     { bg: 'bg-blue-500/20',    fg: 'text-blue-300',    label: 'UNDER' },
    'no-data': { bg: 'bg-amber-500/20',   fg: 'text-amber-300',   label: 'NO DATA' },
  }
  const c = map[status] ?? { bg: 'bg-slate-700', fg: 'text-slate-300', label: status.toUpperCase() }
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${c.bg} ${c.fg}`}>{c.label}</span>
}

function fmtH(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(2)
}

function fmtVar(v: number | null | undefined): string {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}h`
}
