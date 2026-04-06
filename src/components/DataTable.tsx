interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[]
  data: T[]
  loading: boolean
  error: string | null
  flashedIds?: Set<string>
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  error,
  flashedIds,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm">
        Error loading data: {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No records found
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
          <tr>
            {columns.map(col => (
              <th key={col.key} className="px-4 py-3 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {data.map(row => (
            <tr
              key={row.id}
              className={`
                bg-slate-800/30 hover:bg-slate-700/30 transition-colors
                ${flashedIds?.has(row.id) ? 'flash-row' : ''}
              `}
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-slate-300">
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
