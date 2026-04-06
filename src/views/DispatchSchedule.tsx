import { useState, useMemo } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { DispatchEvent, Equipment, Job, Location, Employee } from '../lib/types'

export function DispatchSchedule() {
  const { data, setData, loading, error } = useSupabaseQuery<DispatchEvent>('DispatchEvent')
  const { data: equipment } = useSupabaseQuery<Equipment>('Equipment')
  const { data: jobs } = useSupabaseQuery<Job>('Job')
  const { data: locations } = useSupabaseQuery<Location>('Location')
  const { data: employees } = useSupabaseQuery<Employee>('Employee')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())

  useRealtime('DispatchEvent', data, setData, flashedIds, setFlashedIds)

  const equipmentMap = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment])
  const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs])
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

  const sorted = [...data].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )

  function resolveEquipment(row: DispatchEvent): string {
    const eq = equipmentMap.get(row.equipmentId)
    return eq ? `${eq.make} ${eq.model} (${eq.code})` : row.equipmentId
  }

  function resolveDestination(row: DispatchEvent): string {
    if (row.jobId) {
      const job = jobMap.get(row.jobId)
      return job ? `${job.code} — ${job.description}` : row.jobId
    }
    if (row.locationId) {
      const loc = locationMap.get(row.locationId)
      return loc ? `${loc.code} — ${loc.description}` : row.locationId
    }
    return '—'
  }

  function resolveOperator(row: DispatchEvent): string {
    const emp = employeeMap.get(row.operatorId)
    return emp ? `${emp.firstName} ${emp.lastName}` : row.operatorId || '—'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Dispatch Schedule</h2>
        <span className="text-sm text-slate-400">{data.length} events</span>
      </div>

      <DataTable
        columns={[
          {
            key: 'startDate',
            header: 'Start',
            render: (row) => formatDate(row.startDate),
          },
          {
            key: 'endDate',
            header: 'End',
            render: (row) => formatDate(row.endDate),
          },
          {
            key: 'equipmentId',
            header: 'Equipment',
            render: (row) => resolveEquipment(row),
          },
          {
            key: 'jobId',
            header: 'Destination',
            render: (row) => resolveDestination(row),
          },
          {
            key: 'operatorId',
            header: 'Operator',
            render: (row) => resolveOperator(row),
          },
          { key: 'notes', header: 'Notes' },
        ]}
        data={sorted}
        loading={loading}
        error={error}
        flashedIds={flashedIds}
      />
    </div>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
