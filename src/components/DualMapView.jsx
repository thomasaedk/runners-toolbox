import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InteractiveMap from './InteractiveMap'

const DualMapView = ({ 
  routeData, 
  mapType = 'satellite',
  showOverlaps = true,
  onMapTypeChange,
  interpolationDistance = 10,
  differenceThreshold = 40,
  onInterpolationDistanceChange,
  onDifferenceThresholdChange,
  onResetToDefaults
}) => {
  const { t } = useTranslation()
  const [combinedKey, setCombinedKey] = useState(0) // Force remount of combined view
  const [mapBackgroundOpacity, setMapBackgroundOpacity] = useState(0.5) // 0 = fully greyed, 1 = normal
  const [showDirections, setShowDirections] = useState({ route1: false, route2: false }) // Internal state for directions per route - disabled by default
  const [routeVisibility, setRouteVisibility] = useState({ route1: true, route2: true }) // Route visibility state
  const [showKilometerMarkers, setShowKilometerMarkers] = useState({ route1: true, route2: true }) // Kilometer marker state - enabled by default
  const [showStartEndMarkers, setShowStartEndMarkers] = useState(true) // Start/end marker state - enabled by default
  const [highlightDifferences, setHighlightDifferences] = useState(true) // Difference highlighting overlay - enabled by default
  const [showDifferenceBoxes, setShowDifferenceBoxes] = useState(true) // Show difference area boxes - enabled by default
  const [isFullscreen, setIsFullscreen] = useState(false) // Fullscreen state
  const [isMobile, setIsMobile] = useState(false) // Mobile device detection
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false) // Advanced settings visibility
  
  const map1Ref = useRef()
  
  
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
              <span style={{ color: 'red' }} className="truncate-filename" title={routeData?.route1?.name}>{routeData?.route1?.name}</span>
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={routeVisibility.route2}
                onChange={() => toggleRouteVisibility('route2')}
              />
              <span style={{ color: 'blue' }} className="truncate-filename" title={routeData?.route2?.name}>{routeData?.route2?.name}</span>
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={highlightDifferences && showDifferenceBoxes}
                onChange={(e) => {
                  setHighlightDifferences(e.target.checked)
                  setShowDifferenceBoxes(e.target.checked)
                }}
              />
              Show Differences
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
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showStartEndMarkers}
                onChange={(e) => setShowStartEndMarkers(e.target.checked)}
              />
              Show Start/End Markers
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
            showStartEndMarkers={showStartEndMarkers}
            highlightDifferences={highlightDifferences}
            showDifferenceBoxes={showDifferenceBoxes}
            differenceThreshold={differenceThreshold}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`dual-map-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Map Background Controls - Keep at top */}
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
      
      {/* Advanced Settings - Expandable Section */}
      <div className="advanced-settings">
        <button 
          className="advanced-settings-toggle"
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        >
          ⚙️ Advanced Settings {showAdvancedSettings ? '▼' : '▶'}
        </button>
        
        {showAdvancedSettings && (
          <div className="advanced-settings-content">
            {/* Processing Parameters */}
            <div className="advanced-section">
              <h4 className="advanced-section-title">Processing Parameters</h4>
              
              <div className="advanced-setting-item">
                <div className="setting-header">
                  <label className="setting-label">{t('gpxCompare.interpolationDistance')}</label>
                  <div className="setting-input-group">
                    <input
                      type="number"
                      value={interpolationDistance}
                      onChange={(e) => onInterpolationDistanceChange && onInterpolationDistanceChange(e.target.value)}
                      min="1"
                      max="100"
                      step="1"
                      className="setting-number-input"
                    />
                    <span className="setting-unit">meters</span>
                  </div>
                </div>
                <p className="setting-description">
                  {t('gpxCompare.interpolationDescription')}
                </p>
              </div>
              
              <div className="advanced-setting-item">
                <div className="setting-header">
                  <label className="setting-label">{t('gpxCompare.differenceThreshold')}</label>
                  <div className="setting-input-group">
                    <input
                      type="number"
                      value={differenceThreshold}
                      onChange={(e) => onDifferenceThresholdChange && onDifferenceThresholdChange(e.target.value)}
                      min="0"
                      max="1000"
                      step="5"
                      className="setting-number-input"
                    />
                    <span className="setting-unit">meters</span>
                  </div>
                </div>
                <p className="setting-description">
                  {t('gpxCompare.thresholdDescription')}
                </p>
              </div>
            </div>
            
            {/* Display Options */}
            <div className="advanced-section">
              <h4 className="advanced-section-title">Display Options</h4>
              
              <div className="advanced-setting-item">
                <div className="setting-checkboxes">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={showKilometerMarkers.route1}
                      onChange={(e) => setShowKilometerMarkers(prev => ({ ...prev, route1: e.target.checked }))}
                    />
                    <span className="checkbox-label">{t('gpxCompare.kmMarkersRoute1')}</span>
                  </label>
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={showKilometerMarkers.route2}
                      onChange={(e) => setShowKilometerMarkers(prev => ({ ...prev, route2: e.target.checked }))}
                    />
                    <span className="checkbox-label">{t('gpxCompare.kmMarkersRoute2')}</span>
                  </label>
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={showStartEndMarkers}
                      onChange={(e) => setShowStartEndMarkers(e.target.checked)}
                    />
                    <span className="checkbox-label">Show Start/End Markers</span>
                  </label>
                </div>
              </div>
              
              <div className="advanced-setting-item">
                <div className="setting-header">
                  <label className="setting-label">{t('gpxCompare.mapOpacity', 'Map Opacity')}</label>
                  <div className="setting-slider-group">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={mapBackgroundOpacity}
                      onChange={(e) => setMapBackgroundOpacity(parseFloat(e.target.value))}
                      className="setting-slider"
                    />
                    <span className="setting-slider-value">{Math.round(mapBackgroundOpacity * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Reset Button */}
            <div className="advanced-section">
              <div className="advanced-setting-item">
                <button 
                  className="reset-defaults-button"
                  onClick={onResetToDefaults}
                  disabled={!onResetToDefaults}
                >
                  🔄 {t('gpxCompare.resetToDefaults', 'Reset to Defaults')}
                </button>
                <p className="setting-description">
                  {t('gpxCompare.resetDescription', 'Reset all settings to their default values')}
                </p>
              </div>
            </div>
          </div>
        )}
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
          <span className="route-name" title={routeData.route1.name}>{routeData.route1.name}</span>
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
          <span className="route-name" title={routeData.route2.name}>{routeData.route2.name}</span>
          <span className="visibility-indicator">
            {routeVisibility.route2 ? '👁️' : '🚫'}
          </span>
        </div>
        
        {/* Difference areas legend */}
        <div 
          className={`route-legend-item difference-areas ${!(highlightDifferences && showDifferenceBoxes) ? 'hidden-route' : ''}`}
          onClick={() => {
            const newValue = !(highlightDifferences && showDifferenceBoxes)
            setHighlightDifferences(newValue)
            setShowDifferenceBoxes(newValue)
          }}
          title="Click to toggle difference areas"
        >
          <div 
            className="route-color-indicator" 
            style={{ 
              backgroundColor: 'transparent',
              border: '2px dashed darkblue',
              opacity: (highlightDifferences && showDifferenceBoxes) ? 1 : 0.3
            }}
          ></div>
          <span className="route-name">Difference Areas</span>
          <span className="visibility-indicator">
            {(highlightDifferences && showDifferenceBoxes) ? '👁️' : '🚫'}
          </span>
        </div>
      </div>
      
      {/* Maps Container */}
      <div className="maps-container combined">
        {/* Combined Mode - Single Map with Both Routes */}
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
            showStartEndMarkers={showStartEndMarkers}
            highlightDifferences={highlightDifferences}
            showDifferenceBoxes={showDifferenceBoxes}
            differenceThreshold={differenceThreshold}
          />
        </div>
      </div>
      
    </div>
  )
}

export default DualMapView