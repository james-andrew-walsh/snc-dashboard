import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MetricCard } from '../components/MetricCard'
import { MapboxMap } from '../components/MapboxMap'
import type { TelematicsSnapshot, SiteLocation, SiteLocationJob, Job } from '../lib/types'

interface ActivityItem {
  id: string
  table: string
  action: string
  description: string
  timestamp: Date
}

export function Overview() {
  const [equipmentCount, setEquipmentCount] = useState(0)
  const [jobCount, setJobCount] = useState(0)
  const [dispatchCount, setDispatchCount] = useState(0)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  // Telematics data for map
  const [telematicsPoints, setTelematicsPoints] = useState<TelematicsSnapshot[]>([])

  // Geofence / Location state
  const [siteLocations, setSiteLocations] = useState<SiteLocation[]>([])
  const [siteLocationJobs, setSiteLocationJobs] = useState<SiteLocationJob[]>([])
  const [locationsExpanded, setLocationsExpanded] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [drawnPolygon, setDrawnPolygon] = useState<GeoJSON.Polygon | null>(null)

  // New location form
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [selectedJobs, setSelectedJobs] = useState<Job[]>([])
  const [saving, setSaving] = useState(false)

  // Job search
  const [jobSearch, setJobSearch] = useState('')
  const [jobResults, setJobResults] = useState<Job[]>([])
  const [jobSearchLoading, setJobSearchLoading] = useState(false)
  const jobSearchTimeout = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    async function fetchData() {
      const [eqRes, jobRes, dispRes, telRes, eqDetailRes, siteLocRes, siteLocJobRes] = await Promise.all([
        supabase.from('Equipment').select('id', { count: 'exact', head: true }),
        supabase.from('Job').select('id', { count: 'exact', head: true }),
        supabase.from('DispatchEvent').select('id', { count: 'exact', head: true }),
        supabase
          .from('TelematicsSnapshot')
          .select('equipmentCode, latitude, longitude, locationDateTime, isLocationStale, engineStatus, snapshotAt')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('snapshotAt', { ascending: false })
          .limit(5000),
        supabase.from('Equipment').select('code, make, model, description'),
        supabase.from('SiteLocation').select('*').order('createdAt', { ascending: false }),
        supabase.from('SiteLocationJob').select('*'),
      ])

      setEquipmentCount(eqRes.count ?? 0)
      setJobCount(jobRes.count ?? 0)
      setDispatchCount(dispRes.count ?? 0)

      // Build make/model lookup by equipment code
      const eqLookup = new Map<string, { make: string; model: string; description: string }>()
      for (const eq of (eqDetailRes.data ?? []) as { code: string; make: string; model: string; description: string }[]) {
        eqLookup.set(eq.code, { make: eq.make ?? '', model: eq.model ?? '', description: eq.description ?? '' })
      }

      // Deduplicate: keep latest snapshot per equipmentCode, attach make/model
      const seen = new Set<string>()
      const latest: TelematicsSnapshot[] = []
      for (const row of (telRes.data ?? []) as TelematicsSnapshot[]) {
        if (!seen.has(row.equipmentCode)) {
          seen.add(row.equipmentCode)
          const eq = eqLookup.get(row.equipmentCode)
          latest.push({
            ...row,
            make: eq?.make ?? '',
            model: eq?.model ?? '',
            equipmentDescription: eq?.description ?? '',
          } as TelematicsSnapshot)
        }
      }
      setTelematicsPoints(latest)
      setSiteLocations((siteLocRes.data ?? []) as SiteLocation[])
      setSiteLocationJobs((siteLocJobRes.data ?? []) as SiteLocationJob[])

      setLoading(false)
    }
    fetchData()
  }, [])

  // Realtime activity feed
  useEffect(() => {
    const tables = ['Equipment', 'Job', 'DispatchEvent', 'Employee', 'Location'] as const
    const channels = tables.map(table =>
      supabase
        .channel(`overview-${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            const newItem: ActivityItem = {
              id: crypto.randomUUID(),
              table,
              action: payload.eventType,
              description: describeChange(table, payload.eventType, payload.new as Record<string, unknown>),
              timestamp: new Date(),
            }
            setActivity(prev => [newItem, ...prev].slice(0, 20))

            if (table === 'Equipment') {
              if (payload.eventType === 'INSERT') setEquipmentCount(c => c + 1)
              if (payload.eventType === 'DELETE') setEquipmentCount(c => c - 1)
            }
            if (table === 'Job') {
              if (payload.eventType === 'INSERT') setJobCount(c => c + 1)
              if (payload.eventType === 'DELETE') setJobCount(c => c - 1)
            }
            if (table === 'DispatchEvent') {
              if (payload.eventType === 'INSERT') setDispatchCount(c => c + 1)
              if (payload.eventType === 'DELETE') setDispatchCount(c => c - 1)
            }
          }
        )
        .subscribe()
    )

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [])

  // Job typeahead search
  useEffect(() => {
    if (jobSearchTimeout.current) clearTimeout(jobSearchTimeout.current)
    if (!jobSearch.trim()) {
      setJobResults([])
      return
    }
    setJobSearchLoading(true)
    jobSearchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('Job')
        .select('*')
        .or(`code.ilike.%${jobSearch}%,description.ilike.%${jobSearch}%`)
        .limit(10)
      setJobResults((data ?? []) as Job[])
      setJobSearchLoading(false)
    }, 250)
  }, [jobSearch])

  const handleDrawComplete = useCallback((polygon: GeoJSON.Polygon) => {
    setDrawnPolygon(polygon)
    setDrawMode(false)
  }, [])

  const handleDrawCancel = useCallback(() => {
    // noop — polygon cleared when draw mode toggled off
  }, [])

  const handleSave = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      // Compute center from polygon
      let centerLat: number | null = null
      let centerLng: number | null = null
      if (drawnPolygon) {
        const coords = drawnPolygon.coordinates[0]
        const lats = coords.map(c => c[1])
        const lngs = coords.map(c => c[0])
        centerLat = lats.reduce((a, b) => a + b, 0) / lats.length
        centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length
      }

      const { data: loc, error: locErr } = await supabase
        .from('SiteLocation')
        .insert({
          name: newName.trim(),
          description: newDescription.trim() || null,
          polygon: drawnPolygon,
          centerLat,
          centerLng,
        })
        .select()
        .single()

      if (locErr) throw locErr

      const newLoc = loc as SiteLocation

      // Insert SiteLocationJob records
      if (selectedJobs.length > 0) {
        const jobRows = selectedJobs.map(j => ({
          siteLocationId: newLoc.id,
          jobHcssId: j.id,
          jobCode: j.code,
          jobDescription: j.description,
        }))
        const { data: jobData, error: jobErr } = await supabase
          .from('SiteLocationJob')
          .insert(jobRows)
          .select()
        if (jobErr) throw jobErr
        setSiteLocationJobs(prev => [...prev, ...((jobData ?? []) as SiteLocationJob[])])
      }

      setSiteLocations(prev => [newLoc, ...prev])
      resetForm()
    } catch (err) {
      console.error('Failed to save location:', err)
      alert('Failed to save location. Check console for details.')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setShowNewForm(false)
    setDrawMode(false)
    setDrawnPolygon(null)
    setNewName('')
    setNewDescription('')
    setSelectedJobs([])
    setJobSearch('')
    setJobResults([])
  }

  const addJob = (job: Job) => {
    if (selectedJobs.some(j => j.code === job.code)) return
    setSelectedJobs(prev => [...prev, job])
    setJobSearch('')
    setJobResults([])
  }

  const removeJob = (code: string) => {
    setSelectedJobs(prev => prev.filter(j => j.code !== code))
  }

  const jobCountForLocation = (locId: string) =>
    siteLocationJobs.filter(j => j.siteLocationId === locId).length

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-100">Overview</h2>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Equipment"
          value={loading ? '—' : equipmentCount}
          color="orange"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" clipRule="evenodd" />
            </svg>
          }
        />
        <MetricCard
          label="Active Jobs"
          value={loading ? '—' : jobCount}
          color="blue"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
          }
        />
        <MetricCard
          label="Dispatch Events"
          value={loading ? '—' : dispatchCount}
          color="green"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* Map + Locations Panel */}
      <div className="flex gap-4">
        {/* Map */}
        <div className="flex-1 h-[500px] rounded-lg overflow-hidden relative">
          <MapboxMap
            points={telematicsPoints}
            geofences={siteLocations}
            drawMode={drawMode}
            onDrawComplete={handleDrawComplete}
            onDrawCancel={handleDrawCancel}
          />
          {drawMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-orange-400 text-sm px-4 py-2 rounded-lg border border-orange-500/40 z-10">
              Click points to draw polygon. Double-click or click first point to close.
            </div>
          )}
        </div>

        {/* Locations Panel */}
        <div className={`bg-slate-800 rounded-lg border border-slate-700 transition-all ${locationsExpanded ? 'w-80' : 'w-10'} flex-shrink-0`}>
          <button
            onClick={() => setLocationsExpanded(!locationsExpanded)}
            className="w-full px-3 py-3 flex items-center gap-2 text-sm font-semibold text-slate-200 hover:bg-slate-700/50"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${locationsExpanded ? 'rotate-90' : ''}`}>
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            {locationsExpanded && 'Locations'}
          </button>

          {locationsExpanded && (
            <div className="px-3 pb-3 space-y-3 max-h-[440px] overflow-y-auto">
              {/* New Location button */}
              {!showNewForm && (
                <button
                  onClick={() => setShowNewForm(true)}
                  className="w-full text-sm bg-orange-600 hover:bg-orange-500 text-white rounded px-3 py-1.5 font-medium"
                >
                  + New Location
                </button>
              )}

              {/* New Location form */}
              {showNewForm && (
                <div className="bg-slate-700/50 rounded-lg p-3 space-y-3 border border-slate-600">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="e.g. West 4th Street Corridor"
                      className="w-full bg-slate-800 text-sm text-slate-200 rounded px-2.5 py-1.5 border border-slate-600 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      placeholder="Optional description"
                      className="w-full bg-slate-800 text-sm text-slate-200 rounded px-2.5 py-1.5 border border-slate-600 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  {/* Job search */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Job Codes</label>
                    {selectedJobs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedJobs.map(j => (
                          <span key={j.code} className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-300 text-xs px-2 py-0.5 rounded">
                            {j.code}
                            <button onClick={() => removeJob(j.code)} className="hover:text-orange-100">&times;</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <input
                        type="text"
                        value={jobSearch}
                        onChange={e => setJobSearch(e.target.value)}
                        placeholder="Search jobs by code or description..."
                        className="w-full bg-slate-800 text-sm text-slate-200 rounded px-2.5 py-1.5 border border-slate-600 focus:border-orange-500 focus:outline-none"
                      />
                      {jobSearch.trim() && (
                        <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-40 overflow-y-auto">
                          {jobSearchLoading ? (
                            <div className="px-3 py-2 text-xs text-slate-500">Searching...</div>
                          ) : jobResults.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-slate-500">No jobs found</div>
                          ) : (
                            jobResults.map(j => (
                              <button
                                key={j.id}
                                onClick={() => addJob(j)}
                                className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center justify-between"
                              >
                                <span className="font-mono text-orange-400">{j.code}</span>
                                <span className="text-xs text-slate-400 truncate ml-2">{j.description}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Draw geofence button */}
                  <div>
                    {!drawnPolygon ? (
                      <button
                        onClick={() => setDrawMode(!drawMode)}
                        className={`w-full text-sm rounded px-3 py-1.5 font-medium ${
                          drawMode
                            ? 'bg-orange-500/30 text-orange-300 border border-orange-500'
                            : 'bg-slate-600 hover:bg-slate-500 text-slate-200'
                        }`}
                      >
                        {drawMode ? 'Drawing... (click map)' : 'Draw Geofence'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-green-400">Polygon drawn</span>
                        <button
                          onClick={() => { setDrawnPolygon(null); setDrawMode(true) }}
                          className="text-xs text-slate-400 hover:text-slate-200 underline"
                        >
                          Redraw
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving || !newName.trim()}
                      className="flex-1 text-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600 text-white rounded px-3 py-1.5 font-medium"
                    >
                      {saving ? 'Saving...' : 'Save Location'}
                    </button>
                    <button
                      onClick={resetForm}
                      className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Existing locations list */}
              {siteLocations.length === 0 && !showNewForm && (
                <p className="text-xs text-slate-500 text-center py-4">No locations yet</p>
              )}
              {siteLocations.map(loc => (
                <div key={loc.id} className="bg-slate-700/30 rounded px-3 py-2 border border-slate-700">
                  <div className="text-sm font-medium text-slate-200">{loc.name}</div>
                  {loc.description && (
                    <div className="text-xs text-slate-400 mt-0.5">{loc.description}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{jobCountForLocation(loc.id)} job{jobCountForLocation(loc.id) !== 1 ? 's' : ''}</span>
                    <span>{loc.polygon ? 'Geofenced' : 'No geofence'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="px-5 py-4 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-200">Recent Activity</h3>
        </div>
        <div className="divide-y divide-slate-700/50 max-h-96 overflow-y-auto">
          {activity.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Listening for realtime changes...
            </div>
          ) : (
            activity.map(item => (
              <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                <ActionBadge action={item.action} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200">{item.description}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    INSERT: 'bg-green-500/20 text-green-400',
    UPDATE: 'bg-blue-500/20 text-blue-400',
    DELETE: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${styles[action] ?? 'bg-slate-600 text-slate-300'}`}>
      {action}
    </span>
  )
}

function describeChange(table: string, event: string, record: Record<string, unknown>): string {
  const code = (record?.code as string) || (record?.employeeCode as string) || ''
  const id = (record?.id as string)?.slice(0, 8) || ''
  const label = code || id

  const actions: Record<string, string> = {
    INSERT: 'added to',
    UPDATE: 'updated in',
    DELETE: 'removed from',
  }
  return `${label ? label + ' ' : ''}${actions[event] ?? event} ${table}`
}
