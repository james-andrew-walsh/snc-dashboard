interface StatusBadgeProps {
  status: string
}

const statusStyles: Record<string, string> = {
  'Available': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'In Use': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Down': 'bg-red-500/20 text-red-400 border-red-500/30',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {status}
    </span>
  )
}
