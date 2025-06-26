import { useState, useRef, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ElevationProfile from './ElevationProfile'

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Calculate total distance of route
const calculateTotalDistance = (points) => {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(
      points[i-1].lat, points[i-1].lng,
      points[i].lat, points[i].lng
    )
  }
  return total
}

// Find the best insertion point for a new point on the route
const findBestInsertionIndex = (newPoint, routePoints) => {
  if (routePoints.length < 2) return routePoints.length
  
  let bestIndex = 1
  let minDistanceIncrease = Infinity
  
  for (let i = 1; i <= routePoints.length; i++) {
    const prevPoint = routePoints[i - 1]
    const nextPoint = i < routePoints.length ? routePoints[i] : null
    
    let distanceIncrease
    if (nextPoint) {
      // Calculate distance increase by inserting the point between prevPoint and nextPoint
      const originalDistance = calculateDistance(prevPoint.lat, prevPoint.lng, nextPoint.lat, nextPoint.lng)
      const newDistance1 = calculateDistance(prevPoint.lat, prevPoint.lng, newPoint.lat, newPoint.lng)
      const newDistance2 = calculateDistance(newPoint.lat, newPoint.lng, nextPoint.lat, nextPoint.lng)
      distanceIncrease = newDistance1 + newDistance2 - originalDistance
    } else {
      // Inserting at the end
      distanceIncrease = calculateDistance(prevPoint.lat, prevPoint.lng, newPoint.lat, newPoint.lng)
    }
    
    if (distanceIncrease < minDistanceIncrease) {
      minDistanceIncrease = distanceIncrease
      bestIndex = i
    }
  }
  
  return bestIndex
}

// Custom draggable marker icon - small points
const createDraggableIcon = (index) => {
  const color = index === 0 ? '#22c55e' : index === -1 ? '#ef4444' : '#3b82f6'
  
  return L.divIcon({
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: move;"></div>`,
    className: 'custom-draggable-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  })
}

// Component to handle map clicks
const MapClickHandler = ({ onMapClick, onRouteDoubleClick, routePoints, isPlanning }) => {
  useMapEvents({
    click(e) {
      if (isPlanning) {
        onMapClick(e.latlng)
      }
    }
  })
  
  return null
}

// Custom polyline component with double-click handling
const InteractivePolyline = ({ positions, onDoubleClick }) => {
  const polylineRef = useRef(null)
  
  const eventHandlers = {
    dblclick(e) {
      e.originalEvent.preventDefault()
      if (onDoubleClick) {
        onDoubleClick(e.latlng)
      }
    }
  }
  
  return (
    <Polyline
      ref={polylineRef}
      positions={positions}
      color="#3b82f6"
      weight={4}
      opacity={0.8}
      eventHandlers={eventHandlers}
    />
  )
}

// Custom marker component with drag and delete functionality
const DraggableMarker = ({ position, index, onDrag, onDelete, isLastPoint }) => {
  const markerRef = useRef(null)
  
  const eventHandlers = {
    dragend() {
      const marker = markerRef.current
      if (marker != null) {
        const newPos = marker.getLatLng()
        onDrag(index, newPos)
      }
    }
  }
  
  const handleRightClick = (e) => {
    e.originalEvent.preventDefault()
    if (onDelete) {
      onDelete(index)
    }
  }
  
  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{...eventHandlers, contextmenu: handleRightClick}}
      icon={createDraggableIcon(isLastPoint ? -1 : index)}
      ref={markerRef}
    />
  )
}

const RoutePlanner = ({ onStateChange }) => {
  const [routePoints, setRoutePoints] = useState([])
  const [mapType, setMapType] = useState('satellite')
  const [isPlanning, setIsPlanning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [elevationData, setElevationData] = useState({ totalAscent: 0, totalDescent: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showInstructions, setShowInstructions] = useState(() => {
    const saved = localStorage.getItem('routePlanner-showInstructions')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [userLocation, setUserLocation] = useState(null)
  const [savedDefaultLocation, setSavedDefaultLocation] = useState(() => {
    const saved = localStorage.getItem('routePlanner-defaultLocation')
    return saved ? JSON.parse(saved) : null
  })
  const [mapCenter, setMapCenter] = useState(() => {
    const saved = localStorage.getItem('routePlanner-defaultLocation')
    return saved ? JSON.parse(saved) : [55.6761, 12.5683] // Default center (Copenhagen)
  })
  const [mapZoom, setMapZoom] = useState(() => {
    const saved = localStorage.getItem('routePlanner-defaultZoom')
    return saved ? JSON.parse(saved) : 13
  })
  const [locationStatus, setLocationStatus] = useState('requesting') // 'requesting', 'success', 'denied', 'failed'
  const [showLocationStatus, setShowLocationStatus] = useState(true)
  const [routeHistory, setRouteHistory] = useState([]) // History for undo functionality
  const fileInputRef = useRef(null)
  const mapRef = useRef(null)
  
  // Monitor route state changes and notify parent
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        hasRoute: routePoints.length > 0,
        isPlanning: isPlanning
      })
    }
  }, [routePoints.length, isPlanning, onStateChange])
  
  // Add escape key handler for fullscreen
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    
    if (isFullscreen) {
      document.addEventListener('keydown', handleEscapeKey)
      return () => document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isFullscreen])
  
  // Detect user location on component mount
  useEffect(() => {
    // Only request geolocation if no saved default location exists
    if ('geolocation' in navigator && !savedDefaultLocation) {
      console.log('Requesting geolocation...')
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          console.log(`Geolocation success: ${latitude}, ${longitude}`)
          setUserLocation([latitude, longitude])
          setMapCenter([latitude, longitude])
          setLocationStatus('success')
          setShowLocationStatus(false) // Don't show success message
        },
        (error) => {
          console.log('Geolocation error:', error.message, error.code)
          let status = 'failed'
          if (error.code === error.PERMISSION_DENIED) {
            status = 'denied'
            console.log('Location permission denied by user')
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            console.log('Location information unavailable')
          } else if (error.code === error.TIMEOUT) {
            console.log('Location request timed out')
          }
          setLocationStatus(status)
          // Hide error message after 5 seconds
          setTimeout(() => setShowLocationStatus(false), 5000)
          // Keep default center (Copenhagen) if geolocation fails
        },
        {
          timeout: 15000,
          maximumAge: 60000, // 1 minute
          enableHighAccuracy: true
        }
      )
    } else if (savedDefaultLocation) {
      setLocationStatus('success')
      setTimeout(() => setShowLocationStatus(false), 2000)
    } else {
      console.log('Geolocation not supported by browser')
      setLocationStatus('failed')
    }
  }, [savedDefaultLocation])
  
  // Save current route state to history (for undo functionality)
  const saveToHistory = useCallback(() => {
    setRouteHistory(prev => {
      const newHistory = [...prev, JSON.parse(JSON.stringify(routePoints))]
      // Keep only last 20 states to prevent memory issues
      return newHistory.slice(-20)
    })
  }, [routePoints])
  
  // Undo last action
  const undoLastAction = () => {
    if (routeHistory.length > 0) {
      const previousState = routeHistory[routeHistory.length - 1]
      setRoutePoints(previousState)
      setRouteHistory(prev => prev.slice(0, -1))
    }
  }
  
  // Add new point to route
  const handleMapClick = useCallback((latlng) => {
    saveToHistory()
    setRoutePoints(prev => [...prev, { lat: latlng.lat, lng: latlng.lng, id: Date.now() }])
  }, [saveToHistory])
  
  // Handle marker drag
  const handleMarkerDrag = useCallback((index, newPos) => {
    saveToHistory()
    setRoutePoints(prev => {
      const newPoints = [...prev]
      newPoints[index] = { ...newPoints[index], lat: newPos.lat, lng: newPos.lng }
      return newPoints
    })
  }, [saveToHistory])
  
  // Delete marker
  const handleMarkerDelete = useCallback((index) => {
    if (routePoints.length > 1) {
      saveToHistory()
      setRoutePoints(prev => prev.filter((_, i) => i !== index))
    }
  }, [routePoints.length, saveToHistory])
  
  // Handle double-click on route to insert new point
  const handleRouteDoubleClick = useCallback((latlng) => {
    saveToHistory()
    const newPoint = { lat: latlng.lat, lng: latlng.lng, id: Date.now() }
    
    // Find the best insertion index, but never insert at the very end (preserve end point)
    let insertIndex = findBestInsertionIndex(newPoint, routePoints)
    
    // If the insertion would be at the end, insert before the last point instead
    if (insertIndex >= routePoints.length) {
      insertIndex = routePoints.length - 1
    }
    
    setRoutePoints(prev => {
      const newPoints = [...prev]
      newPoints.splice(insertIndex, 0, newPoint)
      return newPoints
    })
  }, [routePoints, saveToHistory])
  
  // Clear route
  const clearRoute = () => {
    saveToHistory()
    setRoutePoints([])
    setIsPlanning(false)
    setIsPaused(false)
    setRouteHistory([]) // Clear history when route is cleared
  }
  
  // Remove last point
  const removeLastPoint = () => {
    if (routePoints.length > 0) {
      saveToHistory()
      setRoutePoints(prev => prev.slice(0, -1))
    }
  }
  
  // Start planning
  const startPlanning = () => {
    setIsPlanning(true)
    setIsPaused(false)
  }
  
  // Resume planning
  const resumePlanning = () => {
    setIsPlanning(true)
    setIsPaused(false)
  }
  
  // Pause planning
  const pausePlanning = () => {
    setIsPlanning(false)
    setIsPaused(true)
  }
  
  // Export GPX
  const exportGPX = () => {
    if (routePoints.length === 0) return
    
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Runners Toolbox" 
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"
     xmlns="http://www.topografix.com/GPX/1/1" 
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <trk>
    <name>Planned Route</name>
    <trkseg>
${routePoints.map(point => `      <trkpt lat="${point.lat}" lon="${point.lng}"></trkpt>`).join('\n')}
    </trkseg>
  </trk>
</gpx>`
    
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'planned-route.gpx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  // Import GPX
  const importGPX = (event) => {
    const file = event.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(e.target.result, 'text/xml')
        const trackPoints = xmlDoc.getElementsByTagName('trkpt')
        
        const points = Array.from(trackPoints).map((point, index) => ({
          lat: parseFloat(point.getAttribute('lat')),
          lng: parseFloat(point.getAttribute('lon')),
          id: Date.now() + index
        })).filter(point => !isNaN(point.lat) && !isNaN(point.lng))
        
        if (points.length > 0) {
          saveToHistory()
          setRoutePoints(points)
          setIsPlanning(false)
          
          // Center map on imported route
          if (mapRef.current && points.length > 0) {
            const map = mapRef.current
            const latitudes = points.map(p => p.lat)
            const longitudes = points.map(p => p.lng)
            
            const bounds = [
              [Math.min(...latitudes), Math.min(...longitudes)],
              [Math.max(...latitudes), Math.max(...longitudes)]
            ]
            
            map.fitBounds(bounds, { padding: [20, 20] })
          }
        }
      } catch (error) {
        alert('Error parsing GPX file. Please ensure it\'s a valid GPX file.')
      }
    }
    reader.readAsText(file)
  }
  
  // Save current map state
  const saveMapState = () => {
    if (mapRef.current) {
      const map = mapRef.current
      const center = map.getCenter()
      const zoom = map.getZoom()
      setMapCenter([center.lat, center.lng])
      setMapZoom(zoom)
    }
  }

  // Toggle fullscreen
  const toggleFullscreen = () => {
    saveMapState()
    setIsFullscreen(!isFullscreen)
  }
  
  // Toggle instructions visibility
  const toggleInstructions = () => {
    const newValue = !showInstructions
    setShowInstructions(newValue)
    localStorage.setItem('routePlanner-showInstructions', JSON.stringify(newValue))
  }
  
  // Save current map center as default location
  const saveCurrentLocationAsDefault = () => {
    if (mapRef.current) {
      const map = mapRef.current
      const center = map.getCenter()
      const zoom = map.getZoom()
      const location = [center.lat, center.lng]
      
      const confirmed = window.confirm(
        `Set current map location (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}) and zoom level (${zoom.toFixed(1)}) as your default?\n\nThis will be remembered when you refresh the page.`
      )
      
      if (confirmed) {
        localStorage.setItem('routePlanner-defaultLocation', JSON.stringify(location))
        localStorage.setItem('routePlanner-defaultZoom', JSON.stringify(zoom))
        setSavedDefaultLocation(location)
        setMapCenter(location)
        setMapZoom(zoom)
        
        // Note: No longer showing location status for save operations
      }
    }
  }
  
  // Calculate total distance
  const totalDistance = calculateTotalDistance(routePoints)
  
  // Tile layer configuration
  const tileUrl = mapType === 'satellite' 
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  
  const attribution = mapType === 'satellite'
    ? '&copy; <a href="https://www.esri.com/">Esri</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  
  
  if (isFullscreen) {
    return (
      <div className={`route-planner-fullscreen ${isFullscreen ? 'fullscreen' : ''}`}>
        {isFullscreen && (
          <button 
            onClick={toggleFullscreen}
            className="fullscreen-exit-button"
            title="Exit fullscreen"
          >
            ✕
          </button>
        )}
        
        <div className="fullscreen-controls">
          <div className="fullscreen-controls-group">
            <button 
              onClick={isPlanning ? pausePlanning : (isPaused ? resumePlanning : startPlanning)}
              className={`btn ${isPlanning ? 'btn-secondary' : 'btn-primary'}`}
            >
              {isPlanning ? 'Pause Planning' : (isPaused ? 'Resume Planning' : 'Start Planning')}
            </button>
            <button onClick={undoLastAction} className="btn btn-secondary" disabled={routeHistory.length === 0}>
              ↶ Undo
            </button>
            <button onClick={removeLastPoint} className="btn btn-secondary" disabled={routePoints.length === 0}>
              Remove Last Point
            </button>
            <button onClick={clearRoute} className="btn btn-danger" disabled={routePoints.length === 0}>
              Clear Route
            </button>
          </div>
          
          <div className="fullscreen-controls-group">
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
              Import GPX
            </button>
            <button onClick={exportGPX} className="btn btn-secondary" disabled={routePoints.length === 0}>
              Export GPX
            </button>
          </div>
          
          <div className="fullscreen-controls-group">
            <div className="map-type-toggle">
              <button 
                className={`map-type-button ${mapType === 'satellite' ? 'active' : ''}`}
                onClick={() => setMapType('satellite')}
              >
                🛰️ Satellite
              </button>
              <button 
                className={`map-type-button ${mapType === 'street' ? 'active' : ''}`}
                onClick={() => setMapType('street')}
              >
                🗺️ Street Map
              </button>
            </div>
          </div>
          
          <div className="fullscreen-controls-group">
            <div className="route-stats">
              <strong>Distance: {totalDistance.toFixed(2)} km</strong>
              {routePoints.length > 1 && (
                <>
                  <span className="elevation-stat">↗ {elevationData.totalAscent.toFixed(0)} m</span>
                  <span className="elevation-stat">↘ {elevationData.totalDescent.toFixed(0)} m</span>
                </>
              )}
            </div>
          </div>
          
          <div className="fullscreen-controls-group">
            <button 
              onClick={saveCurrentLocationAsDefault}
              className="btn btn-secondary"
              title="Save current map center as default location"
            >
              📍 Set Default
            </button>
          </div>
        </div>
        
        <div className="fullscreen-map">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <TileLayer
              url={tileUrl}
              attribution={attribution}
            />
            
            <MapClickHandler 
              onMapClick={handleMapClick}
              routePoints={routePoints}
              isPlanning={isPlanning}
            />
            
            {/* Route polyline */}
            {routePoints.length > 1 && (
              <InteractivePolyline
                positions={routePoints.map(p => [p.lat, p.lng])}
                onDoubleClick={handleRouteDoubleClick}
              />
            )}
            
            {/* Route markers */}
            {routePoints.map((point, index) => (
              <DraggableMarker
                key={point.id}
                position={[point.lat, point.lng]}
                index={index}
                isLastPoint={index === routePoints.length - 1 && routePoints.length > 1}
                onDrag={handleMarkerDrag}
                onDelete={routePoints.length > 1 ? handleMarkerDelete : null}
              />
            ))}
          </MapContainer>
        </div>
        
        <input
          type="file"
          accept=".gpx"
          onChange={importGPX}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
      </div>
    )
  }

  return (
    <div className="tool-container">
      <h2>Route Planner</h2>
      
      <div className="usage-instructions">
        <div className="instructions-header" onClick={toggleInstructions}>
          <p><strong>How to use:</strong></p>
          <button className="instructions-toggle">
            {showInstructions ? '▼' : '▶'}
          </button>
        </div>
        {showInstructions && (
          <ol>
            <li>Click <strong>"Start Planning"</strong> to begin creating your route</li>
            <li>Click anywhere on the map to add waypoints</li>
            <li>Drag markers to reposition them</li>
            <li>Right-click markers to delete them</li>
            <li>Double-click the route line to insert new points</li>
            <li>Export your route as a GPX file when finished</li>
          </ol>
        )}
      </div>
      
      <div className="controls">
          <div className="control-group">
            <button 
              onClick={isPlanning ? pausePlanning : (isPaused ? resumePlanning : startPlanning)}
              className={`btn ${isPlanning ? 'btn-secondary' : 'btn-primary'}`}
            >
              {isPlanning ? 'Pause Planning' : (isPaused ? 'Resume Planning' : 'Start Planning')}
            </button>
            <button onClick={undoLastAction} className="btn btn-secondary" disabled={routeHistory.length === 0}>
              ↶ Undo
            </button>
            <button onClick={removeLastPoint} className="btn btn-secondary" disabled={routePoints.length === 0}>
              Remove Last Point
            </button>
            <button onClick={clearRoute} className="btn btn-danger" disabled={routePoints.length === 0}>
              Clear Route
            </button>
          </div>
          
          <div className="control-group">
            <input
              type="file"
              accept=".gpx"
              onChange={importGPX}
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
              Import GPX
            </button>
            <button onClick={exportGPX} className="btn btn-secondary" disabled={routePoints.length === 0}>
              Export GPX
            </button>
          </div>
          
          
          
        </div>
      
      <div className="route-info">
        <div className="distance-display">
          <div className="route-stats">
            <strong>Distance: {totalDistance.toFixed(2)} km</strong>
            {routePoints.length > 1 && (
              <>
                <span className="elevation-stat">↗ {elevationData.totalAscent.toFixed(0)} m</span>
                <span className="elevation-stat">↘ {elevationData.totalDescent.toFixed(0)} m</span>
              </>
            )}
          </div>
          {routePoints.length > 0 && (
            <span className="point-count">({routePoints.length} points)</span>
          )}
        </div>
        {isPlanning && (
          <div className="planning-info">
            Click on the map to add points. Right-click markers to delete them. Double-click the route line to insert new points.
          </div>
        )}
        {!isPlanning && routePoints.length > 1 && (
          <div className="planning-info">
            Double-click the route line to insert new points. Drag markers to reposition them.
          </div>
        )}
      </div>
      
      <div className="map-container">
        <button 
          onClick={toggleFullscreen}
          className="fullscreen-button"
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? '⊖' : '⊞'}
        </button>
        <button 
          onClick={saveCurrentLocationAsDefault}
          className="set-default-button"
          title="Save current map center as default location"
        >
          📍
        </button>
        <div className="map-type-toggle-inline">
          <button 
            className={`map-type-button-inline ${mapType === 'satellite' ? 'active' : ''}`}
            onClick={() => setMapType('satellite')}
            title="Satellite view"
          >
            🛰️
          </button>
          <button 
            className={`map-type-button-inline ${mapType === 'street' ? 'active' : ''}`}
            onClick={() => setMapType('street')}
            title="Street map view"
          >
            🗺️
          </button>
        </div>
        
        {showLocationStatus && locationStatus === 'requesting' && (
          <div className="location-status requesting">
            📍 Requesting your location...
          </div>
        )}
        {showLocationStatus && locationStatus === 'denied' && (
          <div className="location-status denied">
            📍 Location access denied. Map centered on Copenhagen.
          </div>
        )}
        {showLocationStatus && locationStatus === 'failed' && (
          <div className="location-status failed">
            📍 Could not get your location. Map centered on Copenhagen.
          </div>
        )}
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url={tileUrl}
            attribution={attribution}
          />
          
          <MapClickHandler 
            onMapClick={handleMapClick}
            routePoints={routePoints}
            isPlanning={isPlanning}
          />
          
          {/* Route polyline */}
          {routePoints.length > 1 && (
            <InteractivePolyline
              positions={routePoints.map(p => [p.lat, p.lng])}
              onDoubleClick={handleRouteDoubleClick}
            />
          )}
          
          {/* Route markers */}
          {routePoints.map((point, index) => (
            <DraggableMarker
              key={point.id}
              position={[point.lat, point.lng]}
              index={index}
              isLastPoint={index === routePoints.length - 1 && routePoints.length > 1}
              onDrag={handleMarkerDrag}
              onDelete={routePoints.length > 1 ? handleMarkerDelete : null}
            />
          ))}
        </MapContainer>
      </div>
      
      <div className="elevation-profile">
        <h3>Elevation Profile</h3>
        <ElevationProfile routePoints={routePoints} onElevationData={setElevationData} />
      </div>
    </div>
  )
}

export default RoutePlanner