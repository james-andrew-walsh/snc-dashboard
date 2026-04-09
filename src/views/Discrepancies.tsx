import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ReconRow {
  equipmentCode: string
  make: string
  model: string
  engineStatus: string
  isLocationStale: boolean
  reconciliation_status: string
  site_name: string | null
  site_id: string | null
  jobCode: string | null
}

interface SiteGroup {
  siteName: string
  rows: ReconRow[]
  anomalyCount: number
  disputedCount: number
  notInEitherCount: number
}

const STATUS_ORDER: Record<string, number> = {
  ANOMALY: 0,
  NOT_IN_EITHER: 1,
  DISPUTED: 2,
}

function sortKey(row: ReconRow): number {
  const statusBase = (STATUS_ORDER[row.reconciliation_status] ?? 3) * 10
  const engineOffset = row.engineStatus === 'Active' ? 0 : 1
  return statusBase + engineOffset
}

function statusColor(status: string): string {
  switch (status) {
    case 'ANOMALY':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'DISPUTED':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'NOT_IN_EITHER':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    default:
      return 'bg-slate-600/20 text-slate-400 border-slate-500/30'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ANOMALY':
      return 'Anomaly'
    case 'DISPUTED':
      return 'Disputed'
    case 'NOT_IN_EITHER':
      return 'Unregistered'
    default:
      return status
  }
}

export function Discrepancies() {
  const [groups, setGroups] = useState<SiteGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [noGeofences, setNoGeofences] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [reconRes, siteLocRes] = await Promise.all([
        supabase.rpc('get_reconciliation_status'),
        supabase.from('SiteLocation').select('id, name, polygon').order('name'),
      ])

      const allRows = (reconRes.data ?? []) as Record<string, unknown>[]
      const siteLocations = (siteLocRes.data ?? []) as { id: string; name: string; polygon: unknown }[]

      // Only geofenced locations
      const geofenced = siteLocations.filter(l => l.polygon != null)
      if (geofenced.length === 0) {
        setNoGeofences(true)
        setLoading(false)
        return
      }

      // Filter to discrepancy rows (not OK, not OUTSIDE)
      const discrepancies: ReconRow[] = allRows
        .filter(r => {
          const status = r.reconciliation_status as string
          return status && status !== 'OK' && status !== 'OUTSIDE'
        })
        .map(r => ({
          equipmentCode: r.equipmentCode as string,
          make: (r.make as string) ?? '',
          model: (r.model as string) ?? '',
          engineStatus: (r.engineStatus as string) ?? 'Off',
          isLocationStale: (r.isLocationStale as boolean) ?? false,
          reconciliation_status: r.reconciliation_status as string,
          site_name: (r.site_name as string) ?? null,
          site_id: (r.site_id as string) ?? null,
          jobCode: (r.jobCode as string) ?? null,
        }))

      // Group by site_name
      const grouped = new Map<string, ReconRow[]>()
      for (const row of discrepancies) {
        const name = row.site_name ?? 'Unknown Site'
        if (!grouped.has(name)) grouped.set(name, [])
        grouped.get(name)!.push(row)
      }

      // Build site groups for all geofenced locations
      const siteGroups: SiteGroup[] = geofenced.map(loc => {
        const rows = grouped.get(loc.name) ?? []
        rows.sort((a, b) => sortKey(a) - sortKey(b))
        return {
          siteName: loc.name,
          rows,
          anomalyCount: rows.filter(r => r.reconciliation_status === 'ANOMALY').length,
          disputedCount: rows.filter(r => r.reconciliation_status === 'DISPUTED').length,
          notInEitherCount: rows.filter(r => r.reconciliation_status === 'NOT_IN_EITHER').length,
        }
      })

      setGroups(siteGroups)
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-slate-100">Discrepancies</h2>
        <div className="text-sm text-slate-500">Loading reconciliation data...</div>
      </div>
    )
  }

  if (noGeofences) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-slate-100">Discrepancies</h2>
        <div className="bg-slate-800 rounded-lg border border-slate-700 px-6 py-12 text-center">
          <p className="text-sm text-slate-400">
            No geofenced locations. Draw a geofence on the Overview map to begin reconciliation.
          </p>
        </div>
      </div>
    )
  }

  const totalAnomalies = groups.reduce((sum, g) => sum + g.anomalyCount + g.notInEitherCount + g.disputedCount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-slate-100">Discrepancies</h2>
        {totalAnomalies > 0 && (
          <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">
            {totalAnomalies} issue{totalAnomalies !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {groups.map(group => (
        <div key={group.siteName} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {/* Section header */}
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">{group.siteName}</h3>
            <div className="flex items-center gap-3 text-xs">
              {group.anomalyCount > 0 && (
                <span className="text-orange-400">{group.anomalyCount} anomal{group.anomalyCount !== 1 ? 'ies' : 'y'}</span>
              )}
              {group.disputedCount > 0 && (
                <span className="text-yellow-400">{group.disputedCount} disputed</span>
              )}
              {group.notInEitherCount > 0 && (
                <span className="text-orange-400">{group.notInEitherCount} unregistered</span>
              )}
            </div>
          </div>

          {/* Table or empty state */}
          {group.rows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No discrepancies at this location.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-700/50">
                    <th className="px-5 py-2.5 font-medium">Equipment Code</th>
                    <th className="px-5 py-2.5 font-medium">Make &amp; Model</th>
                    <th className="px-5 py-2.5 font-medium">Engine</th>
                    <th className="px-5 py-2.5 font-medium">GPS</th>
                    <th className="px-5 py-2.5 font-medium">E360 Job</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {group.rows.map(row => (
                    <tr key={row.equipmentCode} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-2.5 font-mono text-slate-200">{row.equipmentCode}</td>
                      <td className="px-5 py-2.5 text-slate-300">
                        {row.make && row.model ? `${row.make} ${row.model}` : row.make || row.model || '—'}
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 ${row.engineStatus === 'Active' ? 'text-green-400' : 'text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${row.engineStatus === 'Active' ? 'bg-green-400' : 'bg-slate-600'}`} />
                          {row.engineStatus}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        {row.isLocationStale ? (
                          <span className="text-yellow-500 text-xs font-medium">Stale</span>
                        ) : (
                          <span className="text-slate-500 text-xs">Current</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-slate-300">{row.jobCode ?? '—'}</td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-block text-[11px] font-semibold uppercase px-2 py-0.5 rounded border ${statusColor(row.reconciliation_status)}`}>
                          {statusLabel(row.reconciliation_status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
