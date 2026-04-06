import { useState, useMemo } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { DataTable } from '../components/DataTable'
import type { CrewAssignment, Job, Employee } from '../lib/types'

export function CrewAssignments() {
  const { data, setData, loading, error } = useSupabaseQuery<CrewAssignment>('CrewAssignment')
  const { data: jobs } = useSupabaseQuery<Job>('Job')
  const { data: employees } = useSupabaseQuery<Employee>('Employee')
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())

  useRealtime('CrewAssignment', data, setData, flashedIds, setFlashedIds)

  const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs])
  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

  function resolveJob(row: CrewAssignment): string {
    const job = jobMap.get(row.jobId)
    return job ? `${job.code} — ${job.description}` : row.jobId
  }

  function resolveEmployee(row: CrewAssignment): string {
    const emp = employeeMap.get(row.employeeId)
    return emp ? `${emp.firstName} ${emp.lastName}` : row.employeeId
  }

  const sorted = [...data].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Crew Assignments</h2>
        <span className="text-sm text-slate-400">{data.length} assignments</span>
      </div>

      <DataTable
        columns={[
          {
            key: 'jobId',
            header: 'Job',
            render: (row) => resolveJob(row),
          },
          {
            key: 'employeeId',
            header: 'Employee',
            render: (row) => resolveEmployee(row),
          },
          { key: 'role', header: 'Role' },
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
