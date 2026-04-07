import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/* ── Permission grid definition (mirrors CLI command tree) ── */

type Resource =
  | 'business-unit'
  | 'equipment'
  | 'dispatch'
  | 'job'
  | 'location'
  | 'employee'
  | 'crew-assignment'
  | 'telemetry'

interface ResourceDef {
  resource: Resource
  operations: string[]
}

const RESOURCE_DEFS: ResourceDef[] = [
  { resource: 'business-unit', operations: ['list', 'get', 'create', 'update', 'delete'] },
  { resource: 'equipment', operations: ['list', 'get', 'create', 'update', 'delete', 'transfer'] },
  { resource: 'dispatch', operations: ['list', 'get', 'schedule', 'cancel'] },
  { resource: 'job', operations: ['list', 'get', 'create', 'update', 'delete'] },
  { resource: 'location', operations: ['list', 'get', 'create', 'update', 'delete'] },
  { resource: 'employee', operations: ['list', 'get', 'create', 'update', 'delete'] },
  { resource: 'crew-assignment', operations: ['list', 'get', 'assign', 'remove'] },
  { resource: 'telemetry', operations: ['update'] },
]

// Collect every unique operation across all resources (for column headers)
const ALL_OPERATIONS = Array.from(
  new Set(RESOURCE_DEFS.flatMap(r => r.operations)),
)

type Permissions = Record<string, string[]>

interface UserProfile {
  id: string
  email: string
  role: string
  permissions: Permissions | null
}

/* ── Role badge ── */

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/15 text-red-400',
  dispatcher: 'bg-orange-500/15 text-orange-400',
  agent_write: 'bg-blue-500/15 text-blue-400',
  agent_read: 'bg-slate-500/15 text-slate-400',
  read_only: 'bg-slate-600/15 text-slate-500',
}

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? ROLE_COLORS.read_only
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {role.replace('_', ' ')}
    </span>
  )
}

/* ── Permission grid for one user ── */

function PermissionGrid({
  profile,
  readOnly,
  onToggle,
}: {
  profile: UserProfile
  readOnly: boolean
  onToggle: (resource: Resource, operation: string, enabled: boolean) => void
}) {
  const perms = profile.permissions ?? {}

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-2 pr-4 text-slate-400 font-medium">Resource</th>
            {ALL_OPERATIONS.map(op => (
              <th key={op} className="px-2 py-2 text-center text-slate-400 font-medium whitespace-nowrap">
                {op}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESOURCE_DEFS.map(({ resource, operations }) => (
            <tr key={resource} className="border-b border-slate-700/50">
              <td className="py-2 pr-4 text-slate-300 font-mono">{resource}</td>
              {ALL_OPERATIONS.map(op => {
                const applicable = operations.includes(op)
                if (!applicable) {
                  return <td key={op} className="px-2 py-2 text-center text-slate-700">—</td>
                }
                const checked = (perms[resource] ?? []).includes(op)
                return (
                  <td key={op} className="px-2 py-2 text-center">
                    {readOnly ? (
                      <span className={checked ? 'text-orange-400' : 'text-slate-600'}>
                        {checked ? '✓' : '✗'}
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(resource, op, !checked)}
                        className="accent-orange-500 w-3.5 h-3.5 cursor-pointer"
                      />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── User card ── */

function UserCard({
  profile,
  onPermissionToggle,
}: {
  profile: UserProfile
  onPermissionToggle: (userId: string, resource: Resource, operation: string, enabled: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const readOnly = profile.role === 'admin'

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold uppercase">
            {profile.email[0]}
          </div>
          <div className="text-left">
            <div className="text-sm text-slate-100 font-medium">{profile.email}</div>
            {readOnly && (
              <div className="text-[10px] text-slate-500 mt-0.5">Admin override — all permissions granted</div>
            )}
          </div>
          <RoleBadge role={profile.role} />
        </div>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded permission grid */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-700">
          <PermissionGrid
            profile={profile}
            readOnly={readOnly}
            onToggle={(resource, operation, enabled) =>
              onPermissionToggle(profile.id, resource, operation, enabled)
            }
          />
        </div>
      )}
    </div>
  )
}

/* ── Admin page ── */

export function Admin() {
  const { role } = useAuth()
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProfiles() {
      const { data, error: err } = await supabase
        .from('user_profiles')
        .select('id, email, role, permissions')
        .order('email')
      if (err) {
        setError(err.message)
      } else {
        setProfiles((data as UserProfile[]) ?? [])
      }
      setLoading(false)
    }
    fetchProfiles()
  }, [])

  const handleToggle = useCallback(
    async (userId: string, resource: Resource, operation: string, enabled: boolean) => {
      // Optimistic update
      setProfiles(prev =>
        prev.map(p => {
          if (p.id !== userId) return p
          const perms = { ...(p.permissions ?? {}) }
          const ops = [...(perms[resource] ?? [])]
          if (enabled) {
            if (!ops.includes(operation)) ops.push(operation)
          } else {
            const idx = ops.indexOf(operation)
            if (idx >= 0) ops.splice(idx, 1)
          }
          perms[resource] = ops
          return { ...p, permissions: perms }
        }),
      )

      // Build updated permissions for this user
      const profile = profiles.find(p => p.id === userId)
      if (!profile) return
      const perms = { ...(profile.permissions ?? {}) }
      const ops = [...(perms[resource] ?? [])]
      if (enabled) {
        if (!ops.includes(operation)) ops.push(operation)
      } else {
        const idx = ops.indexOf(operation)
        if (idx >= 0) ops.splice(idx, 1)
      }
      perms[resource] = ops

      const { error: err } = await supabase
        .from('user_profiles')
        .update({ permissions: perms })
        .eq('id', userId)

      if (err) {
        // Revert on error — re-fetch
        const { data } = await supabase
          .from('user_profiles')
          .select('id, email, role, permissions')
          .order('email')
        if (data) setProfiles(data as UserProfile[])
      }
    },
    [profiles],
  )

  // Guard: non-admin redirect
  if (role !== 'admin') {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">User Management</h2>
        <button
          disabled
          className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-medium text-slate-500 cursor-not-allowed"
          title="Coming soon"
        >
          Create User
        </button>
      </div>

      {/* User list */}
      {loading && <div className="text-sm text-slate-400">Loading users...</div>}
      {error && <div className="text-sm text-red-400">Error: {error}</div>}

      <div className="space-y-3">
        {profiles.map(profile => (
          <UserCard
            key={profile.id}
            profile={profile}
            onPermissionToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  )
}
