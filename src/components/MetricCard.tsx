interface MetricCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color?: string
}

export function MetricCard({ label, value, icon, color = 'orange' }: MetricCardProps) {
  const colorMap: Record<string, string> = {
    orange: 'text-orange-400 bg-orange-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-green-400 bg-green-500/10',
  }

  const iconColor = colorMap[color] ?? colorMap.orange

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-100">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
