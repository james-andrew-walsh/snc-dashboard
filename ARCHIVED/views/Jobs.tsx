import { useState, useMemo } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { Job, Location } from '../lib/types'

export function Jobs() {
  const { data: jobs, setData: setJobs, loading, error } = useSupabaseQuery<Job>('Job')
  const { data: locations } = useSupabaseQuery<Location>('Location')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())
  useRealtime('Job', jobs, setJobs, flashedIds, setFlashedIds)

  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  function resolveLocation(row: Job): string {
    if (!row.locationId) return '—'
    const loc = locationMap.get(row.locationId)
    return loc ? `${loc.code} — ${loc.description}` : row.locationId
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Jobs</h2>
        <span className="text-sm text-slate-400">{jobs.length} jobs</span>
      </div>
      <DataTable
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'description', header: 'Description' },
          {
            key: 'locationId',
            header: 'Location',
            render: (row) => resolveLocation(row),
          },
        ]}
        data={jobs}
        loading={loading}
        error={error}
        flashedIds={flashedIds}
      />
    </div>
  )
}
