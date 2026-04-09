import { type ReactNode, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type ViewId = 'magnet-board' | 'overview' | 'business-units' | 'jobs-locations' | 'equipment' | 'employees' | 'crew-assignments' | 'dispatch' | 'discrepancies' | 'admin'

interface NavItem {
  id: ViewId
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  { id: 'magnet-board', label: 'Magnet Board', icon: <MagnetBoardIcon /> },
  { id: 'overview', label: 'Overview', icon: <OverviewIcon /> },
  { id: 'business-units', label: 'Business Units', icon: <BusinessIcon /> },
  { id: 'jobs-locations', label: 'Jobs & Locations', icon: <JobsIcon /> },
  { id: 'equipment', label: 'Equipment', icon: <EquipmentIcon /> },
  { id: 'employees', label: 'Employees', icon: <EmployeesIcon /> },
  { id: 'crew-assignments', label: 'Crew Assignments', icon: <CrewIcon /> },
  { id: 'dispatch', label: 'Dispatch Schedule', icon: <DispatchIcon /> },
  { id: 'discrepancies', label: 'Discrepancies', icon: <DiscrepanciesIcon /> },
]

interface SidebarProps {
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  isOpen: boolean
  onClose: () => void
  role?: string | null
}

export function Sidebar({ activeView, onNavigate, isOpen, onClose, role }: SidebarProps) {
  const [anomalyCount, setAnomalyCount] = useState(0)

  useEffect(() => {
    supabase.rpc('get_reconciliation_status').then(({ data }) => {
      const rows = (data ?? []) as Record<string, unknown>[]
      const count = rows.filter(r => {
        const s = r.reconciliation_status as string
        return s && s !== 'OK' && s !== 'OUTSIDE'
      }).length
      setAnomalyCount(count)
    })
  }, [])

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64
          bg-slate-800 border-r border-slate-700
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center font-bold text-white text-sm">
            SNC
          </div>
          <div>
            <div className="font-semibold text-slate-100 text-sm">Sierra Nevada</div>
            <div className="text-xs text-slate-400">Equipment Tracking</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-4 px-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); onClose() }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors cursor-pointer
                ${activeView === item.id
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100'
                }
              `}
            >
              <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
              {item.label}
              {item.id === 'discrepancies' && anomalyCount > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {anomalyCount}
                </span>
              )}
            </button>
          ))}

          {/* Admin — visible only to admin users */}
          {role === 'admin' && (
            <>
              <div className="my-2 border-t border-slate-700" />
              <button
                onClick={() => { onNavigate('admin'); onClose() }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors cursor-pointer
                  ${activeView === 'admin'
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100'
                  }
                `}
              >
                <span className="w-5 h-5 flex-shrink-0"><AdminIcon /></span>
                Admin
              </button>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-slate-400">Realtime Connected</span>
          </div>
        </div>
      </aside>
    </>
  )
}

/* Simple SVG icons */
function MagnetBoardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  )
}

function OverviewIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  )
}

function BusinessIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
    </svg>
  )
}

function JobsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
    </svg>
  )
}

function EquipmentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm12 0a1 1 0 00-1 1v2a1 1 0 001 1h1a1 1 0 001-1v-2a1 1 0 00-1-1h-1z" clipRule="evenodd" />
    </svg>
  )
}

function EmployeesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
    </svg>
  )
}

function CrewIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.97 5.97 0 00-.75-2.906A3.005 3.005 0 0119 17v1h-3zM4.75 14.094A5.97 5.97 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
    </svg>
  )
}

function DispatchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  )
}

function DiscrepanciesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
    </svg>
  )
}
