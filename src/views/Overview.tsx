import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MetricCard } from '../components/MetricCard'
import { MapboxMap } from '../components/MapboxMap'
import type { TelematicsSnapshot, SiteLocation, SiteLocationJob, Job, SyncLog, Anomaly } from '../lib/types'

interface ActivityItem {
  id: string
  type: 'change' | 'sync'
  // Fields for change events
  table?: string
  action?: string
  description?: string
  // Fields for sync events
  providerKey?: string
  providerName?: string
  status?: string
  rowsInserted?: number | null
  durationMs?: number | null
  errorMessage?: string | null
  details?: Record<string, unknown> | null
  timestamp: Date
}

function formatSyncLogEntry(item: ActivityItem): string {
  if (item.status === 'error') {
    return `${item.providerName} failed — ${item.errorMessage ?? 'Unknown error'}`
  }

  if (item.providerKey === 'e360' && item.details) {
    const { total, fresh_gps, stale_gps } = item.details as { total: number; fresh_gps: number; stale_gps: number }
    return `E360 sync complete — ${total} machines (${fresh_gps} fresh GPS, ${stale_gps} stale)`
  }

  if (item.providerKey === 'reconciliation' && item.details) {
    const { anomaly_no_hj, disputed, not_in_either, new_anomalies, resolved } = item.details as { anomaly_no_hj: number; disputed: number; not_in_either: number; total_active: number; new_anomalies: number; resolved: number }
    const parts: string[] = []
    if (anomaly_no_hj > 0) parts.push(`${anomaly_no_hj} no HJ record`)
    if (disputed > 0) parts.push(`${disputed} disputed`)
    if (not_in_either > 0) parts.push(`${not_in_either} unregistered`)
    const summary = parts.length > 0 ? parts.join(' · ') : 'no anomalies'
    const changeNote = new_anomalies > 0 || resolved > 0
      ? ` (+${new_anomalies} new, ${resolved} resolved)`
      : ''
    return `Reconciliation — ${summary}${changeNote}`
  }

  // Fallback for unknown providers
  return `${item.providerName} complete — ${item.rowsInserted?.toLocaleString() ?? 0} records`
}

function polygonToWKT(polygon: GeoJSON.Polygon): string {
  const coords = polygon.coordinates[0]
    .map(([lng, lat]) => `${lng} ${lat}`)
    .join(', ')
  return `SRID=4326;POLYGON((${coords}))`
}

export function Overview() {
  const [equipmentCount, setEquipmentCount] = useState(0)
  const [trackedCount, setTrackedCount] = useState(0)
  const [jobCount, setJobCount] = useState(0)
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

  // Edit / Delete
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null)

  // New location form (also used for editing)
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
      const [eqRes, jobRes, telRes, anomalyRes, siteLocRes, siteLocJobRes, latestSnapRes, syncLogRes] = await Promise.all([
        supabase.from('Equipment').select('id', { count: 'exact', head: true }),
        supabase.from('Job').select('id', { count: 'exact', head: true }),
        supabase.rpc('get_latest_telematics'),
        supabase.from('Anomaly').select('*').is('resolvedAt', null),
        supabase.from('SiteLocation').select('*').order('createdAt', { ascending: false }),
        supabase.from('SiteLocationJob').select('*'),
        supabase.from('TelematicsSnapshot').select('snapshotAt').order('snapshotAt', { ascending: false }).limit(1).single(),
        supabase.from('SyncLog').select('*').order('completedAt', { ascending: false }).limit(10),
      ])

      setEquipmentCount(eqRes.count ?? 0)
      setJobCount(jobRes.count ?? 0)

      // Equipment coverage: count distinct equipment in latest snapshot batch
      if (latestSnapRes.data?.snapshotAt) {
        const { count } = await supabase
          .from('TelematicsSnapshot')
          .select('equipmentCode', { count: 'exact', head: true })
          .eq('snapshotAt', latestSnapRes.data.snapshotAt)
        setTrackedCount(count ?? 0)
      }

      // Seed activity feed with recent sync log entries
      if (syncLogRes.data) {
        const syncItems: ActivityItem[] = (syncLogRes.data as SyncLog[]).map(log => ({
          id: log.id,
          type: 'sync',
          providerKey: log.providerKey,
          providerName: log.providerName,
          status: log.status,
          rowsInserted: log.rowsInserted,
          durationMs: log.durationMs,
          errorMessage: log.errorMessage,
          details: log.details,
          timestamp: new Date(log.completedAt),
        }))
        setActivity(syncItems)
      }

      // Build anomaly lookup by equipmentCode
      const anomalies = (anomalyRes.data ?? []) as Anomaly[]
      const anomalyMap = new Map<string, Anomaly>()
      for (const a of anomalies) anomalyMap.set(a.equipmentCode, a)

      // Map telematics RPC rows + anomaly join to TelematicsSnapshot shape
      const points: TelematicsSnapshot[] = ((telRes.data ?? []) as Record<string, unknown>[]).map(row => {
        const code = row.equipmentCode as string
        const anomaly = anomalyMap.get(code)
        return {
          equipmentCode: code,
          latitude: row.latitude as number,
          longitude: row.longitude as number,
          locationDateTime: (row.locationDateTime as string) ?? null,
          isLocationStale: row.isLocationStale as boolean,
          engineStatus: row.engineStatus as string,
          snapshotAt: row.snapshotAt as string,
          make: (row.make as string) ?? '',
          model: (row.model as string) ?? '',
          equipmentDescription: (row.description as string) ?? '',
          anomalyType: anomaly?.anomalyType ?? undefined,
          e360_job: anomaly?.e360JobCode ?? null,
          e360_location: anomaly?.e360LocationName ?? null,
          hj_job: anomaly?.hjJobCode ?? null,
          hj_job_description: anomaly?.hjJobDescription ?? null,
          hour_meter: anomaly?.hourMeter ?? null,
        }
      })
      setTelematicsPoints(points)
      setSiteLocations((siteLocRes.data ?? []) as SiteLocation[])
      setSiteLocationJobs((siteLocJobRes.data ?? []) as SiteLocationJob[])

      setLoading(false)
    }
    fetchData()
  }, [])

  // Realtime activity feed
  useEffect(() => {
    const tables = ['Equipment', 'Job', 'Location'] as const
    const channels = tables.map(table =>
      supabase
        .channel(`overview-${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            const newItem: ActivityItem = {
              id: crypto.randomUUID(),
              type: 'change',
              table,
              action: payload.eventType,
              description: describeChange(table, payload.eventType, payload.new as Record<string, unknown>),
              timestamp: new Date(),
            }
            setActivity(prev => [newItem, ...prev].slice(0, 50))

            if (table === 'Equipment') {
              if (payload.eventType === 'INSERT') setEquipmentCount(c => c + 1)
              if (payload.eventType === 'DELETE') setEquipmentCount(c => c - 1)
            }
            if (table === 'Job') {
              if (payload.eventType === 'INSERT') setJobCount(c => c + 1)
              if (payload.eventType === 'DELETE') setJobCount(c => c - 1)
            }
          }
        )
        .subscribe()
    )

    // SyncLog Realtime subscription
    const syncChannel = supabase
      .channel('sync-log-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'SyncLog' },
        async (payload) => {
          // Re-fetch the complete row instead of using payload.new directly
          // (Realtime payload may arrive before all fields are written)
          const { data: fullRow } = await supabase
            .from('SyncLog')
            .select('*')
            .eq('id', payload.new.id)
            .single()

          if (!fullRow) return

          const log = fullRow as SyncLog
          const item: ActivityItem = {
            id: log.id,
            type: 'sync',
            providerKey: log.providerKey,
            providerName: log.providerName,
            status: log.status,
            rowsInserted: log.rowsInserted,
            durationMs: log.durationMs,
            errorMessage: log.errorMessage,
            details: log.details,
            timestamp: new Date(log.completedAt),
          }
          setActivity(prev => [item, ...prev].slice(0, 50))
        }
      )
      .subscribe()

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
      supabase.removeChannel(syncChannel)
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

      if (editingLocationId) {
        // UPDATE existing location
        const { data: loc, error: locErr } = await supabase
          .from('SiteLocation')
          .update({
            name: newName.trim(),
            description: newDescription.trim() || null,
            polygon: drawnPolygon,
            geom: drawnPolygon ? polygonToWKT(drawnPolygon) : null,
            centerLat,
            centerLng,
          })
          .eq('id', editingLocationId)
          .select()
          .single()

        if (locErr) throw locErr
        const updatedLoc = loc as SiteLocation

        // Replace SiteLocationJob records: delete existing, re-insert
        await supabase.from('SiteLocationJob').delete().eq('siteLocationId', editingLocationId)

        let newJobRecords: SiteLocationJob[] = []
        if (selectedJobs.length > 0) {
          const jobRows = selectedJobs.map(j => ({
            siteLocationId: editingLocationId,
            jobHcssId: j.id || null,
            jobCode: j.code,
            jobDescription: j.description,
          }))
          const { data: jobData, error: jobErr } = await supabase
            .from('SiteLocationJob')
            .insert(jobRows)
            .select()
          if (jobErr) throw jobErr
          newJobRecords = (jobData ?? []) as SiteLocationJob[]
        }

        setSiteLocations(prev => prev.map(l => l.id === editingLocationId ? updatedLoc : l))
        setSiteLocationJobs(prev => [
          ...prev.filter(j => j.siteLocationId !== editingLocationId),
          ...newJobRecords,
        ])
      } else {
        // INSERT new location
        const { data: loc, error: locErr } = await supabase
          .from('SiteLocation')
          .insert({
            name: newName.trim(),
            description: newDescription.trim() || null,
            polygon: drawnPolygon,
            geom: drawnPolygon ? polygonToWKT(drawnPolygon) : null,
            centerLat,
            centerLng,
          })
          .select()
          .single()

        if (locErr) throw locErr
        const newLoc = loc as SiteLocation

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
      }

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
    setEditingLocationId(null)
  }

  const startEdit = (loc: SiteLocation) => {
    setEditingLocationId(loc.id)
    setDeletingLocationId(null)
    setShowNewForm(true)
    setNewName(loc.name)
    setNewDescription(loc.description ?? '')
    setDrawnPolygon(loc.polygon)
    // Load attached jobs into selectedJobs
    const locJobs = siteLocationJobs.filter(j => j.siteLocationId === loc.id)
    setSelectedJobs(locJobs.map(j => ({
      id: j.jobHcssId ?? '',
      businessUnitId: '',
      code: j.jobCode,
      description: j.jobDescription ?? '',
      locationId: null,
    })))
  }

  const handleDelete = async (locId: string) => {
    try {
      const { error } = await supabase.from('SiteLocation').delete().eq('id', locId)
      if (error) throw error
      setSiteLocations(prev => prev.filter(l => l.id !== locId))
      setSiteLocationJobs(prev => prev.filter(j => j.siteLocationId !== locId))
      setDeletingLocationId(null)
    } catch (err) {
      console.error('Failed to delete location:', err)
    }
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-100">Overview</h2>

      {/* Equipment coverage stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Tracked Equipment"
          value={loading ? '—' : trackedCount}
          color="green"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
          }
        />
        <MetricCard
          label="Untracked Equipment"
          value={loading ? '—' : equipmentCount - trackedCount}
          color="orange"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          }
        />
        <MetricCard
          label="Total Equipment"
          value={loading ? '—' : equipmentCount}
          color="blue"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <MapLegend />
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
                      {saving ? 'Saving...' : editingLocationId ? 'Update Location' : 'Save Location'}
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
              {siteLocations.map(loc => {
                const locJobs = siteLocationJobs.filter(j => j.siteLocationId === loc.id)
                const isDeleting = deletingLocationId === loc.id

                return (
                  <div key={loc.id} className="bg-slate-700/30 rounded px-3 py-2 border border-slate-700">
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-sm font-medium text-slate-200">{loc.name}</div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => startEdit(loc)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                          title="Edit"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingLocationId(loc.id)}
                          className="p-1 text-slate-400 hover:text-red-400"
                          title="Delete"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {loc.description && (
                      <div className="text-xs text-slate-400 mt-0.5">{loc.description}</div>
                    )}
                    {locJobs.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {locJobs.map(j => (
                          <div key={j.id} className="text-xs text-slate-400">
                            {j.jobCode} — {j.jobDescription}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">
                      {loc.polygon ? '✓ Geofenced' : 'No geofence'}
                    </div>
                    {isDeleting && (
                      <div className="mt-2 bg-red-500/10 rounded px-2 py-1.5 border border-red-500/30">
                        <p className="text-xs text-red-400">Delete {loc.name}? This cannot be undone.</p>
                        <div className="flex gap-2 mt-1.5">
                          <button
                            onClick={() => handleDelete(loc.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => setDeletingLocationId(null)}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
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
            activity.map(item =>
              item.type === 'sync' ? (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <SyncBadge status={item.status!} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${item.status === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                      {formatSyncLogEntry(item)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <ActionBadge action={item.action!} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  )
}

function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 bg-slate-900/80 rounded-lg px-3 py-2.5 text-xs text-slate-300 space-y-1.5 pointer-events-auto">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
        Engine Active
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-500" />
        Engine Off
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-500 opacity-40" />
        Stale GPS
      </div>
      <div className="border-t border-slate-600 pt-1.5 mt-1.5 text-orange-400 font-semibold text-[10px] uppercase tracking-wide">
        Reconciliation
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-transparent" />
        <span>Anomaly</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-yellow-500 bg-transparent" />
        <span>Disputed</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-orange-500 bg-transparent" />
        <span>Unregistered</span>
      </div>
    </div>
  )
}

function SyncBadge({ status }: { status: string }) {
  const isError = status === 'error'
  return (
    <span className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center ${isError ? 'bg-red-500/20 text-red-400' : 'bg-slate-600/50 text-slate-400'}`}>
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 10-1.449-.422zM4.688 8.576a5.5 5.5 0 019.201-2.466l.312.311h-2.433a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.537a.75.75 0 00-1.5 0v2.033l-.312-.311a7 7 0 00-11.712 3.138.75.75 0 001.449.422z" clipRule="evenodd" />
      </svg>
    </span>
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
