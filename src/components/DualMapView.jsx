import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InteractiveMap from './InteractiveMap'

const DualMapView = ({ 
  routeData, 
  mapType = 'satellite',
  showOverlaps = true,
  onMapTypeChange
}) => {
  const { t } = useTranslation()
  const [syncEnabled, setSyncEnabled] = useState(false) // Default to disabled
  const [viewState, setViewState] = useState(null)
  const [layoutMode, setLayoutMode] = useState('combined') // 'individual', 'combined', or 'detail-overview'
  const [combinedKey, setCombinedKey] = useState(0) // Force remount of combined view
  const [mapBackgroundOpacity, setMapBackgroundOpacity] = useState(0.5) // 0 = fully greyed, 1 = normal
  const [showDirections, setShowDirections] = useState({ route1: false, route2: false }) // Internal state for directions per route - disabled by default
  const [routeVisibility, setRouteVisibility] = useState({ route1: true, route2: true }) // Route visibility state
  const [showKilometerMarkers, setShowKilometerMarkers] = useState({ route1: true, route2: true }) // Kilometer marker state - enabled by default
  const [showCommonSegments, setShowCommonSegments] = useState(true) // Common segments visibility - enabled by default
  const [highlightDifferences, setHighlightDifferences] = useState(true) // Difference highlighting overlay - enabled by default
  const [showDifferenceBoxes, setShowDifferenceBoxes] = useState(true) // Show difference area boxes - enabled by default
  const [isFullscreen, setIsFullscreen] = useState(false) // Fullscreen state
  const [isMobile, setIsMobile] = useState(false) // Mobile device detection
  
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
    }
    setLayoutMode(newMode)
  }
  
  const toggleRouteVisibility = (routeKey) => {
    setRouteVisibility(prev => ({
      ...prev,
      [routeKey]: !prev[routeKey]
    }))
  }
  
  const toggleFullscreen = () => {
    setIsFullscreen(prev => {
      const newFullscreenState = !prev
      
      // Force map resize after state change
      setTimeout(() => {
        if (map1Ref.current) {
          const map = map1Ref.current.getMap()
          if (map) {
            map.invalidateSize(true)
          }
        }
      }, 100)
      
      return newFullscreenState
    })
  }
  
  // Mobile device detection
  useEffect(() => {
    const checkIsMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || window.innerWidth <= 768
        || (window.ontouchstart !== undefined && window.innerWidth <= 1024)
      setIsMobile(isMobileDevice)
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    
    document.addEventListener('keydown', handleEscapeKey)
    return () => document.removeEventListener('keydown', handleEscapeKey)
  }, [isFullscreen])
  
  // Force map resize when entering/exiting fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (map1Ref.current) {
        const map = map1Ref.current.getMap()
        if (map) {
          // Force map to recalculate its size and positioning
          map.invalidateSize(true)
          
          // Trigger a bounds fit to ensure proper positioning
          if (routeData && routeData.bounds) {
            const bounds = [
              [routeData.bounds.south, routeData.bounds.west],
              [routeData.bounds.north, routeData.bounds.east]
            ]
            map.fitBounds(bounds, { padding: [20, 20] })
          }
        }
      }
    }, 300) // Increased timeout to ensure CSS changes are applied
    
    return () => clearTimeout(timer)
  }, [isFullscreen, routeData])
  
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
  
  
  if (isFullscreen) {
    return (
      <div className="dual-map-container fullscreen">
        {/* Fullscreen Exit Button */}
        <button 
          className="fullscreen-exit-button"
          onClick={toggleFullscreen}
          title={t('gpxCompare.exitFullscreen')}
        >
          ✕
        </button>
        
        {/* Compact Controls for Fullscreen */}
        <div className="fullscreen-controls">
          <div className="fullscreen-controls-group">
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={routeVisibility.route1}
                onChange={() => toggleRouteVisibility('route1')}
              />
              <span style={{ color: 'red' }}>{routeData?.route1?.name}</span>
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={routeVisibility.route2}
                onChange={() => toggleRouteVisibility('route2')}
              />
              <span style={{ color: 'blue' }}>{routeData?.route2?.name}</span>
            </label>
          </div>
          
          <div className="fullscreen-controls-group">
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showDirections.route1}
                onChange={(e) => setShowDirections(prev => ({ ...prev, route1: e.target.checked }))}
              />
              {t('gpxCompare.showDirectionsRoute1')}
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showDirections.route2}
                onChange={(e) => setShowDirections(prev => ({ ...prev, route2: e.target.checked }))}
              />
              {t('gpxCompare.showDirectionsRoute2')}
            </label>
          </div>
          
          <div className="fullscreen-controls-group">
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showKilometerMarkers.route1}
                onChange={(e) => setShowKilometerMarkers(prev => ({ ...prev, route1: e.target.checked }))}
              />
              {t('gpxCompare.kmMarkersRoute1')}
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showKilometerMarkers.route2}
                onChange={(e) => setShowKilometerMarkers(prev => ({ ...prev, route2: e.target.checked }))}
              />
              {t('gpxCompare.kmMarkersRoute2')}
            </label>
          </div>
          
          <div className="fullscreen-controls-group">
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
          
          <div className="fullscreen-controls-group">
            <div className="map-type-toggle">
              <button 
                className={`map-type-button ${mapType === 'satellite' ? 'active' : ''}`}
                onClick={() => onMapTypeChange && onMapTypeChange('satellite')}
              >
                🛰️ {t('gpxCompare.satellite')}
              </button>
              <button 
                className={`map-type-button ${mapType === 'street' ? 'active' : ''}`}
                onClick={() => onMapTypeChange && onMapTypeChange('street')}
              >
                🗺️ {t('gpxCompare.streetMap')}
              </button>
            </div>
          </div>
        </div>

        {/* Fullscreen Map */}
        <div className="fullscreen-map">
          <InteractiveMap
            key={`fullscreen-map-${combinedKey}`}
            ref={map1Ref}
            routeData={{
              route1: routeVisibility.route1 ? routeData.route1 : null,
              route2: routeVisibility.route2 ? routeData.route2 : null,
              bounds: routeData.bounds,
              overlaps: routeData.overlaps
            }}
            mapType={mapType}
            onViewChange={null}
            syncView={null}
            showDirections={showDirections}
            showOverlaps={showOverlaps}
            backgroundOpacity={mapBackgroundOpacity}
            showKilometerMarkers={showKilometerMarkers}
            highlightDifferences={highlightDifferences}
            showDifferenceBoxes={showDifferenceBoxes}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`dual-map-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Map Controls */}
      <div className="map-controls">
        <div className="control-group view-controls">
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
              checked={showDirections.route1}
              onChange={(e) => setShowDirections(prev => ({ ...prev, route1: e.target.checked }))}
            />
            {t('gpxCompare.showDirectionsRoute1')}
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={showDirections.route2}
              onChange={(e) => setShowDirections(prev => ({ ...prev, route2: e.target.checked }))}
            />
            {t('gpxCompare.showDirectionsRoute2')}
          </label>
        </div>
        
        <div className="control-group">
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={showKilometerMarkers.route1}
              onChange={(e) => setShowKilometerMarkers(prev => ({ ...prev, route1: e.target.checked }))}
            />
            {t('gpxCompare.kmMarkersRoute1')}
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={showKilometerMarkers.route2}
              onChange={(e) => setShowKilometerMarkers(prev => ({ ...prev, route2: e.target.checked }))}
            />
            {t('gpxCompare.kmMarkersRoute2')}
          </label>
        </div>
        
        <div className="control-group">
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={showCommonSegments}
              onChange={(e) => setShowCommonSegments(e.target.checked)}
            />
            {t('gpxCompare.showCommonSegments')}
          </label>
        </div>
        
        <div className="control-group">
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={highlightDifferences}
              onChange={(e) => setHighlightDifferences(e.target.checked)}
            />
            Highlight Differences
          </label>
        </div>
        
        <div className="control-group">
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={showDifferenceBoxes}
              onChange={(e) => setShowDifferenceBoxes(e.target.checked)}
            />
            Show Difference Boxes
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
      
      {/* Map Background Controls */}
      <div className="map-background-controls">
        <h3>{t('gpxCompare.mapBackground')}</h3>
        <div className="map-type-toggle">
          <button 
            className={`map-type-button ${mapType === 'satellite' ? 'active' : ''}`}
            onClick={() => onMapTypeChange && onMapTypeChange('satellite')}
          >
            🛰️ {t('gpxCompare.satellite')}
          </button>
          <button 
            className={`map-type-button ${mapType === 'street' ? 'active' : ''}`}
            onClick={() => onMapTypeChange && onMapTypeChange('street')}
          >
            🗺️ {t('gpxCompare.streetMap')}
          </button>
        </div>
      </div>
      
      {/* Route Legend */}
      <div className="route-legend">
        <div 
          className={`route-legend-item ${!routeVisibility.route1 ? 'hidden-route' : ''}`}
          onClick={() => toggleRouteVisibility('route1')}
          title={`${t('gpxCompare.clickToToggle')} ${routeData.route1.name}`}
        >
          <div 
            className="route-color-indicator" 
            style={{ 
              backgroundColor: 'red',
              opacity: routeVisibility.route1 ? 1 : 0.3
            }}
          ></div>
          <span className="route-name">{routeData.route1.name}</span>
          <span className="visibility-indicator">
            {routeVisibility.route1 ? '👁️' : '🚫'}
          </span>
        </div>
        <div 
          className={`route-legend-item ${!routeVisibility.route2 ? 'hidden-route' : ''}`}
          onClick={() => toggleRouteVisibility('route2')}
          title={`${t('gpxCompare.clickToToggle')} ${routeData.route2.name}`}
        >
          <div 
            className="route-color-indicator" 
            style={{ 
              backgroundColor: 'blue',
              opacity: routeVisibility.route2 ? 1 : 0.3
            }}
          ></div>
          <span className="route-name">{routeData.route2.name}</span>
          <span className="visibility-indicator">
            {routeVisibility.route2 ? '👁️' : '🚫'}
          </span>
        </div>
        
        {/* Difference areas legend */}
        <div className="route-legend-item difference-areas">
          <div 
            className="route-color-indicator" 
            style={{ 
              backgroundColor: 'transparent',
              border: '2px dashed darkblue',
              opacity: 1
            }}
          ></div>
          <span className="route-name">Difference Areas</span>
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
                  route1: routeVisibility.route1 ? routeData.route1 : null,
                  route2: null, // Don't show route2
                  bounds: routeData.bounds
                }}
                mapType={mapType}
                onViewChange={syncEnabled ? handleViewChange : null}
                syncView={syncEnabled ? viewState : null}
                showDirections={showDirections}
                showOverlaps={false}
                backgroundOpacity={mapBackgroundOpacity}
                showKilometerMarkers={showKilometerMarkers}
                showCommonSegments={showCommonSegments}
                highlightDifferences={highlightDifferences}
                showDifferenceBoxes={showDifferenceBoxes}
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
                  route2: routeVisibility.route2 ? routeData.route2 : null,
                  bounds: routeData.bounds
                }}
                mapType={mapType}
                onViewChange={syncEnabled ? handleViewChange : null} // Both maps can control sync
                syncView={syncEnabled ? viewState : null}
                showDirections={showDirections}
                showOverlaps={false}
                backgroundOpacity={mapBackgroundOpacity}
                showKilometerMarkers={showKilometerMarkers}
                showCommonSegments={showCommonSegments}
                highlightDifferences={highlightDifferences}
                showDifferenceBoxes={showDifferenceBoxes}
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
                routeData={{
                  route1: routeVisibility.route1 ? routeData.route1 : null,
                  route2: routeVisibility.route2 ? routeData.route2 : null,
                  bounds: routeData.bounds,
                  overlaps: routeData.overlaps
                }}
                mapType={mapType}
                onViewChange={null} // No sync for detail view
                syncView={null}
                showDirections={showDirections}
                showOverlaps={showOverlaps}
                backgroundOpacity={mapBackgroundOpacity}
                showKilometerMarkers={showKilometerMarkers}
                showCommonSegments={showCommonSegments}
                highlightDifferences={highlightDifferences}
                showDifferenceBoxes={showDifferenceBoxes}
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
                  route1: routeVisibility.route1 ? {
                    ...routeData.route1,
                    points: routeData.route1.points.filter((_, i) => i % 5 === 0),
                    arrows: [] // No arrows in overview
                  } : null,
                  route2: routeVisibility.route2 ? {
                    ...routeData.route2,
                    points: routeData.route2.points.filter((_, i) => i % 5 === 0),
                    arrows: [] // No arrows in overview
                  } : null
                }}
                mapType={mapType}
                onViewChange={null}
                syncView={null}
                showDirections={{ route1: false, route2: false }}
                showOverlaps={false}
                backgroundOpacity={mapBackgroundOpacity}
                showKilometerMarkers={{ route1: false, route2: false }}
                highlightDifferences={highlightDifferences}
                showDifferenceBoxes={showDifferenceBoxes}
              />
            </div>
          </>
        ) : (
          /* Combined Mode - Single Map with Both Routes */
          <div className="map-panel">
            <div className="map-panel-header">
              <h4>{t('gpxCompare.combinedComparison')}</h4>
              {!isMobile && (
                <button
                  className="fullscreen-button"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? t('gpxCompare.exitFullscreen') : t('gpxCompare.enterFullscreen')}
                >
                  {isFullscreen ? '⊖' : '⊞'}
                </button>
              )}
            </div>
            <InteractiveMap
              key={`combined-map-${combinedKey}`}
              ref={map1Ref}
              routeData={{
                route1: routeVisibility.route1 ? routeData.route1 : null,
                route2: routeVisibility.route2 ? routeData.route2 : null,
                bounds: routeData.bounds,
                overlaps: routeData.overlaps
              }}
              mapType={mapType}
              onViewChange={null} // No sync needed for single map
              syncView={null}
              showDirections={showDirections}
              showOverlaps={showOverlaps}
              backgroundOpacity={mapBackgroundOpacity}
              showKilometerMarkers={showKilometerMarkers}
              highlightDifferences={highlightDifferences}
              showDifferenceBoxes={showDifferenceBoxes}
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