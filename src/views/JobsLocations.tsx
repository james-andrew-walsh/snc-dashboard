import { useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { Job, Location } from '../lib/types'

export function JobsLocations() {
  const { data: jobs, setData: setJobs, loading: jobsLoading, error: jobsError } = useSupabaseQuery<Job>('Job')
  const { data: locations, setData: setLocations, loading: locsLoading, error: locsError } = useSupabaseQuery<Location>('Location')
  const [flashedJobIds, setFlashedJobIds] = useState<Set<string>>(new Set())
  const [flashedLocIds, setFlashedLocIds] = useState<Set<string>>(new Set())
  useRealtime('Job', jobs, setJobs, flashedJobIds, setFlashedJobIds)
  useRealtime('Location', locations, setLocations, flashedLocIds, setFlashedLocIds)

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold text-slate-100">Jobs & Locations</h2>

      {/* Jobs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-200">Jobs</h3>
          <span className="text-sm text-slate-400">{jobs.length} jobs</span>
        </div>
        <DataTable
          columns={[
            { key: 'code', header: 'Code' },
            { key: 'description', header: 'Description' },
          ]}
          data={jobs}
          loading={jobsLoading}
          error={jobsError}
          flashedIds={flashedJobIds}
        />
      </div>

      {/* Locations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-200">Locations</h3>
          <span className="text-sm text-slate-400">{locations.length} locations</span>
        </div>
        <DataTable
          columns={[
            { key: 'code', header: 'Code' },
            { key: 'description', header: 'Description' },
          ]}
          data={locations}
          loading={locsLoading}
          error={locsError}
          flashedIds={flashedLocIds}
        />
      </div>
    </div>
  )
}
