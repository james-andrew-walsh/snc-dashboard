import { useState } from 'react'
import { Sidebar, type ViewId } from './Sidebar'
import { useAuth } from '../context/AuthContext'

interface LayoutProps {
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  children: React.ReactNode
}

export function Layout({ activeView, onNavigate, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, role, signOut } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 bg-slate-800 border-b border-slate-700 lg:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-700"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <h1 className="text-sm font-semibold text-slate-100 hidden lg:block">
              SNC Equipment Tracking Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 hidden md:inline">{user.email}</span>
                {role && (
                  <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-400">
                    {role}
                  </span>
                )}
                <button
                  onClick={signOut}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
