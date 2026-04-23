import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchSnapshot,
  fetchTelematicsForDate,
  listAvailableDates,
} from '../data/adapter'
import type {
  DispatchForeman,
  DispatchJob,
  ReconciliationResult,
  ReconciliationSnapshot,
  TelematicsPoint,
} from '../lib/types'

const DEFAULT_DATE = '2026-04-17'
const COL_WIDTH = 320
const BUFFER_COLS = 1
const SLIDE_MS = 300
const SWIPE_THRESHOLD = 50
const MOBILE_BREAKPOINT = 640
const TABLET_BREAKPOINT = 1024

type RoleFilter = 'all' | 'foreman' | 'equipment'
type StatusFilter = 'all' | 'flagged' | 'no-data'
type ChartMode = 'line' | 'bar'

export function MagnetBoard() {
  const [date, setDate] = useState(DEFAULT_DATE)
  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selected, setSelected] = useState<ReconciliationResult | null>(null)
  const [jobFilter, setJobFilter] = useState<string | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [hideOk, setHideOk] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [tolerance, setTolerance] = useState(0.5)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [chartMode, setChartMode] = useState<ChartMode>('line')
  const viewportRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchDeltaX = useRef(0)
  const touchIsHorizontal = useRef(false)

  useEffect(() => { listAvailableDates().then(setAvailableDates) }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { setCurrentIndex(0) }, [jobFilter, date])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchSnapshot(date).then(snap => {
      if (alive) {
        setSnapshot(snap)
        setSelected(null)
        setLoading(false)
      }
    })
    return () => { alive = false }
  }, [date])

  const visibleJobs = useMemo(() => {
    if (!snapshot) return []
    if (jobFilter === 'all') return snapshot.jobs
    return snapshot.jobs.filter(j => j.id === jobFilter)
  }, [snapshot, jobFilter])

  const reclassified = useMemo<ReconciliationResult[]>(() => {
    if (!snapshot) return []
    return snapshot.equipment.map(e => {
      if (e.status === 'skipped' || e.status === 'billed-not-dispatched') return e
      if (e.billed_hours == null || e.actual_hours == null) return { ...e, status: 'no-data' }
      const variance = e.billed_hours - e.actual_hours
      if (Math.abs(variance) <= tolerance) return { ...e, status: 'ok', variance }
      return { ...e, status: variance > 0 ? 'over' : 'under', variance }
    })
  }, [snapshot, tolerance])

  const colWidth =
    containerWidth > 0 && containerWidth < MOBILE_BREAKPOINT
      ? containerWidth
      : containerWidth > 0 && containerWidth < TABLET_BREAKPOINT
        ? Math.floor(containerWidth / 2)
        : COL_WIDTH
  const visibleCount = Math.max(1, Math.floor((containerWidth || colWidth * 6) / colWidth))
  const maxIndex = Math.max(0, visibleJobs.length - visibleCount)
  const clampedIndex = Math.min(currentIndex, maxIndex)
  const startIndex = Math.max(0, clampedIndex - BUFFER_COLS)
  const endIndex = Math.min(visibleJobs.length, clampedIndex + visibleCount + BUFFER_COLS)
  const virtualJobs = visibleJobs.slice(startIndex, endIndex)
  const showSlider = visibleJobs.length > visibleCount

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
    touchDeltaX.current = 0
    touchIsHorizontal.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartX.current
    const dy = t.clientY - touchStartY.current
    touchDeltaX.current = dx
    if (!touchIsHorizontal.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchIsHorizontal.current = true
    }
  }

  function handleTouchEnd() {
    const dx = touchDeltaX.current
    if (touchIsHorizontal.current && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) setCurrentIndex(idx => Math.min(idx + 1, maxIndex))
      else setCurrentIndex(idx => Math.max(idx - 1, 0))
    }
    touchStartX.current = null
    touchStartY.current = null
    touchDeltaX.current = 0
    touchIsHorizontal.current = false
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentIndex(idx => Math.min(idx + 1, maxIndex))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentIndex(idx => Math.max(idx - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maxIndex])

  if (loading || !snapshot) {
    return <div className="p-8 text-slate-400">Loading magnet board for {date}…</div>
  }

  const findings = reclassified.filter(e => e.status === 'over' || e.status === 'under')
    .sort((a, b) => Math.abs((b.variance ?? 0)) - Math.abs((a.variance ?? 0)))
    .slice(0, 12)

  const flaggedCount = findings.length
  const noDataCount = reclassified.filter(e => e.status === 'no-data').length

  return (
    <div className="board-surface -m-4 lg:-m-6 p-4 lg:p-6 min-h-[calc(100vh-3.5rem)] text-[color:var(--ink)]">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center font-bold text-white text-sm">SNC</div>
          <div>
            <div className="font-hand text-2xl leading-none text-slate-900">Dispatch Board</div>
            <div className="text-xs text-slate-600">Equipment · Reconciliation</div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button className="rounded-lg border border-slate-400 px-2 py-1 text-sm text-slate-700 bg-white hover:bg-slate-50" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-white border border-slate-400 rounded-lg px-3 py-1.5 text-sm text-slate-900"
          />
          <button className="rounded-lg border border-slate-400 px-2 py-1 text-sm text-slate-700 bg-white hover:bg-slate-50" onClick={() => setDate(shiftDate(date, 1))}>›</button>
          {availableDates.length > 1 && (
            <select value={date} onChange={e => setDate(e.target.value)} className="bg-white border border-slate-400 rounded-lg px-2 py-1 text-xs text-slate-700">
              {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 ml-2">
          <Chip active={jobFilter === 'all'} onClick={() => setJobFilter('all')}>All · {snapshot.jobs.length}</Chip>
          {snapshot.jobs.slice(0, 5).map(j => (
            <Chip key={j.id} active={jobFilter === j.id} onClick={() => setJobFilter(j.id)}>{j.job_code}</Chip>
          ))}
          <select
            value={jobFilter}
            onChange={e => setJobFilter(e.target.value)}
            className="bg-white border border-slate-400 rounded-lg px-2 py-1 text-xs text-slate-700 max-w-[260px]"
          >
            <option value="all">All Jobs</option>
            {snapshot.jobs.map(j => (
              <option key={j.id} value={j.id}>{j.job_code} — {j.job_name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <Chip active={roleFilter === 'all'}       onClick={() => setRoleFilter('all')}>All</Chip>
          <Chip active={roleFilter === 'foreman'}   onClick={() => setRoleFilter('foreman')}>Foreman</Chip>
          <Chip active={roleFilter === 'equipment'} onClick={() => setRoleFilter('equipment')}>Equipment</Chip>
        </div>

        <div className="flex items-center gap-1">
          <Chip tone="flag" active={statusFilter === 'flagged'}  onClick={() => setStatusFilter(statusFilter === 'flagged' ? 'all' : 'flagged')}>Flagged · {flaggedCount}</Chip>
          <Chip tone="grey" active={statusFilter === 'no-data'} onClick={() => setStatusFilter(statusFilter === 'no-data' ? 'all' : 'no-data')}>No data · {noDataCount}</Chip>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAiOpen(a => !a)} className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-semibold">⚘ AI Summary</button>
          <button onClick={() => setTweaksOpen(t => !t)} className="rounded-lg bg-white border border-slate-400 text-slate-700 px-3 py-1.5 text-xs">Tweaks</button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            {flaggedCount} alerts
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* ── Board columns ────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div
            ref={viewportRef}
            className="overflow-hidden relative select-none"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div
              className="flex"
              style={{
                transform: `translateX(-${clampedIndex * colWidth}px)`,
                transition: `transform ${SLIDE_MS}ms ease-out`,
                willChange: 'transform',
              }}
            >
              {startIndex > 0 && (
                <div style={{ width: `${startIndex * colWidth}px`, flexShrink: 0 }} aria-hidden />
              )}
              {virtualJobs.map(job => (
                <JobColumn
                  key={job.id}
                  job={job}
                  width={colWidth}
                  foremen={snapshot.foremen.filter(f => f.job_id === job.id)}
                  equipment={reclassified.filter(e => e.job_id === job.id)}
                  selected={selected}
                  onSelect={setSelected}
                  roleFilter={roleFilter}
                  statusFilter={statusFilter}
                  hideOk={hideOk}
                />
              ))}
              {visibleJobs.length === 0 && (
                <div className="p-12 text-slate-500">No jobs match the current filters.</div>
              )}
            </div>
          </div>

          {showSlider && (
            <div className="mt-4 flex items-center gap-3 px-1">
              <button
                onClick={() => setCurrentIndex(idx => Math.max(idx - 1, 0))}
                disabled={clampedIndex === 0}
                aria-label="Previous columns"
                className="rounded-lg border border-slate-400 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >‹</button>
              <input
                type="range"
                min={0}
                max={maxIndex}
                value={clampedIndex}
                onChange={e => setCurrentIndex(parseInt(e.target.value, 10))}
                aria-label="Slide between job columns"
                className="flex-1 accent-orange-500"
              />
              <span className="font-mono text-xs text-slate-700 whitespace-nowrap tabular-nums">
                {clampedIndex + 1} / {visibleJobs.length}
              </span>
              <button
                onClick={() => setCurrentIndex(idx => Math.min(idx + 1, maxIndex))}
                disabled={clampedIndex >= maxIndex}
                aria-label="Next columns"
                className="rounded-lg border border-slate-400 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >›</button>
            </div>
          )}
        </div>

        {/* ── Side detail panel ────────────────────────────────── */}
        <aside className="hidden xl:flex w-[380px] flex-shrink-0 flex-col bg-white rounded-xl border border-slate-300 shadow-sm sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
          <SidePanel equipment={selected} reportDate={date} onClose={() => setSelected(null)} chartMode={chartMode} onChartModeChange={setChartMode} />
        </aside>

        {selected && (
          <div className="xl:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setSelected(null)}>
            <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-white overflow-y-auto" onClick={e => e.stopPropagation()}>
              <SidePanel equipment={selected} reportDate={date} onClose={() => setSelected(null)} chartMode={chartMode} onChartModeChange={setChartMode} />
            </div>
          </div>
        )}
      </div>

      {/* ── AI Summary panel ─────────────────────────────────── */}
      {aiOpen && (
        <div className="fixed bottom-4 right-4 w-[360px] max-w-[92vw] bg-[#FFFBEB] border border-amber-300/70 rounded-xl shadow-lg p-4 z-40">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-slate-900 text-sm">⚘ AI Reconciliation Summary</div>
            <button onClick={() => setAiOpen(false)} className="text-slate-500 hover:text-slate-900 text-lg leading-none">×</button>
          </div>
          <p className="text-sm text-slate-700">
            <b>{flaggedCount}</b> pieces of equipment showing significant variance today.{' '}
            <b>{noDataCount}</b> have no telematics data.
          </p>
          <ul className="mt-3 space-y-2 max-h-60 overflow-y-auto">
            {findings.map(e => (
              <li key={e.id}>
                <button
                  onClick={() => setSelected(e)}
                  className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-amber-100/60"
                >
                  <span className="inline-block rounded bg-slate-900 text-white font-mono text-[10px] px-1.5 py-0.5 mt-0.5">{e.equipment_code}</span>
                  <span className="text-xs text-slate-700">{findingSentence(e)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-[10px] text-slate-500">Generated now · local classifier · tolerance ±{tolerance.toFixed(1)}h</div>
        </div>
      )}

      {/* ── Tweaks panel ─────────────────────────────────────── */}
      {tweaksOpen && (
        <div className="fixed bottom-4 left-4 w-[300px] bg-white border border-slate-300 rounded-xl shadow-lg p-4 z-40">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-900 text-sm">Tweaks</div>
            <button onClick={() => setTweaksOpen(false)} className="text-slate-500 hover:text-slate-900 text-lg leading-none">×</button>
          </div>
          <label className="block text-xs text-slate-600 mb-1">Variance tolerance: <span className="font-mono text-slate-900">±{tolerance.toFixed(1)}h</span></label>
          <input type="range" min={0} max={2} step={0.1} value={tolerance} onChange={e => setTolerance(parseFloat(e.target.value))} className="w-full accent-orange-500" />
          <label className="flex items-center gap-2 mt-3 text-xs text-slate-700">
            <input type="checkbox" checked={hideOk} onChange={e => setHideOk(e.target.checked)} />
            Hide OK cells
          </label>
          <label className="flex items-center gap-2 mt-2 text-xs text-slate-700">
            <input type="checkbox" checked={aiOpen} onChange={e => setAiOpen(e.target.checked)} />
            Show AI Summary panel
          </label>
        </div>
      )}
    </div>
  )
}

function shiftDate(d: string, days: number): string {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().slice(0, 10)
}

function findingSentence(e: ReconciliationResult): string {
  if (e.status === 'no-data') return `No telematics readings found for today.`
  const billed = e.billed_hours ?? 0
  const actual = e.actual_hours ?? 0
  const variance = e.variance ?? billed - actual
  const dir = variance > 0 ? 'over-reported' : 'under-reported'
  return `Billed ${billed.toFixed(1)}h but ran ${actual.toFixed(1)}h — ${dir} by ${Math.abs(variance).toFixed(1)}h.`
}

function Chip({ children, active, tone, onClick }: { children: React.ReactNode; active?: boolean; tone?: 'flag' | 'grey'; onClick?: () => void }) {
  const toneClasses = tone === 'flag'
    ? (active ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-700 border-red-300')
    : tone === 'grey'
      ? (active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300')
      : (active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300')
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClasses} hover:brightness-95 cursor-pointer`}>
      {children}
    </button>
  )
}

// ── Job column ────────────────────────────────────────────────
function JobColumn({
  job, width, foremen, equipment, selected, onSelect, roleFilter, statusFilter, hideOk,
}: {
  job: DispatchJob
  width: number
  foremen: DispatchForeman[]
  equipment: ReconciliationResult[]
  selected: ReconciliationResult | null
  onSelect: (e: ReconciliationResult) => void
  roleFilter: RoleFilter
  statusFilter: StatusFilter
  hideOk: boolean
}) {
  const filteredEquip = equipment.filter(e => {
    if (statusFilter === 'flagged' && !(e.status === 'over' || e.status === 'under')) return false
    if (statusFilter === 'no-data' && e.status !== 'no-data') return false
    if (hideOk && e.status === 'ok') return false
    return true
  })

  const showForemen = roleFilter === 'all' || roleFilter === 'foreman'
  const showEquipment = roleFilter === 'all' || roleFilter === 'equipment'

  const equipByForeman = new Map<string, ReconciliationResult[]>()
  for (const e of filteredEquip) {
    const key = e.foreman_id ?? 'none'
    if (!equipByForeman.has(key)) equipByForeman.set(key, [])
    equipByForeman.get(key)!.push(e)
  }

  const foremenInView = foremen.filter(f => showForemen || equipByForeman.has(f.id))

  return (
    <div
      className="flex-shrink-0 border-r-2 border-slate-300 px-3 pb-6"
      style={{ width: `${width}px` }}
    >
      <header className="pt-1 pb-2">
        <div className="font-hand text-2xl leading-tight text-slate-900">{job.job_name}</div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="font-mono text-xs text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-0.5">{job.job_code}</span>
          {job.heavyjob_uuid && <span className="font-mono text-[10px] text-slate-500">hj {job.heavyjob_uuid.slice(0, 8)}</span>}
        </div>
      </header>

      <hr className="border-t border-dashed border-slate-400 my-2" />

      {showForemen && foremenInView.length > 0 && (
        <section className="mb-3">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Foreman · {foremenInView.length}</h3>
          <div className="space-y-1.5">
            {foremenInView.map(f => <ForemanMagnet key={f.id} foreman={f} />)}
          </div>
        </section>
      )}

      {showEquipment && filteredEquip.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Equipment · {filteredEquip.length}</h3>
          <div className="space-y-2">
            {filteredEquip.map(e => (
              <EquipmentMagnet
                key={e.id}
                e={e}
                selected={selected?.id === e.id}
                onClick={() => onSelect(e)}
              />
            ))}
          </div>
        </section>
      )}

      {filteredEquip.length === 0 && showEquipment && (
        <div className="text-[11px] text-slate-500 italic px-1 py-3">No equipment matches.</div>
      )}
    </div>
  )
}

// ── Magnet cards ──────────────────────────────────────────────
function ForemanMagnet({ foreman }: { foreman: DispatchForeman }) {
  const [last, first] = splitName(foreman.foreman_name)
  return (
    <div className="rounded-md overflow-hidden border border-red-900/20 bg-white shadow-sm">
      <div className="bg-[color:var(--role-foreman)] text-white text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5 flex items-center justify-between">
        <span>Foreman</span>
        <span className="font-mono opacity-90">{foreman.foreman_code}</span>
      </div>
      <div className="px-2 py-1.5">
        <div className="font-mono text-sm text-slate-900 leading-tight uppercase truncate">{last}</div>
        <div className="text-[11px] text-slate-600 leading-tight truncate">{first}</div>
      </div>
    </div>
  )
}

function splitName(full: string): [string, string] {
  const [last = '', first = ''] = full.split(',').map(s => s.trim())
  return [last, first]
}

function EquipmentMagnet({ e, selected, onClick }: { e: ReconciliationResult; selected: boolean; onClick: () => void }) {
  const isFlagged = e.status === 'over' || e.status === 'under'
  const isNoData = e.status === 'no-data'
  const isSkipped = e.status === 'skipped'
  const isBnd = e.status === 'billed-not-dispatched'

  const borderClass = isFlagged ? 'flag-pulse border-[color:var(--flag)]' : 'border-slate-300'
  const ringClass = selected ? 'outline outline-2 outline-offset-2 outline-[color:var(--role-equipment)]' : ''
  const opacity = isSkipped ? 'opacity-70' : ''
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md overflow-hidden border bg-white shadow-sm hover:-translate-y-[1px] hover:shadow transition-all cursor-pointer ${borderClass} ${ringClass} ${opacity}`}
    >
      <div className="bg-[color:var(--role-equipment)] text-white text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5 flex items-center justify-between">
        <span>{e.kind || 'MISC'}</span>
        <span className="font-mono opacity-90">{e.provider || 'NO TLMTRY'}</span>
      </div>
      <div className="px-2 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-slate-900">{e.equipment_code}</span>
          {isBnd && <span className="text-[9px] font-semibold text-amber-700 uppercase">∉ dispatch</span>}
          {isSkipped && <span className="text-[9px] font-semibold text-slate-500 uppercase">no jdlink</span>}
        </div>
        <div className="text-[11px] text-slate-600 leading-tight truncate">{e.description}</div>

        <div className="mt-1.5 grid grid-cols-3 border-t border-slate-200">
          <MetricCell label="Sched"  value={e.sched_hours} />
          <MetricCell label="Billed" value={e.billed_hours} />
          <MetricCell label="Ran"    value={e.actual_hours} striped={isNoData} flagged={isFlagged} />
        </div>

        {isFlagged && e.variance != null && (
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider text-slate-500">Variance</span>
            <span className="font-mono font-semibold text-[color:var(--flag)]">
              {e.variance > 0 ? '+' : ''}{e.variance.toFixed(2)}h
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

function MetricCell({ label, value, striped, flagged }: { label: string; value: number | null | undefined; striped?: boolean; flagged?: boolean }) {
  return (
    <div className={`px-1.5 py-1 text-center ${striped ? 'stripes-nodata' : ''} ${flagged ? 'bg-red-50' : ''}`}>
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-mono text-sm font-semibold ${flagged ? 'text-[color:var(--flag)]' : 'text-slate-900'}`}>
        {value == null ? '—' : value.toFixed(1)}
      </div>
    </div>
  )
}

// ── Side panel ────────────────────────────────────────────────
function SidePanel({ equipment, reportDate, onClose, chartMode, onChartModeChange }: { equipment: ReconciliationResult | null; reportDate: string; onClose: () => void; chartMode: ChartMode; onChartModeChange: (m: ChartMode) => void }) {
  const [telematics, setTelematics] = useState<TelematicsPoint[]>([])
  const [telLoading, setTelLoading] = useState(false)

  useEffect(() => {
    if (!equipment) {
      setTelematics([])
      return
    }
    let alive = true
    setTelLoading(true)
    fetchTelematicsForDate(equipment.equipment_code, reportDate).then(points => {
      if (!alive) return
      setTelematics(points)
      setTelLoading(false)
    })
    return () => { alive = false }
  }, [equipment?.equipment_code, reportDate])

  if (!equipment) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="text-4xl mb-3 opacity-40">◉</div>
        <div className="text-sm font-semibold text-slate-700">No cell selected</div>
        <div className="text-xs text-slate-500 mt-1">Click any equipment magnet to see detail and the 24-hour hour-meter trace.</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-start gap-3 p-4 border-b border-slate-200">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">{equipment.kind} · {equipment.provider}</div>
          <div className="font-mono text-xl font-bold text-slate-900">{equipment.equipment_code}</div>
          <div className="text-xs text-slate-600 truncate">{equipment.description}</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-xl leading-none">×</button>
      </header>

      <section className="p-4 space-y-3 overflow-x-hidden">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Today · Reconciliation</div>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Scheduled" value={equipment.sched_hours} />
          <Tile label="Billed"    value={equipment.billed_hours} />
          <Tile label="Ran"       value={equipment.actual_hours}
                flagged={equipment.status === 'over' || equipment.status === 'under'}
                striped={equipment.status === 'no-data'} />
        </div>
        <VarianceRow e={equipment} />

        <div className="pt-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Source</div>
          <KeyVal k="Telematics"  v={equipment.provider ?? '—'} />
          <KeyVal k="Equipment"   v={equipment.equipment_code} />
          <KeyVal k="Kind"        v={equipment.kind ?? '—'} />
          <KeyVal k="Readings"    v={equipment.reading_count != null ? `${equipment.reading_count} JDLink` : '—'} />
          <KeyVal k="Notes"       v={equipment.notes ?? '—'} />
        </div>

        <div className="pt-2">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">
              {chartMode === 'line' ? '24-Hour Hour Meter' : 'Hours Run Per Hour'} · {reportDate} (PDT)
            </div>
            {telematics.length > 0 && (
              <div className="text-[10px] text-slate-500">{telematics.length} reading{telematics.length === 1 ? '' : 's'}</div>
            )}
          </div>
          <DayChart points={telematics} loading={telLoading} mode={chartMode} onModeChange={onChartModeChange} />
          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 select-none">
            <button
              type="button"
              onClick={() => onChartModeChange('line')}
              aria-label="Line chart mode"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${chartMode === 'line' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <span aria-hidden>∿</span>
              <span>Line</span>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => onChartModeChange('bar')}
              aria-label="Bar histogram mode"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${chartMode === 'bar' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <span aria-hidden>▮</span>
              <span>Bars</span>
            </button>
            <span className="ml-1 text-slate-400 hidden sm:inline">· swipe to switch</span>
          </div>
        </div>

        <div className="pt-2 flex gap-2">
          <button className="flex-1 rounded-lg bg-slate-900 text-white text-xs font-semibold py-2 hover:bg-slate-800">Flag for Review</button>
          <button className="rounded-lg border border-slate-300 text-slate-700 text-xs py-2 px-3 hover:bg-slate-50">HCSS ↗</button>
        </div>
      </section>
    </div>
  )
}

function Tile({ label, value, flagged, striped }: { label: string; value: number | null | undefined; flagged?: boolean; striped?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-200 p-2 text-center ${flagged ? 'bg-red-50 border-red-200' : ''} ${striped ? 'stripes-nodata' : ''}`}>
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-mono text-lg font-bold ${flagged ? 'text-[color:var(--flag)]' : 'text-slate-900'}`}>
        {value == null ? '—' : value.toFixed(2)}
      </div>
    </div>
  )
}

function VarianceRow({ e }: { e: ReconciliationResult }) {
  if (e.variance == null) return null
  const tone =
    e.status === 'over' || e.status === 'under' ? 'text-[color:var(--flag)]' :
    e.status === 'ok' ? 'text-[color:var(--ok)]' : 'text-slate-500'
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-md bg-slate-50 text-xs ${tone}`}>
      <span className="uppercase tracking-wider">Variance (billed − ran)</span>
      <span className="font-mono font-bold">{e.variance > 0 ? '+' : ''}{e.variance.toFixed(2)}h</span>
    </div>
  )
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-xs">
      <span className="text-slate-500">{k}</span>
      <span className="font-mono text-slate-800 truncate max-w-[200px]">{v}</span>
    </div>
  )
}

// 24-hour chart of TelematicsSnapshot.hourMeterReadingInHours, x-axis in PDT.
// Renders either a line chart (cumulative hour meter) or a bar histogram
// (per-hour delta). Swipe left/right toggles between modes.
function DayChart({ points, loading, mode, onModeChange }: { points: TelematicsPoint[]; loading: boolean; mode: ChartMode; onModeChange: (m: ChartMode) => void }) {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchDeltaX = useRef(0)
  const touchIsHorizontal = useRef(false)

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
    touchDeltaX.current = 0
    touchIsHorizontal.current = false
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartX.current
    const dy = t.clientY - touchStartY.current
    touchDeltaX.current = dx
    if (!touchIsHorizontal.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchIsHorizontal.current = true
    }
  }
  function handleTouchEnd() {
    const dx = touchDeltaX.current
    if (touchIsHorizontal.current && Math.abs(dx) > SWIPE_THRESHOLD) {
      onModeChange(mode === 'line' ? 'bar' : 'line')
    }
    touchStartX.current = null
    touchStartY.current = null
    touchDeltaX.current = 0
    touchIsHorizontal.current = false
  }

  const wrapperProps = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    style: { touchAction: 'none' as const },
    className: 'transition-opacity duration-200 select-none',
  }

  if (loading) {
    return <div {...wrapperProps}><div className="h-32 rounded border border-slate-200 bg-slate-50 animate-pulse" /></div>
  }

  const valued = points.filter((p): p is TelematicsPoint & { hourMeter: number } => p.hourMeter != null)
  if (valued.length === 0) {
    return (
      <div {...wrapperProps}>
        <div className="h-32 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center px-3 text-center">
          <span className="text-xs text-slate-500">No telematics data for this equipment on this date</span>
        </div>
      </div>
    )
  }

  return (
    <div {...wrapperProps} key={mode}>
      {mode === 'line' ? <LineChartSvg valued={valued} /> : <BarHistogramSvg valued={valued} />}
    </div>
  )
}

function LineChartSvg({ valued }: { valued: (TelematicsPoint & { hourMeter: number })[] }) {
  const W = 320, H = 130, PL = 36, PR = 10, PT = 8, PB = 22
  const xs = valued.map(p => utcToPdtHourFloat(p.snapshotAt))
  const ys = valued.map(p => p.hourMeter)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yRange = Math.max(yMax - yMin, 0.1)
  const x = (h: number) => PL + (h / 24) * (W - PL - PR)
  const y = (v: number) => PT + (1 - (v - yMin) / yRange) * (H - PT - PB)

  const path = valued.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(xs[i]).toFixed(1)},${y(p.hourMeter).toFixed(1)}`).join(' ')
  const gridHours = [0, 6, 12, 18, 24]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="24-hour hour meter trace">
      <rect x="0" y="0" width={W} height={H} fill="white" />
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PL} x2={W - PR} y1={PT + f * (H - PT - PB)} y2={PT + f * (H - PT - PB)} stroke="#E2E8F0" strokeWidth="1" />
      ))}
      {gridHours.map(h => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={PT} y2={H - PB} stroke="#F1F5F9" strokeWidth="1" />
          <text x={x(h)} y={H - PB + 12} fontSize="9" fill="#64748B" textAnchor="middle">{String(h).padStart(2, '0')}</text>
        </g>
      ))}
      <text x={PL - 4} y={y(yMax)} fontSize="9" fill="#64748B" textAnchor="end" dominantBaseline="middle">{yMax.toFixed(1)}</text>
      <text x={PL - 4} y={y(yMin)} fontSize="9" fill="#64748B" textAnchor="end" dominantBaseline="middle">{yMin.toFixed(1)}</text>
      <path d={path} stroke="#DD6B20" strokeWidth="2" fill="none" />
      {valued.map((p, i) => (
        <circle key={i} cx={x(xs[i])} cy={y(p.hourMeter)} r="2" fill="#DD6B20">
          <title>{`${formatPdtClock(p.snapshotAt)} · ${p.hourMeter.toFixed(2)}h`}</title>
        </circle>
      ))}
    </svg>
  )
}

function BarHistogramSvg({ valued }: { valued: (TelematicsPoint & { hourMeter: number })[] }) {
  const W = 320, H = 130, PL = 36, PR = 10, PT = 8, PB = 22

  // Bucket the last reading observed within each PDT hour 0..23.
  const readingByHour: (number | null)[] = Array(24).fill(null)
  for (const p of valued) {
    const h = Math.floor(utcToPdtHourFloat(p.snapshotAt))
    if (h >= 0 && h < 24) readingByHour[h] = p.hourMeter
  }

  // Per-hour deltas using carry-forward of the previous known reading.
  // Negative deltas (meter rollovers / corrections) are clamped to 0.
  const deltas: number[] = Array(24).fill(0)
  let prev: number | null = null
  for (let h = 0; h < 24; h++) {
    const cur = readingByHour[h]
    if (cur != null && prev != null) deltas[h] = Math.max(0, cur - prev)
    if (cur != null) prev = cur
  }

  const yMax = Math.max(...deltas, 0.5)
  const x = (h: number) => PL + (h / 24) * (W - PL - PR)
  const y = (v: number) => PT + (1 - v / yMax) * (H - PT - PB)
  const barWidth = ((W - PL - PR) / 24) * 0.78
  const gridHours = [0, 6, 12, 18, 24]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="Hours run per hour histogram">
      <rect x="0" y="0" width={W} height={H} fill="white" />
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PL} x2={W - PR} y1={PT + f * (H - PT - PB)} y2={PT + f * (H - PT - PB)} stroke="#E2E8F0" strokeWidth="1" />
      ))}
      {gridHours.map(h => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={PT} y2={H - PB} stroke="#F1F5F9" strokeWidth="1" />
          <text x={x(h)} y={H - PB + 12} fontSize="9" fill="#64748B" textAnchor="middle">{String(h).padStart(2, '0')}</text>
        </g>
      ))}
      <text x={PL - 4} y={y(yMax)} fontSize="9" fill="#64748B" textAnchor="end" dominantBaseline="middle">{yMax.toFixed(1)}</text>
      <text x={PL - 4} y={y(0)} fontSize="9" fill="#64748B" textAnchor="end" dominantBaseline="middle">0.0</text>
      {deltas.map((d, h) => {
        const cx = x(h + 0.5)
        const yTop = y(d)
        const yBot = y(0)
        return (
          <rect
            key={h}
            x={cx - barWidth / 2}
            y={yTop}
            width={barWidth}
            height={Math.max(0, yBot - yTop)}
            fill={d > 0 ? '#DD6B20' : '#E2E8F0'}
            rx="1"
          >
            <title>{`${String(h).padStart(2, '0')}:00 PDT · ${d.toFixed(2)}h run`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function utcToPdtHourFloat(snapshotAt: string): number {
  // PDT = UTC-7. Subtract 7h then read hour-of-day.
  const utcMs = new Date(snapshotAt).getTime()
  const pdt = new Date(utcMs - 7 * 3600 * 1000)
  return pdt.getUTCHours() + pdt.getUTCMinutes() / 60 + pdt.getUTCSeconds() / 3600
}

function formatPdtClock(snapshotAt: string): string {
  const utcMs = new Date(snapshotAt).getTime()
  const pdt = new Date(utcMs - 7 * 3600 * 1000)
  const hh = String(pdt.getUTCHours()).padStart(2, '0')
  const mm = String(pdt.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} PDT`
}
