import { useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { Location } from '../lib/types'

export function Locations() {
  const { data: locations, setData: setLocations, loading, error } = useSupabaseQuery<Location>('Location')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())
  useRealtime('Location', locations, setLocations, flashedIds, setFlashedIds)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Locations</h2>
        <span className="text-sm text-slate-400">{locations.length} locations</span>
      </div>
      <DataTable
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'description', header: 'Description' },
        ]}
        data={locations}
        loading={loading}
        error={error}
        flashedIds={flashedIds}
      />
    </div>
  )
}
