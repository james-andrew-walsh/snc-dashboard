import { useState } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { DispatchEvent } from '../lib/types'

export function DispatchSchedule() {
  const { data, setData, loading, error } = useSupabaseQuery<DispatchEvent>('DispatchEvent')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())

  useRealtime('DispatchEvent', data, setData, flashedIds, setFlashedIds)

  const sorted = [...data].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )

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
          { key: 'equipmentId', header: 'Equipment ID' },
          { key: 'jobId', header: 'Job ID' },
          { key: 'driverId', header: 'Driver ID' },
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
