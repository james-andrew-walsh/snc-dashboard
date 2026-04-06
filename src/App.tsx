import { useState } from 'react'
import { Layout } from './components/Layout'
import type { ViewId } from './components/Sidebar'
import { Overview } from './views/Overview'
import { BusinessUnits } from './views/BusinessUnits'
import { JobsLocations } from './views/JobsLocations'
import { EquipmentView } from './views/Equipment'
import { Employees } from './views/Employees'
import { DispatchSchedule } from './views/DispatchSchedule'

const views: Record<ViewId, React.FC> = {
  'overview': Overview,
  'business-units': BusinessUnits,
  'jobs-locations': JobsLocations,
  'equipment': EquipmentView,
  'employees': Employees,
  'dispatch': DispatchSchedule,
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>('overview')
  const ActiveComponent = views[activeView]

  return (
    <Layout activeView={activeView} onNavigate={setActiveView}>
      <ActiveComponent />
    </Layout>
  )
}

export default App
