import { useState, useCallback } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { AuthCallback } from './pages/AuthCallback'
import { Admin } from './pages/Admin'
import { Layout } from './components/Layout'
import type { ViewId } from './components/Sidebar'
import { MagnetBoard } from './views/MagnetBoard'
import { Report } from './views/Report'

const views: Record<ViewId, React.FC> = {
  'magnet-board': MagnetBoard,
  'report': Report,
  'admin': Admin,
}

function AuthenticatedApp() {
  const { role } = useAuth()
  const [activeView, setActiveView] = useState<ViewId>('report')

  const handleNavigate = useCallback((view: ViewId) => {
    if (view === 'admin' && role !== 'admin') return
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
