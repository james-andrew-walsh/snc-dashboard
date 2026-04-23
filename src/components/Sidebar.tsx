import { type ReactNode } from 'react'

export type ViewId = 'magnet-board' | 'report' | 'admin'

interface NavItem {
  id: ViewId
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  { id: 'report', label: 'Reconciliation Report', icon: <ReportIcon /> },
  { id: 'magnet-board', label: 'Magnet Board', icon: <MagnetBoardIcon /> },
]

interface SidebarProps {
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  isOpen: boolean
  onClose: () => void
  role?: string | null
}

export function Sidebar({ activeView, onNavigate, isOpen, onClose, role }: SidebarProps) {
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
            <span className="text-xs text-slate-400">Connected</span>
          </div>
        </div>
      </aside>
    </>
  )
}

function MagnetBoardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  )
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
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
