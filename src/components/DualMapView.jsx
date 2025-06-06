import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import InteractiveMap from './InteractiveMap'

const DualMapView = ({ 
  routeData, 
  mapType = 'satellite',
  showDirections: propShowDirections = true,
  showOverlaps = true 
}) => {
  const { t } = useTranslation()
  const [syncEnabled, setSyncEnabled] = useState(false) // Default to disabled
  const [viewState, setViewState] = useState(null)
  const [layoutMode, setLayoutMode] = useState('combined') // 'individual', 'combined', or 'detail-overview'
  const [combinedKey, setCombinedKey] = useState(0) // Force remount of combined view
  const [mapBackgroundOpacity, setMapBackgroundOpacity] = useState(0.5) // 0 = fully greyed, 1 = normal
  const [showDirections, setShowDirections] = useState(propShowDirections) // Internal state for directions
  
  const map1Ref = useRef()
  const map2Ref = useRef()
  
  const debounceTimeoutRef = useRef()
  
  const handleViewChange = useCallback((newView) => {
    if (syncEnabled) {
      // Clear previous timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      
      // Set new timeout
      debounceTimeoutRef.current = setTimeout(() => {
        setViewState(newView)
      }, 100)
    }
  }, [syncEnabled])
  
  const handleLayoutModeChange = (newMode) => {
    if (newMode === 'combined') {
      setCombinedKey(prev => prev + 1) // Force remount when switching to combined
      console.log('Switching to combined view, routeData:', routeData)
    }
    setLayoutMode(newMode)
  }
  
  const handleZoomIn = () => {
    if (map1Ref.current && map2Ref.current) {
      const map1 = map1Ref.current.getMap()
      const map2 = map2Ref.current.getMap()
      if (map1 && map2) {
        const currentZoom = map1.getZoom()
        map1.setZoom(currentZoom + 1)
        if (syncEnabled) {
          map2.setZoom(currentZoom + 1)
        }
      }
    }
  }
  
  const handleZoomOut = () => {
    if (map1Ref.current && map2Ref.current) {
      const map1 = map1Ref.current.getMap()
      const map2 = map2Ref.current.getMap()
      if (map1 && map2) {
        const currentZoom = map1.getZoom()
        map1.setZoom(currentZoom - 1)
        if (syncEnabled) {
          map2.setZoom(currentZoom - 1)
        }
      }
    }
  }
  
  const handleFitBounds = () => {
    if (map1Ref.current && map2Ref.current && routeData) {
      const map1 = map1Ref.current.getMap()
      const map2 = map2Ref.current.getMap()
      if (map1 && map2 && routeData.bounds) {
        const bounds = [
          [routeData.bounds.south, routeData.bounds.west],
          [routeData.bounds.north, routeData.bounds.east]
        ]
        map1.fitBounds(bounds, { padding: [20, 20] })
        if (syncEnabled) {
          map2.fitBounds(bounds, { padding: [20, 20] })
        }
      }
    }
  }
  
  if (!routeData) {
    return (
      <div className="dual-map-placeholder">
        <p>{t('gpxCompare.noData')}</p>
      </div>
    )
  }
  
  
  return (
    <div className="dual-map-container">
      {/* Map Controls */}
      <div className="map-controls">
        <div className="control-group">
          <button
            className={`control-button ${layoutMode === 'individual' ? 'active' : ''}`}
            onClick={() => handleLayoutModeChange('individual')}
            title={t('gpxCompare.individualMaps')}
          >
            🗺️ | 🗺️
          </button>
          <button
            className={`control-button ${layoutMode === 'combined' ? 'active' : ''}`}
            onClick={() => handleLayoutModeChange('combined')}
            title={t('gpxCompare.combinedView')}
          >
            🗺️
          </button>
        </div>
        
        <div className="control-group">
          <button
            className={`control-button ${syncEnabled ? 'active' : ''}`}
            onClick={() => setSyncEnabled(!syncEnabled)}
            title={t('gpxCompare.syncMaps')}
            disabled={layoutMode !== 'individual'}
          >
            🔗
          </button>
        </div>
        
        <div className="control-group">
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={showDirections}
              onChange={(e) => setShowDirections(e.target.checked)}
            />
            {t('gpxCompare.showDirections')}
          </label>
        </div>
        
        <div className="control-group">
          <label className="opacity-control">
            <span className="opacity-label">{t('gpxCompare.mapOpacity', 'Map Opacity')}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={mapBackgroundOpacity}
              onChange={(e) => setMapBackgroundOpacity(parseFloat(e.target.value))}
              className="opacity-slider"
            />
            <span className="opacity-value">{Math.round(mapBackgroundOpacity * 100)}%</span>
          </label>
        </div>
      </div>
      
      {/* Route Legend */}
      <div className="route-legend">
        <div className="route-legend-item">
          <div 
            className="route-color-indicator" 
            style={{ backgroundColor: routeData.route1.color }}
          ></div>
          <span className="route-name">{routeData.route1.name}</span>
        </div>
        <div className="route-legend-item">
          <div 
            className="route-color-indicator" 
            style={{ backgroundColor: routeData.route2.color }}
          ></div>
          <span className="route-name">{routeData.route2.name}</span>
        </div>
      </div>
      
      {/* Maps Container */}
      <div className={`maps-container ${layoutMode}`}>
        {layoutMode === 'individual' ? (
          <>
            {/* Left Map - Route 1 Only */}
            <div className="map-panel">
              <div className="map-panel-header">
                <h4>{routeData.route1.name} {t('gpxCompare.only')}</h4>
              </div>
              <InteractiveMap
                key="individual-map1"
                ref={map1Ref}
                routeData={{
                  route1: routeData.route1,
                  route2: null, // Don't show route2
                  bounds: routeData.bounds
                }}
                mapType={mapType}
                onViewChange={syncEnabled ? handleViewChange : null}
                syncView={syncEnabled ? viewState : null}
                showDirections={showDirections}
                showOverlaps={false}
                backgroundOpacity={mapBackgroundOpacity}
              />
            </div>
            
            {/* Right Map - Route 2 Only */}
            <div className="map-panel">
              <div className="map-panel-header">
                <h4>{routeData.route2.name} {t('gpxCompare.only')}</h4>
              </div>
              <InteractiveMap
                key="individual-map2"
                ref={map2Ref}
                routeData={{
                  route1: null, // Don't show route1
                  route2: routeData.route2,
                  bounds: routeData.bounds
                }}
                mapType={mapType}
                onViewChange={syncEnabled ? handleViewChange : null} // Both maps can control sync
                syncView={syncEnabled ? viewState : null}
                showDirections={showDirections}
                showOverlaps={false}
                backgroundOpacity={mapBackgroundOpacity}
              />
            </div>
          </>
        ) : layoutMode === 'detail-overview' ? (
          <>
            {/* Left Map - Detailed View */}
            <div className="map-panel">
              <div className="map-panel-header">
                <h4>{t('gpxCompare.detailView')}</h4>
              </div>
              <InteractiveMap
                key="detail-map"
                ref={map1Ref}
                routeData={routeData}
                mapType={mapType}
                onViewChange={null} // No sync for detail view
                syncView={null}
                showDirections={showDirections}
                showOverlaps={showOverlaps}
                backgroundOpacity={mapBackgroundOpacity}
              />
            </div>
            
            {/* Right Map - Overview */}
            <div className="map-panel">
              <div className="map-panel-header">
                <h4>{t('gpxCompare.overviewMap')}</h4>
              </div>
              <InteractiveMap
                key="overview-map"
                ref={map2Ref}
                routeData={{
                  ...routeData,
                  // Simplify routes for overview (every 5th point)
                  route1: {
                    ...routeData.route1,
                    points: routeData.route1.points.filter((_, i) => i % 5 === 0),
                    arrows: [] // No arrows in overview
                  },
                  route2: {
                    ...routeData.route2,
                    points: routeData.route2.points.filter((_, i) => i % 5 === 0),
                    arrows: [] // No arrows in overview
                  }
                }}
                mapType={mapType}
                onViewChange={null}
                syncView={null}
                showDirections={false}
                showOverlaps={false}
                backgroundOpacity={mapBackgroundOpacity}
              />
            </div>
          </>
        ) : (
          /* Combined Mode - Single Map with Both Routes */
          <div className="map-panel">
            <div className="map-panel-header">
              <h4>{t('gpxCompare.combinedComparison')}</h4>
            </div>
            <InteractiveMap
              key={`combined-map-${combinedKey}`}
              ref={map1Ref}
              routeData={routeData}
              mapType={mapType}
              onViewChange={null} // No sync needed for single map
              syncView={null}
              showDirections={showDirections}
              showOverlaps={showOverlaps}
              backgroundOpacity={mapBackgroundOpacity}
            />
          </div>
        )}
      </div>
      
      {/* Stats Panel */}
      <div className="stats-panel">
        <div className="stat-item">
          <span className="stat-label">{t('gpxCompare.totalPoints')}:</span>
          <span className="stat-value">
            {routeData.route1.points.length + routeData.route2.points.length}
          </span>
        </div>
        
        {routeData.overlaps && routeData.overlaps.length > 0 && (
          <div className="stat-item">
            <span className="stat-label">{t('gpxCompare.overlapPoints')}:</span>
            <span className="stat-value">{routeData.overlaps.length}</span>
          </div>
        )}
        
        <div className="stat-item">
          <span className="stat-label">{t('gpxCompare.viewMode')}:</span>
          <span className="stat-value">
            {layoutMode === 'individual' ? t('gpxCompare.individualMaps') :
             layoutMode === 'detail-overview' ? t('gpxCompare.detailOverview') :
             t('gpxCompare.combinedView')}
          </span>
        </div>
      </div>
    </div>
  )
}

export default DualMapView