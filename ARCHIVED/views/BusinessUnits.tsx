import { useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { BusinessUnit } from '../lib/types'

export function BusinessUnits() {
  const { data, setData, loading, error } = useSupabaseQuery<BusinessUnit>('BusinessUnit')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())
  useRealtime('BusinessUnit', data, setData, flashedIds, setFlashedIds)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Business Units</h2>
        <span className="text-sm text-slate-400">{data.length} units</span>
      </div>

      <DataTable
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'description', header: 'Description' },
        ]}
        data={data}
        loading={loading}
        error={error}
        flashedIds={flashedIds}
      />
    </div>
  )
}
