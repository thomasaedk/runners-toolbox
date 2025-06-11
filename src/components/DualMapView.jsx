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
  const [layoutMode, setLayoutMode] = useState('comparison') // 'combined' or 'comparison'
  const [combinedKey, setCombinedKey] = useState(0) // Force remount of combined view
  const [mapBackgroundOpacity, setMapBackgroundOpacity] = useState(0.5) // 0 = fully greyed, 1 = normal
  const [showDirections, setShowDirections] = useState({ route1: false, route2: false }) // Internal state for directions per route - disabled by default
  const [routeVisibility, setRouteVisibility] = useState({ route1: true, route2: true }) // Route visibility state
  const [showKilometerMarkers, setShowKilometerMarkers] = useState({ route1: true, route2: true }) // Kilometer marker state - enabled by default
  const [showStartEndMarkers, setShowStartEndMarkers] = useState({ route1: true, route2: true }) // Start/end marker state - enabled by default
  const [isFullscreen, setIsFullscreen] = useState(false) // Fullscreen state
  const [isMobile, setIsMobile] = useState(false) // Mobile device detection
  const [proximityThreshold, setProximityThreshold] = useState(50) // Meters - user setting for bundling close routes
  const [showCommonSegments, setShowCommonSegments] = useState(true) // Toggle for common segments
  const [showDifferenceSegments, setShowDifferenceSegments] = useState(true) // Toggle for difference segments
  const [showCommonDirections, setShowCommonDirections] = useState(false) // Toggle for common segments direction arrows
  const [showCommonKilometerMarkers, setShowCommonKilometerMarkers] = useState(false) // Toggle for common segments KM markers
  
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
    if (newMode === 'combined' || newMode === 'comparison') {
      setCombinedKey(prev => prev + 1) // Force remount when switching views
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
      
      // Add/remove body class for fullscreen state
      if (newFullscreenState) {
        document.body.classList.add('fullscreen-active')
      } else {
        document.body.classList.remove('fullscreen-active')
      }
      
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
  
  // Cleanup body class on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('fullscreen-active')
    }
  }, [])
  
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
        
        {/* Simplified Fullscreen Controls */}
        <div className="fullscreen-controls">
          {/* Current View Display */}
          <div className="fullscreen-view-display">
            <span className="fullscreen-view-label">
              {layoutMode === 'comparison' ? '🔍 ' + t('gpxCompare.differences') : '🗺️ ' + t('gpxCompare.routes')}
            </span>
          </div>
          
          {/* Map Settings */}
          <div className="fullscreen-map-settings">
            <button 
              className={`fullscreen-map-btn ${mapType === 'satellite' ? 'active' : ''}`}
              onClick={() => onMapTypeChange && onMapTypeChange('satellite')}
            >
              🛰️ {t('gpxCompare.satellite')}
            </button>
            <button 
              className={`fullscreen-map-btn ${mapType === 'street' ? 'active' : ''}`}
              onClick={() => onMapTypeChange && onMapTypeChange('street')}
            >
              🗺️ {t('gpxCompare.street')}
            </button>
          </div>
          
          {/* Quick Options */}
          {layoutMode === 'comparison' && (
            <div className="fullscreen-quick-options">
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={showCommonSegments}
                  onChange={(e) => setShowCommonSegments(e.target.checked)}
                />
                {t('gpxCompare.showCommonParts', 'Common')}
              </label>
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={showDifferenceSegments}
                  onChange={(e) => setShowDifferenceSegments(e.target.checked)}
                />
                {t('gpxCompare.showDifferences', 'Differences')}
              </label>
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={showStartEndMarkers.route1 || showStartEndMarkers.route2}
                  onChange={(e) => setShowStartEndMarkers({ route1: e.target.checked, route2: e.target.checked })}
                />
                {t('gpxCompare.showStartEndMarkers', 'Start/End')}
              </label>
              <div className="fullscreen-opacity-control">
                <label className="fullscreen-opacity-label">
                  {t('gpxCompare.mapOpacity', 'Opacity')}: {Math.round(mapBackgroundOpacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={mapBackgroundOpacity}
                  onChange={(e) => setMapBackgroundOpacity(parseFloat(e.target.value))}
                  className="fullscreen-opacity-slider"
                />
              </div>
            </div>
          )}
          
          {layoutMode === 'combined' && (
            <div className="fullscreen-quick-options">
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={showDirections.route1 || showDirections.route2}
                  onChange={(e) => setShowDirections({ route1: e.target.checked, route2: e.target.checked })}
                />
                {t('gpxCompare.showArrows', 'Arrows')}
              </label>
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={showKilometerMarkers.route1 || showKilometerMarkers.route2}
                  onChange={(e) => setShowKilometerMarkers({ route1: e.target.checked, route2: e.target.checked })}
                />
                {t('gpxCompare.showKilometerMarkers', 'KM')}
              </label>
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={routeVisibility.route1}
                  onChange={() => toggleRouteVisibility('route1')}
                />
                <span className="route-color-dot" style={{ backgroundColor: routeData?.route1?.color }}></span>
                {routeData?.route1?.name}
              </label>
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={routeVisibility.route2}
                  onChange={() => toggleRouteVisibility('route2')}
                />
                <span className="route-color-dot" style={{ backgroundColor: routeData?.route2?.color }}></span>
                {routeData?.route2?.name}
              </label>
              <label className="fullscreen-toggle">
                <input
                  type="checkbox"
                  checked={showStartEndMarkers.route1 || showStartEndMarkers.route2}
                  onChange={(e) => setShowStartEndMarkers({ route1: e.target.checked, route2: e.target.checked })}
                />
                {t('gpxCompare.showStartEndMarkers', 'Start/End')}
              </label>
              <div className="fullscreen-opacity-control">
                <label className="fullscreen-opacity-label">
                  {t('gpxCompare.mapOpacity', 'Opacity')}: {Math.round(mapBackgroundOpacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={mapBackgroundOpacity}
                  onChange={(e) => setMapBackgroundOpacity(parseFloat(e.target.value))}
                  className="fullscreen-opacity-slider"
                />
              </div>
            </div>
          )}
        </div>

        {/* Fullscreen Map */}
        <div className="fullscreen-map">
          <InteractiveMap
            key={`fullscreen-map-${combinedKey}-${layoutMode}`}
            ref={map1Ref}
            routeData={{
              route1: routeVisibility.route1 ? routeData.route1 : null,
              route2: routeVisibility.route2 ? routeData.route2 : null,
              bounds: routeData.bounds,
              overlaps: routeData.overlaps,
              proximityThreshold: proximityThreshold,
              highlightDifferences: layoutMode === 'comparison',
              showCommonSegments: showCommonSegments,
              showDifferenceSegments: showDifferenceSegments,
              showCommonDirections: showCommonDirections,
              showCommonKilometerMarkers: showCommonKilometerMarkers
            }}
            mapType={mapType}
            onViewChange={null}
            syncView={null}
            showDirections={showDirections}
            showOverlaps={showOverlaps}
            backgroundOpacity={mapBackgroundOpacity}
            showKilometerMarkers={showKilometerMarkers}
            showStartEndMarkers={showStartEndMarkers}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`route-comparison-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header with view toggle and dynamic content */}
      <div className="comparison-header">
        <div className="view-toggle">
          <button
            className={`view-button ${layoutMode === 'comparison' ? 'active' : ''}`}
            onClick={() => handleLayoutModeChange('comparison')}
          >
            <span className="button-icon">🔍</span>
            <span className="button-text">{t('gpxCompare.differences')}</span>
          </button>
          <button
            className={`view-button ${layoutMode === 'combined' ? 'active' : ''}`}
            onClick={() => handleLayoutModeChange('combined')}
          >
            <span className="button-icon">🗺️</span>
            <span className="button-text">{t('gpxCompare.routes')}</span>
          </button>
        </div>
        
        <div className="comparison-title">
          <h3>
            {layoutMode === 'comparison' 
              ? t('gpxCompare.routeDifferences', 'Route Differences')
              : t('gpxCompare.bothRoutes', 'Both Routes')}
          </h3>
          <p className="comparison-subtitle">
            {layoutMode === 'comparison' 
              ? t('gpxCompare.differencesExplanation', 'Purple shows common path, colored shows unique parts')
              : t('gpxCompare.routesExplanation', 'View both routes overlaid on the same map')}
          </p>
        </div>
      </div>
      
      {/* Analysis Controls */}
      <div className="analysis-controls">
        <div className="controls-header">
          <h4>{t('gpxCompare.analysisOptions', 'Analysis Options')}</h4>
        </div>
        
        <div className="controls-row">
          <div className="control-group">
            <label className="control-label">{t('gpxCompare.mapType', 'Map Type')}</label>
            <div className="map-settings">
              <button 
                className={`map-type-btn ${mapType === 'satellite' ? 'active' : ''}`}
                onClick={() => onMapTypeChange && onMapTypeChange('satellite')}
              >
                🛰️ {t('gpxCompare.satellite')}
              </button>
              <button 
                className={`map-type-btn ${mapType === 'street' ? 'active' : ''}`}
                onClick={() => onMapTypeChange && onMapTypeChange('street')}
              >
                🗺️ {t('gpxCompare.street', 'Street')}
              </button>
            </div>
          </div>
        </div>
        
        {/* Advanced Options */}
        {(layoutMode === 'comparison' || layoutMode === 'combined') && (
          <details className="advanced-options">
            <summary>{t('gpxCompare.advancedOptions', 'Advanced Options')}</summary>
            <div className="options-content">
              {layoutMode === 'comparison' && (
                <>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={showCommonSegments}
                      onChange={(e) => setShowCommonSegments(e.target.checked)}
                    />
                    {t('gpxCompare.showCommonParts', 'Show Common Parts')}
                  </label>
                  
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={showDifferenceSegments}
                      onChange={(e) => setShowDifferenceSegments(e.target.checked)}
                    />
                    {t('gpxCompare.showDifferences', 'Show Differences')}
                  </label>
                  
                  <div className="option-slider">
                    <label>{t('gpxCompare.sensitivity', 'Sensitivity')}: {proximityThreshold}m</label>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="10"
                      value={proximityThreshold}
                      onChange={(e) => setProximityThreshold(parseInt(e.target.value))}
                    />
                  </div>
                  
                  <div className="option-slider">
                    <label>{t('gpxCompare.mapOpacity', 'Map Opacity')}: {Math.round(mapBackgroundOpacity * 100)}%</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={mapBackgroundOpacity}
                      onChange={(e) => setMapBackgroundOpacity(parseFloat(e.target.value))}
                    />
                  </div>
                  
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={showStartEndMarkers.route1 || showStartEndMarkers.route2}
                      onChange={(e) => setShowStartEndMarkers({ route1: e.target.checked, route2: e.target.checked })}
                    />
                    {t('gpxCompare.showStartEndMarkers', 'Show Start/End Markers')}
                  </label>
                </>
              )}
              
              {layoutMode === 'combined' && (
                <>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={showDirections.route1 || showDirections.route2}
                      onChange={(e) => setShowDirections({ route1: e.target.checked, route2: e.target.checked })}
                    />
                    {t('gpxCompare.showArrows', 'Show Direction Arrows')}
                  </label>
                  
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={showKilometerMarkers.route1 || showKilometerMarkers.route2}
                      onChange={(e) => setShowKilometerMarkers({ route1: e.target.checked, route2: e.target.checked })}
                    />
                    {t('gpxCompare.showKilometerMarkers', 'Show KM Markers')}
                  </label>
                  
                  <div className="option-slider">
                    <label>{t('gpxCompare.mapOpacity', 'Map Opacity')}: {Math.round(mapBackgroundOpacity * 100)}%</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={mapBackgroundOpacity}
                      onChange={(e) => setMapBackgroundOpacity(parseFloat(e.target.value))}
                    />
                  </div>
                  
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={showStartEndMarkers.route1 || showStartEndMarkers.route2}
                      onChange={(e) => setShowStartEndMarkers({ route1: e.target.checked, route2: e.target.checked })}
                    />
                    {t('gpxCompare.showStartEndMarkers', 'Show Start/End Markers')}
                  </label>
                  
                  <div className="route-visibility">
                    <label className="route-toggle">
                      <input
                        type="checkbox"
                        checked={routeVisibility.route1}
                        onChange={() => toggleRouteVisibility('route1')}
                      />
                      <span className="route-indicator" style={{ backgroundColor: routeData.route1.color }}></span>
                      {routeData.route1.name}
                    </label>
                    
                    <label className="route-toggle">
                      <input
                        type="checkbox"
                        checked={routeVisibility.route2}
                        onChange={() => toggleRouteVisibility('route2')}
                      />
                      <span className="route-indicator" style={{ backgroundColor: routeData.route2.color }}></span>
                      {routeData.route2.name}
                    </label>
                  </div>
                </>
              )}
            </div>
          </details>
        )}
      </div>
      
      {/* Maps Container */}
      <div className={`maps-container ${layoutMode}`}>
        {layoutMode === 'comparison' ? (
          /* Comparison Mode - Single Map with Route Differences Highlighted */
          <>
            <div className="map-panel">
              <div className="map-panel-header">
                <h4>{t('gpxCompare.routeComparison')}</h4>
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
                key={`comparison-map-${combinedKey}`}
                ref={map1Ref}
                routeData={{
                  route1: routeVisibility.route1 ? routeData.route1 : null,
                  route2: routeVisibility.route2 ? routeData.route2 : null,
                  bounds: routeData.bounds,
                  overlaps: routeData.overlaps,
                  proximityThreshold: proximityThreshold,
                  highlightDifferences: true,
                  showCommonSegments: showCommonSegments,
                  showDifferenceSegments: showDifferenceSegments,
                  showCommonDirections: showCommonDirections,
                  showCommonKilometerMarkers: showCommonKilometerMarkers
                }}
                mapType={mapType}
                onViewChange={null}
                syncView={null}
                showDirections={showDirections}
                showOverlaps={true}
                backgroundOpacity={mapBackgroundOpacity}
                showKilometerMarkers={showKilometerMarkers}
                showStartEndMarkers={showStartEndMarkers}
              />
            </div>
            
            {/* Color Legend for Differences View */}
            <div className="color-legend">
              <h5>{t('gpxCompare.colorLegend', 'Color Legend')}</h5>
              <div className="legend-items">
                <div className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: '#D946EF' }}></div>
                  <span>{t('gpxCompare.commonPath', 'Common Path')}</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: routeData.route1.color }}></div>
                  <span>{routeData.route1.name} {t('gpxCompare.uniqueParts', 'unique parts')}</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: routeData.route2.color }}></div>
                  <span>{routeData.route2.name} {t('gpxCompare.uniqueParts', 'unique parts')}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Combined Mode - Single Map with Both Routes */
          <>
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
                  overlaps: routeData.overlaps,
                  highlightDifferences: false
                }}
                mapType={mapType}
                onViewChange={null} // No sync needed for single map
                syncView={null}
                showDirections={showDirections}
                showOverlaps={showOverlaps}
                backgroundOpacity={mapBackgroundOpacity}
                showKilometerMarkers={showKilometerMarkers}
                showStartEndMarkers={showStartEndMarkers}
              />
            </div>
            
            {/* Color Legend for Routes View */}
            <div className="color-legend">
              <h5>{t('gpxCompare.colorLegend', 'Color Legend')}</h5>
              <div className="legend-items">
                <div className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: routeData.route1.color }}></div>
                  <span>{routeData.route1.name}</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: routeData.route2.color }}></div>
                  <span>{routeData.route2.name}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
    </div>
  )
}

export default DualMapView