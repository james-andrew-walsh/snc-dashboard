import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { DataTable } from '../components/DataTable'
import type { Employee } from '../lib/types'

export function Employees() {
  const { data, loading, error } = useSupabaseQuery<Employee>('Employee')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Employees</h2>
        <span className="text-sm text-slate-400">{data.length} employees</span>
      </div>

      <DataTable
        columns={[
          { key: 'employeeCode', header: 'Code' },
          {
            key: 'name',
            header: 'Name',
            render: (row) => `${row.firstName} ${row.lastName}`,
          },
          { key: 'role', header: 'Role' },
        ]}
        data={data}
        loading={loading}
        error={error}
      />
    </div>
  )
}
