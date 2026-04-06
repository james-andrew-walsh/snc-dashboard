import { useState, useMemo } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import type { Equipment, DispatchEvent, Job, Location } from '../lib/types'

export function EquipmentView() {
  const { data, setData, loading, error } = useSupabaseQuery<Equipment>('Equipment')
  const { data: dispatches } = useSupabaseQuery<DispatchEvent>('DispatchEvent')
  const { data: jobs } = useSupabaseQuery<Job>('Job')
  const { data: locations } = useSupabaseQuery<Location>('Location')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())

  useRealtime('Equipment', data, setData, flashedIds, setFlashedIds)

  const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs])
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  const activeDispatchMap = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const map = new Map<string, DispatchEvent>()
    for (const d of dispatches) {
      if (d.startDate <= today && (!d.endDate || d.endDate >= today)) {
        map.set(d.equipmentId, d)
      }
    }
    return map
  }, [dispatches])

  function resolveAssignedTo(row: Equipment): string {
    const dispatch = activeDispatchMap.get(row.id)
    if (!dispatch) return '—'
    if (dispatch.jobId) {
      const job = jobMap.get(dispatch.jobId)
      return job ? job.code : dispatch.jobId
    }
    if (dispatch.locationId) {
      const loc = locationMap.get(dispatch.locationId)
      return loc ? loc.code : dispatch.locationId
    }
    return '—'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Equipment</h2>
        <span className="text-sm text-slate-400">{data.length} items</span>
      </div>

      {/* Status summary */}
      <div className="flex gap-4 text-sm">
        {(['Available', 'In Use', 'Down'] as const).map(status => {
          const count = data.filter(e => e.status === status).length
          return (
            <div key={status} className="flex items-center gap-2">
              <StatusBadge status={status} />
              <span className="text-slate-400">{count}</span>
            </div>
          )
        })}
      </div>

      <DataTable
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'make', header: 'Make' },
          { key: 'model', header: 'Model' },
          { key: 'year', header: 'Year' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            key: 'assignedTo',
            header: 'Assigned To',
            render: (row) => resolveAssignedTo(row),
          },
          { key: 'hourMeter', header: 'Hours' },
          { key: 'odometer', header: 'Odometer' },
          {
            key: 'isRental',
            header: 'Rental',
            render: (row) => (
              <span className={row.isRental ? 'text-amber-400' : 'text-slate-500'}>
                {row.isRental ? 'Yes' : 'No'}
              </span>
            ),
          },
        ]}
        data={data}
        loading={loading}
        error={error}
        flashedIds={flashedIds}
      />
    </div>
  )
}
