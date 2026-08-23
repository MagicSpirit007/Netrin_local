import { Routes, Route, useLocation } from 'react-router-dom'
import { BottomNav } from './components/domain/BottomNav'
import { tabItems } from './manifest'
import { screenForTab, pathForTab } from './routes'
import { WorkshopScreen } from './screens/WorkshopScreen'
import { NetrinStateProvider } from './state/NetrinState'

// Mobile-first app shell (390x844 frame). Routes AND the bottom tabs are both
// generated from manifest.navigation.items (Cell Contract Rule 2). Home is the
// full-bleed map surface; the other tabs scroll.
export function App() {
  const location = useLocation()
  const isHome = location.pathname === pathForTab('home')

  return (
    <NetrinStateProvider>
      <div className="app-frame">
        <main className={`app-content ${isHome ? 'app-content--fixed' : 'app-content--scroll'}`}>
          <Routes>
            {tabItems.map((id) => {
              const Screen = screenForTab[id]
              return Screen ? <Route key={id} path={pathForTab(id)} element={<Screen />} /> : null
            })}
            <Route path="/workshop" element={<WorkshopScreen />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </NetrinStateProvider>
  )
}
