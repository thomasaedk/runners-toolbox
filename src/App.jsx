import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import GpxCompareTool from './components/GpxCompareTool'
import PlaceholderTool from './components/PlaceholderTool'
import RoutePlanner from './components/RoutePlanner'
import LanguageSwitcher from './components/LanguageSwitcher'

function App() {
  const [activeTab, setActiveTab] = useState('tool2')
  const [gpxToolState, setGpxToolState] = useState({ hasUnsavedWork: false, loading: false })
  const [routePlannerState, setRoutePlannerState] = useState({ hasRoute: false, isPlanning: false })
  const { t } = useTranslation()

  // Update document title when language changes
  useEffect(() => {
    document.title = t('title')
  }, [t])

  const handleTabChange = (newTab) => {
    // If switching away from GPX Compare and there's unsaved work, show warning
    if (activeTab === 'gpx-compare' && newTab !== 'gpx-compare' && gpxToolState.hasUnsavedWork) {
      const confirmed = window.confirm(t('gpxCompare.warnings.tabSwitch'))
      if (!confirmed) {
        return
      }
    }
    
    // If switching away from Route Planner and there's a route, show warning
    if (activeTab === 'tool2' && newTab !== 'tool2' && routePlannerState.hasRoute) {
      const confirmed = window.confirm('You have a route in progress. Switching tabs will lose your route. Continue?')
      if (!confirmed) {
        return
      }
    }
    
    setActiveTab(newTab)
  }

  return (
    <div className="app">
      <LanguageSwitcher />
      <header className="app-header">
        <h1>{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'tool2' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('tool2')}
        >
          {t('tabs.tool2')}
        </button>
        <button
          className={activeTab === 'gpx-compare' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('gpx-compare')}
        >
          {t('tabs.gpxCompare')}
        </button>
        <button
          className={activeTab === 'tool3' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('tool3')}
        >
          {t('tabs.tool3')}
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'gpx-compare' && <GpxCompareTool onStateChange={setGpxToolState} />}
        {activeTab === 'tool2' && <RoutePlanner onStateChange={setRoutePlannerState} />}
        {activeTab === 'tool3' && <PlaceholderTool name={t('tabs.tool3')} />}
      </main>
    </div>
  )
}

export default App
