import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MetricCard } from '../components/MetricCard'
import { MapboxMap } from '../components/MapboxMap'
import type { Location, DispatchEvent, Equipment, Job, Employee } from '../lib/types'

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

  // Data for map
  const [locations, setLocations] = useState<Location[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [dispatches, setDispatches] = useState<DispatchEvent[]>([])

  useEffect(() => {
    async function fetchData() {
      const [eqRes, jobRes, dispRes, locRes, empRes] = await Promise.all([
        supabase.from('Equipment').select('*'),
        supabase.from('Job').select('*'),
        supabase.from('DispatchEvent').select('*'),
        supabase.from('Location').select('*'),
        supabase.from('Employee').select('*'),
      ])

      const eqData = (eqRes.data ?? []) as Equipment[]
      const jobData = (jobRes.data ?? []) as Job[]
      const dispData = (dispRes.data ?? []) as DispatchEvent[]
      const locData = (locRes.data ?? []) as Location[]
      const empData = (empRes.data ?? []) as Employee[]

      setEquipment(eqData)
      setJobs(jobData)
      setDispatches(dispData)
      setLocations(locData)
      setEmployees(empData)

      setEquipmentCount(eqData.length)
      setJobCount(jobData.length)
      setDispatchCount(dispData.length)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Filter active dispatches client-side
  const today = new Date().toISOString().slice(0, 10)
  const activeDispatches = dispatches.filter((d) => {
    if (d.startDate > today) return false
    if (d.endDate && d.endDate < today) return false
    return true
  })

  // Realtime activity feed
  useEffect(() => {
    const tables = ['Equipment', 'Job', 'DispatchEvent', 'Employee'] as const
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

            // Update counts on changes
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

      {/* Map */}
      <div className="h-[500px] rounded-lg overflow-hidden">
        <MapboxMap
          locations={locations}
          activeDispatches={activeDispatches}
          equipment={equipment}
          jobs={jobs}
          employees={employees}
        />
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
