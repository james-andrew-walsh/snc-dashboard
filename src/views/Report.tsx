import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchSnapshot, listAvailableDates } from '../data/adapter'
import { supabase } from '../lib/supabase'
import type { ReconciliationSnapshot } from '../lib/types'

const DEFAULT_DATE = '2026-04-24'

const ALL_STATUSES = [
  'over', 'under', 'ok', 'idle',
  'no-telematics', 'dispatch-only', 'dispatched-not-billed',
  'no-job-match', 'billed-not-dispatched',
] as const

type Status = (typeof ALL_STATUSES)[number]

type SortKey =
  | 'job_code'
  | 'foreman_name'
  | 'equipment_code'
  | 'alt_code'
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
  alt_code: string | null
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
  dispatch_notes: string | null
  timecard_notes: string | null
}

export function Report() {
  const { role } = useAuth()
  const [date, setDate] = useState<string>(DEFAULT_DATE)
  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [activeStatuses, setActiveStatuses] = useState<Set<Status>>(() => new Set(ALL_STATUSES))
  const [activeJobs, setActiveJobs] = useState<Set<string>>(new Set())
  const [activeForemen, setActiveForemen] = useState<Set<string>>(new Set())
  const [varianceMin, setVarianceMin] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('job_code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [busy, setBusy] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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
        setActiveJobs(new Set())
        setActiveForemen(new Set())
        setExpanded(new Set())
      }
    })
    return () => { alive = false }
  }, [date, reloadTick])

  async function runReconciliation() {
    setBusy('reconcile')
    setRunError(null)
    try {
      const { error } = await supabase.functions.invoke('run-reconciliation', {
        body: { reportDate: date },
      })
      if (error) throw new Error(error.message)
      setReloadTick(t => t + 1)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const canIngest = role === 'admin' || role === 'dispatcher'
  const canReconcile = role === 'admin'

  const rows = useMemo<Row[]>(() => {
    if (!snapshot) return []
    const jobById = new Map(snapshot.jobs.map(j => [j.id, j]))
    const foremanById = new Map(snapshot.foremen.map(f => [f.id, f]))
    return snapshot.equipment.map<Row>(e => {
      const j = jobById.get(e.job_id)
      const f = e.foreman_id ? foremanById.get(e.foreman_id) : null
      return {
        id: e.id,
        job_code: j?.job_code ?? '',
        job_name: j?.job_name ?? '',
        foreman_name: f?.foreman_name ?? '',
        foreman_code: f?.foreman_code ?? e.foreman_code ?? null,
        equipment_code: e.equipment_code,
        alt_code: e.alt_code ?? null,
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
        dispatch_notes: e.dispatch_notes ?? null,
        timecard_notes: e.timecard_notes ?? null,
      }
    })
  }, [snapshot])

  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) if (!seen.has(r.job_code)) seen.set(r.job_code, r.job_name)
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
  }, [rows])

  const foremanOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      const code = r.foreman_code ?? ''
      if (!code) continue
      if (!seen.has(code)) seen.set(code, r.foreman_name || code)
    }
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filtered = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase()
    const jobAll = activeJobs.size === 0
    const foremanAll = activeForemen.size === 0
    return rows.filter(r => {
      if (!activeStatuses.has(r.status as Status)) return false
      if (!jobAll && !activeJobs.has(r.job_code)) return false
      if (!foremanAll && !activeForemen.has(r.foreman_code ?? '')) return false
      if (varianceMin > 0) {
        const v = r.variance ?? 0
        if (Math.abs(v) < varianceMin) return false
      }
      if (q) {
        const hay = `${r.equipment_code} ${r.alt_code ?? ''} ${r.description ?? ''} ${r.foreman_name} ${r.job_code} ${r.job_name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, activeStatuses, activeJobs, activeForemen, varianceMin, search])

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
    const c: Record<string, number> = {}
    let netVar = 0
    for (const r of rows) {
      c[r.status] = (c[r.status] ?? 0) + 1
      if (r.variance != null) netVar += r.variance
    }
    return {
      total: rows.length,
      over: c['over'] ?? 0,
      under: c['under'] ?? 0,
      ok: c['ok'] ?? 0,
      idle: c['idle'] ?? 0,
      noTelematics: c['no-telematics'] ?? 0,
      dispatchOnly: c['dispatch-only'] ?? 0,
      dispatchedNotBilled: c['dispatched-not-billed'] ?? 0,
      noJobMatch: c['no-job-match'] ?? 0,
      billedNotDispatched: c['billed-not-dispatched'] ?? 0,
      netVar,
    }
  }, [rows])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function toggleStatus(s: Status) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function exportCsv() {
    if (!snapshot) return
    const header = ['job_code', 'job_name', 'foreman_code', 'foreman_name', 'equipment_code', 'alt_code', 'description', 'kind', 'provider', 'sched_hours', 'billed_hours', 'actual_hours', 'variance', 'status', 'reading_count', 'notes', 'dispatch_notes', 'timecard_notes']
    const data = sorted.map(r => [
      r.job_code, r.job_name, r.foreman_code ?? '', r.foreman_name,
      r.equipment_code, r.alt_code ?? '', r.description ?? '', r.kind, r.provider,
      r.sched_hours ?? '', r.billed_hours ?? '', r.actual_hours ?? '',
      r.variance ?? '', r.status, r.reading_count ?? '', r.notes ?? '',
      r.dispatch_notes ?? '', r.timecard_notes ?? '',
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

        <MultiSelectDropdown
          label="Jobs"
          options={jobOptions.map(j => ({ value: j.code, label: `${j.code} — ${j.name}` }))}
          selected={activeJobs}
          onChange={setActiveJobs}
          allLabel="All jobs"
        />

        <MultiSelectDropdown
          label="Foremen"
          options={foremanOptions.map(f => ({ value: f.code, label: `${f.name} (${f.code})` }))}
          selected={activeForemen}
          onChange={setActiveForemen}
          allLabel="All foremen"
        />

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Min Variance (h)</div>
          <input
            type="number"
            min={0}
            step={0.5}
            value={varianceMin}
            onChange={e => setVarianceMin(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 w-24 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
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
            onClick={runReconciliation}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={canReconcile ? 'Invoke run-reconciliation edge function' : 'Admin only'}
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

      {runError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          Reconciliation failed: {runError}
        </div>
      )}

      {/* ── Summary cards: actionable row ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Over"               value={counts.over}                 tint="red"    active={activeStatuses.has('over')}                 onClick={() => toggleStatus('over')} />
        <SummaryCard label="Under"              value={counts.under}                tint="blue"   active={activeStatuses.has('under')}                onClick={() => toggleStatus('under')} />
        <SummaryCard label="OK"                 value={counts.ok}                   tint="green"  active={activeStatuses.has('ok')}                   onClick={() => toggleStatus('ok')} />
        <SummaryCard label="Idle"               value={counts.idle}                 tint="orange" active={activeStatuses.has('idle')}                 onClick={() => toggleStatus('idle')} />
        <SummaryCard label="Dispatched / Not Billed" value={counts.dispatchedNotBilled} tint="amber"  active={activeStatuses.has('dispatched-not-billed')} onClick={() => toggleStatus('dispatched-not-billed')} />
      </div>

      {/* ── Summary cards: informational row ────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Dispatch Only"      value={counts.dispatchOnly}         tint="slate"  active={activeStatuses.has('dispatch-only')}        onClick={() => toggleStatus('dispatch-only')} />
        <SummaryCard label="No Telematics"      value={counts.noTelematics}         tint="gray"   active={activeStatuses.has('no-telematics')}        onClick={() => toggleStatus('no-telematics')} />
        <SummaryCard label="No Job Match"       value={counts.noJobMatch}           tint="muted"  active={activeStatuses.has('no-job-match')}         onClick={() => toggleStatus('no-job-match')} />
        <SummaryCard label="Billed / Not Dispatched" value={counts.billedNotDispatched} tint="purple" active={activeStatuses.has('billed-not-dispatched')} onClick={() => toggleStatus('billed-not-dispatched')} />
        <NetVarianceCard value={counts.netVar} />
      </div>

      {/* ── Status chips + search ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveStatuses(new Set(ALL_STATUSES))}
          className="rounded-full border border-slate-600 px-3 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100 cursor-pointer"
        >
          Show All
        </button>
        <button
          onClick={() => setActiveStatuses(new Set())}
          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-600 hover:text-slate-300 cursor-pointer"
        >
          Clear
        </button>
        {ALL_STATUSES.map(s => (
          <FilterChip
            key={s}
            label={statusLabel(s)}
            active={activeStatuses.has(s)}
            onClick={() => toggleStatus(s)}
            color={statusColor(s)}
          />
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, alt-code, description, foreman…"
          className="ml-auto bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 min-w-[260px]"
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
                <th className="px-2 py-2 w-8"></th>
                <Th col="job_code"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Job</Th>
                <Th col="foreman_name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Foreman</Th>
                <Th col="status"         sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Status</Th>
                <Th col="variance"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Variance h</Th>
                <Th col="equipment_code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Equipment</Th>
                <Th col="alt_code"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Alt Code</Th>
                <Th col="description"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Description</Th>
                <Th col="sched_hours"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Sched h</Th>
                <Th col="billed_hours"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Billed h</Th>
                <Th col="actual_hours"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">Actual h</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map(r => (
                <DataRow
                  key={r.id}
                  r={r}
                  expanded={expanded.has(r.id)}
                  onToggle={() => toggleExpanded(r.id)}
                />
              ))}
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

function DataRow({ r, expanded, onToggle }: { r: Row; expanded: boolean; onToggle: () => void }) {
  const hasNotes = !!(r.dispatch_notes || r.timecard_notes || r.notes)
  return (
    <>
      <tr
        className={`text-slate-300 hover:bg-slate-800/60 cursor-pointer ${rowTint(r.status)}`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-slate-500 text-center">
          {hasNotes ? (expanded ? '▾' : '▸') : ''}
        </td>
        <td className="px-3 py-2 font-mono text-orange-400 whitespace-nowrap" title={r.job_name}>{r.job_code}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <div className="text-slate-200">{r.foreman_name || <span className="text-slate-600">—</span>}</div>
          {r.foreman_code && <div className="text-[10px] font-mono text-slate-500">{r.foreman_code}</div>}
        </td>
        <td className="px-3 py-2"><StatusChip status={r.status} /></td>
        <td className={`px-3 py-2 font-mono text-right font-semibold ${varianceColor(r)}`}>{fmtVar(r.variance)}</td>
        <td className="px-3 py-2 font-mono text-slate-100">{r.equipment_code}</td>
        <td className="px-3 py-2 font-mono text-slate-400">{r.alt_code ?? <span className="text-slate-600">—</span>}</td>
        <td className="px-3 py-2 text-slate-300 max-w-[280px] truncate" title={r.description ?? ''}>{r.description}</td>
        <td className="px-3 py-2 font-mono text-right">{fmtH(r.sched_hours)}</td>
        <td className="px-3 py-2 font-mono text-right">{fmtH(r.billed_hours)}</td>
        <td className="px-3 py-2 font-mono text-right">{fmtH(r.actual_hours)}</td>
      </tr>
      {expanded && hasNotes && (
        <tr className="bg-slate-900/50">
          <td></td>
          <td colSpan={10} className="px-3 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <NoteBlock label="Status Note" body={r.notes} />
              <NoteBlock label="Dispatch Notes" body={r.dispatch_notes} />
              <NoteBlock label="Timecard Notes" body={r.timecard_notes} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function NoteBlock({ label, body }: { label: string; body: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-slate-300 whitespace-pre-wrap">
        {body ? body : <span className="text-slate-600">—</span>}
      </div>
    </div>
  )
}

function MultiSelectDropdown({ label, options, selected, onChange, allLabel }: {
  label: string
  options: { value: string; label: string }[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  allLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const allOn = selected.size === 0
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  function toggle(value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value); else next.add(value)
    onChange(next)
  }

  function selectAll() { onChange(new Set()) }
  function clearAll() { onChange(new Set()) }

  const triggerLabel = allOn ? allLabel : `${selected.size} selected`

  return (
    <div ref={ref} className="relative">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <button
        onClick={() => setOpen(o => !o)}
        className="mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 min-w-[180px] text-left flex items-center gap-2 cursor-pointer hover:border-slate-500"
      >
        <span className="truncate">{triggerLabel}</span>
        {!allOn && (
          <span className="ml-auto inline-flex items-center justify-center bg-orange-500/30 text-orange-200 rounded-full px-1.5 text-[10px] font-semibold">
            {selected.size}
          </span>
        )}
        <span className="text-slate-500 text-[10px]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[320px] max-h-[360px] flex flex-col bg-slate-900 border border-slate-600 rounded-lg shadow-2xl">
          <div className="p-2 border-b border-slate-700">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={selectAll} className="text-[10px] text-orange-300 hover:text-orange-200 cursor-pointer">All</button>
              <button onClick={clearAll} className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer">Clear</button>
              <span className="ml-auto text-[10px] text-slate-500">{options.length} options</span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {visible.map(o => {
              const checked = allOn ? true : selected.has(o.value)
              return (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    className="accent-orange-500"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              )
            })}
            {visible.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-500">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
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

type Tint = 'red' | 'green' | 'amber' | 'blue' | 'orange' | 'slate' | 'gray' | 'muted' | 'purple'

function SummaryCard(props: { label: string; value: number; tint: Tint; onClick?: () => void; active?: boolean }) {
  const tint: Record<Tint, string> = {
    red:    'border-red-500/40 bg-red-500/5 text-red-300',
    green:  'border-emerald-500/40 bg-emerald-500/5 text-emerald-300',
    amber:  'border-amber-500/50 bg-amber-500/10 text-amber-200',
    blue:   'border-blue-500/40 bg-blue-500/5 text-blue-300',
    orange: 'border-orange-500/40 bg-orange-500/5 text-orange-300',
    slate:  'border-slate-600 bg-slate-800 text-slate-300',
    gray:   'border-slate-500/40 bg-slate-500/5 text-slate-300',
    muted:  'border-slate-700 bg-slate-900/60 text-slate-500',
    purple: 'border-purple-500/40 bg-purple-500/5 text-purple-300',
  }
  return (
    <button
      onClick={props.onClick}
      className={`text-left rounded-xl border px-4 py-3 transition-all cursor-pointer hover:brightness-125 ${tint[props.tint]} ${props.active ? 'ring-2 ring-orange-400' : 'opacity-60'}`}
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

type ChipColor = 'red' | 'green' | 'amber' | 'blue' | 'orange' | 'gray' | 'muted' | 'purple'

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: ChipColor }) {
  const activeColor: Record<ChipColor, string> = {
    red:    'bg-red-500/25 text-red-200 border-red-500/40',
    green:  'bg-emerald-500/25 text-emerald-200 border-emerald-500/40',
    amber:  'bg-amber-500/30 text-amber-100 border-amber-500/60',
    blue:   'bg-blue-500/25 text-blue-200 border-blue-500/40',
    orange: 'bg-orange-500/25 text-orange-200 border-orange-500/40',
    gray:   'bg-slate-500/25 text-slate-200 border-slate-500/40',
    muted:  'bg-slate-700/40 text-slate-400 border-slate-600',
    purple: 'bg-purple-500/25 text-purple-200 border-purple-500/40',
  }
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${active ? activeColor[color] : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`}
    >
      {label}
    </button>
  )
}

function statusColor(s: Status): ChipColor {
  switch (s) {
    case 'over': return 'red'
    case 'under': return 'blue'
    case 'ok': return 'green'
    case 'idle': return 'orange'
    case 'no-telematics': return 'gray'
    case 'dispatch-only': return 'gray'
    case 'dispatched-not-billed': return 'amber'
    case 'no-job-match': return 'muted'
    case 'billed-not-dispatched': return 'purple'
  }
}

function statusLabel(s: Status): string {
  return s.replace(/-/g, ' ').toUpperCase()
}

function rowTint(status: string): string {
  if (status === 'dispatched-not-billed') return 'bg-amber-500/5'
  return ''
}

function varianceColor(r: Row): string {
  if (r.status === 'over') return 'text-red-400'
  if (r.status === 'under') return 'text-blue-400'
  if (r.status === 'ok') return 'text-emerald-400'
  if (r.status === 'idle') return 'text-orange-400'
  return 'text-slate-500'
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    ok:                       { bg: 'bg-emerald-500/20', fg: 'text-emerald-300', label: 'OK' },
    over:                     { bg: 'bg-red-500/20',     fg: 'text-red-300',     label: 'OVER' },
    under:                    { bg: 'bg-blue-500/20',    fg: 'text-blue-300',    label: 'UNDER' },
    idle:                     { bg: 'bg-orange-500/20',  fg: 'text-orange-300',  label: 'IDLE' },
    'no-telematics':          { bg: 'bg-slate-500/20',   fg: 'text-slate-300',   label: 'NO TLMTRY' },
    'dispatch-only':          { bg: 'bg-slate-600/30',   fg: 'text-slate-200',   label: 'DISPATCH ONLY' },
    'dispatched-not-billed':  { bg: 'bg-amber-500/30',   fg: 'text-amber-100',   label: 'DSPTCH / NOT BILLED' },
    'no-job-match':           { bg: 'bg-slate-700/50',   fg: 'text-slate-400',   label: 'NO JOB MATCH' },
    'billed-not-dispatched':  { bg: 'bg-purple-500/20',  fg: 'text-purple-300',  label: 'BILLED / NOT DSPTCH' },
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
