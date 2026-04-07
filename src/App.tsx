import { useState, useCallback } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { AuthCallback } from './pages/AuthCallback'
import { Admin } from './pages/Admin'
import { Layout } from './components/Layout'
import type { ViewId } from './components/Sidebar'
import { Overview } from './views/Overview'
import { BusinessUnits } from './views/BusinessUnits'
import { JobsLocations } from './views/JobsLocations'
import { EquipmentView } from './views/Equipment'
import { Employees } from './views/Employees'
import { CrewAssignments } from './views/CrewAssignments'
import { DispatchSchedule } from './views/DispatchSchedule'
import { MagnetBoard } from './views/MagnetBoard'

const views: Record<ViewId, React.FC> = {
  'magnet-board': MagnetBoard,
  'overview': Overview,
  'business-units': BusinessUnits,
  'jobs-locations': JobsLocations,
  'equipment': EquipmentView,
  'employees': Employees,
  'crew-assignments': CrewAssignments,
  'dispatch': DispatchSchedule,
  'admin': Admin,
}

function AuthenticatedApp() {
  const { role } = useAuth()
  const [activeView, setActiveView] = useState<ViewId>('overview')

  // Guard: non-admin users cannot access admin view
  const handleNavigate = useCallback((view: ViewId) => {
    if (view === 'admin' && role !== 'admin') {
      setActiveView('overview')
      return
    }
    setActiveView(view)
  }, [role])

  const ActiveComponent = views[activeView]

  return (
    <Layout activeView={activeView} onNavigate={handleNavigate}>
      <ActiveComponent />
    </Layout>
  )
}

function AppRouter() {
  const { session } = useAuth()
  const path = window.location.pathname

  // Public routes
  if (path === '/auth/callback') return <AuthCallback />
  if (!session) return <Login />

  return <AuthenticatedApp />
}

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}

export default App
