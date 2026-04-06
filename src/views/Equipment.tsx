import { useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import type { Equipment } from '../lib/types'

export function EquipmentView() {
  const { data, setData, loading, error } = useSupabaseQuery<Equipment>('Equipment')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())

  useRealtime('Equipment', data, setData, flashedIds, setFlashedIds)

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
