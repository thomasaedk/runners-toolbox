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


// Find the best insertion point for a new point on the route (only between existing points)
const findBestInsertionIndex = (newPoint, routePoints) => {
  if (routePoints.length < 2) return 1
  
  let bestIndex = 1
  let minDistanceIncrease = Infinity
  
  // Only consider insertions between existing points (not at the end)
  for (let i = 1; i < routePoints.length; i++) {
    const prevPoint = routePoints[i - 1]
    const nextPoint = routePoints[i]
    
    // Calculate distance increase by inserting the point between prevPoint and nextPoint
    const originalDistance = calculateDistance(prevPoint.lat, prevPoint.lng, nextPoint.lat, nextPoint.lng)
    const newDistance1 = calculateDistance(prevPoint.lat, prevPoint.lng, newPoint.lat, newPoint.lng)
    const newDistance2 = calculateDistance(newPoint.lat, newPoint.lng, nextPoint.lat, nextPoint.lng)
    const distanceIncrease = newDistance1 + newDistance2 - originalDistance
    
    if (distanceIncrease < minDistanceIncrease) {
      minDistanceIncrease = distanceIncrease
      bestIndex = i
    }
  }
  
  return bestIndex
}

// Check if route forms a loop (start and end points are close)
const isRouteLoop = (points, thresholdKm = 0.1) => {
  if (points.length < 3) return false
  
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const distance = calculateDistance(firstPoint.lat, firstPoint.lng, lastPoint.lat, lastPoint.lng)
  
  return distance <= thresholdKm
}

// Validate route and provide feedback
const validateRoute = (points) => {
  const validation = {
    warnings: [],
    suggestions: [],
    stats: {}
  }
  
  if (points.length < 2) {
    return validation
  }
  
  // Check for very long segments
  const longSegments = []
  for (let i = 1; i < points.length; i++) {
    const distance = calculateDistance(
      points[i-1].lat, points[i-1].lng,
      points[i].lat, points[i].lng
    )
    if (distance > 5) { // 5km threshold
      longSegments.push({ index: i, distance })
    }
  }
  
  if (longSegments.length > 0) {
    validation.warnings.push(`${longSegments.length} segments longer than 5km - consider adding intermediate points`)
  }
  
  // Check route distance
  const totalDistance = calculateTotalDistance(points)
  validation.stats.totalDistance = totalDistance
  
  if (totalDistance > 50) {
    validation.warnings.push('Very long route (>50km) - consider splitting into segments')
  } else if (totalDistance < 1) {
    validation.suggestions.push('Short route - consider extending for a longer workout')
  }
  
  // Check for sharp turns (potential navigation issues)
  const sharpTurns = []
  for (let i = 1; i < points.length - 1; i++) {
    const bearing1 = calculateBearing(points[i-1], points[i])
    const bearing2 = calculateBearing(points[i], points[i+1])
    const angleDiff = Math.abs(bearing2 - bearing1)
    const normalizedAngle = Math.min(angleDiff, 360 - angleDiff)
    
    if (normalizedAngle > 140) { // Sharp turn threshold
      sharpTurns.push(i)
    }
  }
  
  if (sharpTurns.length > 0) {
    validation.suggestions.push(`${sharpTurns.length} sharp turns detected - double-check navigation`)
  }
  
  // Route completion suggestions
  if (points.length >= 3) {
    if (isRouteLoop(points)) {
      validation.suggestions.push('Nice loop route! Perfect for training circuits')
    } else {
      validation.suggestions.push('Point-to-point route - plan your return journey')
    }
  }
  
  return validation
}

// Calculate bearing between two points
const calculateBearing = (point1, point2) => {
  const dLon = (point2.lng - point1.lng) * Math.PI / 180
  const lat1 = point1.lat * Math.PI / 180
  const lat2 = point2.lat * Math.PI / 180
  
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

// Calculate time and effort estimates
const calculateEstimates = (distanceKm, elevationGain) => {
  // Running pace estimates (minutes per km)
  const easyPace = 6.0      // 6:00/km
  const moderatePace = 5.0  // 5:00/km
  const fastPace = 4.0      // 4:00/km
  
  // Adjust for elevation gain (add ~30 seconds per 100m of gain)
  const elevationPenalty = (elevationGain / 100) * 0.5 // 0.5 min per 100m
  
  const easyTime = (distanceKm * easyPace) + elevationPenalty
  const moderateTime = (distanceKm * moderatePace) + elevationPenalty
  const fastTime = (distanceKm * fastPace) + elevationPenalty
  
  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
  }
  
  return {
    easy: formatTime(easyTime),
    moderate: formatTime(moderateTime),
    fast: formatTime(fastTime),
    calories: Math.round(distanceKm * 70) // Rough estimate: 70 cal/km
  }
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

// Ghost marker icon for insertion preview
const createGhostIcon = () => {
  return L.divIcon({
    html: `<div style="background-color: #ff6b6b; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(255,107,107,0.4); opacity: 0.7;"></div>`,
    className: 'ghost-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  })
}

// Component to handle map clicks, mouse events, and touch gestures
const MapEventHandler = ({ onMapClick, onRouteDoubleClick, onRouteClick, routePoints, isPlanning, isCtrlPressed, onMouseMove, onMouseOut, isMobile, onLongPress }) => {
  const [touchStartTime, setTouchStartTime] = useState(null)
  const [touchStartPos, setTouchStartPos] = useState(null)
  const [longPressTimer, setLongPressTimer] = useState(null)
  
  useMapEvents({
    click(e) {
      const ctrlOrCmdPressed = e.originalEvent.ctrlKey || e.originalEvent.metaKey
      
      if (ctrlOrCmdPressed && routePoints.length > 1 && onRouteClick) {
        // Ctrl/Cmd + Click: Insert point between adjacent points
        onRouteClick(e.latlng)
      } else if (isPlanning) {
        // Regular click in planning mode: Add new waypoint at end
        onMapClick(e.latlng)
      }
      // Note: Regular clicks when not planning are ignored (no action)
    },
    mousemove(e) {
      if (isCtrlPressed && routePoints.length > 1 && onMouseMove) {
        onMouseMove(e.latlng)
      }
    },
    mouseout(e) {
      if (onMouseOut) {
        onMouseOut()
      }
    },
    touchstart(e) {
      if (isMobile) {
        const touch = e.originalEvent.touches[0]
        setTouchStartTime(Date.now())
        setTouchStartPos({ x: touch.clientX, y: touch.clientY })
        
        // Start long press timer
        const timer = setTimeout(() => {
          if (routePoints.length > 1 && onLongPress) {
            onLongPress(e.latlng)
          }
        }, 500) // 500ms long press
        
        setLongPressTimer(timer)
      }
    },
    touchmove(e) {
      if (isMobile && touchStartPos && longPressTimer) {
        const touch = e.originalEvent.touches[0]
        const moveDistance = Math.sqrt(
          Math.pow(touch.clientX - touchStartPos.x, 2) + 
          Math.pow(touch.clientY - touchStartPos.y, 2)
        )
        
        // Cancel long press if finger moved too much (>20px)
        if (moveDistance > 20) {
          clearTimeout(longPressTimer)
          setLongPressTimer(null)
        }
      }
    },
    touchend(e) {
      if (isMobile) {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          setLongPressTimer(null)
        }
        
        const touchDuration = Date.now() - touchStartTime
        
        // Handle as normal tap if it was short and didn't trigger long press
        if (touchDuration < 500 && touchStartPos) {
          // This will trigger the click event naturally
        }
        
        setTouchStartTime(null)
        setTouchStartPos(null)
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
const DraggableMarker = ({ position, index, onDrag, onDelete, isLastPoint, isSelected, onSelect }) => {
  const markerRef = useRef(null)
  
  const eventHandlers = {
    dragend() {
      const marker = markerRef.current
      if (marker != null) {
        const newPos = marker.getLatLng()
        onDrag(index, newPos)
      }
    },
    click() {
      if (onSelect) {
        onSelect(index)
      }
    }
  }
  
  const handleRightClick = (e) => {
    e.originalEvent.preventDefault()
    if (onDelete) {
      onDelete(index)
    }
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (onDelete) {
        onDelete(index)
        e.preventDefault()
      }
    }
  }
  
  // Create icon with selection highlight
  const createSelectableIcon = () => {
    const color = index === 0 ? '#22c55e' : isLastPoint ? '#ef4444' : '#3b82f6'
    const selectedStyle = isSelected ? 'box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5); border: 3px solid #3b82f6;' : ''
    
    return L.divIcon({
      html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: move; ${selectedStyle}" tabindex="0"></div>`,
      className: 'custom-draggable-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }
  
  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{...eventHandlers, contextmenu: handleRightClick, keydown: handleKeyDown}}
      icon={createSelectableIcon()}
      ref={markerRef}
      title={`Waypoint ${index + 1} - Right-click to delete, drag to move`}
    />
  )
}

const RoutePlanner = ({ onStateChange }) => {
  const [routePoints, setRoutePoints] = useState([])
  const [mapType, setMapType] = useState('satellite')
  const [isPlanning, setIsPlanning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const [ghostMarker, setGhostMarker] = useState(null)
  const [hoveredSegment, setHoveredSegment] = useState(null)
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [longPressTimer, setLongPressTimer] = useState(null)
  const [isLongPress, setIsLongPress] = useState(false)
  const [planningStartTime, setPlanningStartTime] = useState(null)
  const [isLoopRoute, setIsLoopRoute] = useState(false)
  const [routeValidation, setRouteValidation] = useState({ warnings: [], suggestions: [], stats: {} })
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
  
  // Monitor route for loop detection and validation
  useEffect(() => {
    const isLoop = isRouteLoop(routePoints)
    setIsLoopRoute(isLoop)
    
    // Run route validation
    const validation = validateRoute(routePoints)
    setRouteValidation(validation)
  }, [routePoints])
  
  // Calculate elevation data callback for ElevationProfile component
  const handleElevationData = useCallback((data) => {
    setElevationData(prevData => {
      // Only update if the data has actually changed to prevent unnecessary re-renders
      if (prevData.totalAscent !== data.totalAscent || prevData.totalDescent !== data.totalDescent) {
        return data
      }
      return prevData
    })
  }, [isFullscreen])
  
  
  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                           (window.innerWidth <= 768 && 'ontouchstart' in window)
      setIsMobile(isMobileDevice)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // This useEffect will be moved after all function definitions
  
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
  
  // Handle marker selection
  const handleMarkerSelect = useCallback((index) => {
    setSelectedMarker(selectedMarker === index ? null : index)
  }, [selectedMarker])

  // Handle marker drag
  const handleMarkerDrag = useCallback((index, newPos) => {
    // Auto-pause planning when user starts dragging markers
    if (isPlanning && !isPaused) {
      setIsPlanning(false)
      setIsPaused(true)
    }
    
    saveToHistory()
    setRoutePoints(prev => {
      const newPoints = [...prev]
      newPoints[index] = { ...newPoints[index], lat: newPos.lat, lng: newPos.lng }
      return newPoints
    })
  }, [saveToHistory, isPlanning, isPaused])
  
  // Delete marker
  const handleMarkerDelete = useCallback((index) => {
    if (routePoints.length > 1) {
      saveToHistory()
      setRoutePoints(prev => prev.filter((_, i) => i !== index))
    }
  }, [routePoints.length, saveToHistory])
  
  // Handle mouse movement for ghost marker preview
  const handleMouseMove = useCallback((latlng) => {
    if (isCtrlPressed && routePoints.length > 1) {
      const newPoint = { lat: latlng.lat, lng: latlng.lng, id: 'ghost' }
      const insertIndex = findBestInsertionIndex(newPoint, routePoints)
      setGhostMarker({ ...newPoint, insertIndex })
    }
  }, [isCtrlPressed, routePoints])
  
  // Handle mouse out to clear ghost marker
  const handleMouseOut = useCallback(() => {
    setGhostMarker(null)
  }, [])
  
  // Handle long press for mobile insertion
  const handleLongPress = useCallback((latlng) => {
    if (isMobile && routePoints.length > 1) {
      // Provide haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
      // Insert point on long press (mobile equivalent of Ctrl+Click)
      // Duplicate the logic instead of calling handleRouteClick to avoid circular dependency
      saveToHistory()
      const newPoint = { lat: latlng.lat, lng: latlng.lng, id: Date.now() }
      
      // Find the best insertion index between existing points
      const insertIndex = findBestInsertionIndex(newPoint, routePoints)
      
      setRoutePoints(prev => {
        const newPoints = [...prev]
        newPoints.splice(insertIndex, 0, newPoint)
        return newPoints
      })
      
      // Clear ghost marker after insertion
      setGhostMarker(null)
    }
  }, [isMobile, routePoints.length, saveToHistory])

  // Handle left-click on route to insert new point
  const handleRouteClick = useCallback((latlng) => {
    saveToHistory()
    const newPoint = { lat: latlng.lat, lng: latlng.lng, id: Date.now() }
    
    // Find the best insertion index between existing points
    const insertIndex = findBestInsertionIndex(newPoint, routePoints)
    
    setRoutePoints(prev => {
      const newPoints = [...prev]
      newPoints.splice(insertIndex, 0, newPoint)
      return newPoints
    })
    
    // Clear ghost marker after insertion
    setGhostMarker(null)
  }, [routePoints, saveToHistory])

  // Handle double-click on route to insert new point
  const handleRouteDoubleClick = useCallback((latlng) => {
    saveToHistory()
    const newPoint = { lat: latlng.lat, lng: latlng.lng, id: Date.now() }
    
    // Find the best insertion index between existing points
    const insertIndex = findBestInsertionIndex(newPoint, routePoints)
    
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
    setPlanningStartTime(Date.now())
  }
  
  // Resume planning from any endpoint
  const resumePlanning = (fromEnd = true) => {
    setIsPlanning(true)
    setIsPaused(false)
    
    // Smart resume: can plan from start or end
    if (!fromEnd && routePoints.length > 0) {
      // Reverse route to plan from the start
      setRoutePoints(prev => [...prev].reverse())
    }
  }
  
  // Pause planning
  const pausePlanning = () => {
    setIsPlanning(false)
    setIsPaused(true)
  }
  
  // Get planning duration
  const getPlanningDuration = () => {
    if (!planningStartTime) return 0
    return Math.floor((Date.now() - planningStartTime) / 1000)
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
  
  // Add keyboard event handlers (moved after all function definitions)
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Prevent shortcuts when typing in input fields
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return
      }
      
      switch (event.key) {
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false)
          } else if (isPlanning) {
            pausePlanning()
          }
          event.preventDefault()
          break
          
        case 'Control':
        case 'Meta':
          setIsCtrlPressed(true)
          break
          
        case 'z':
          if (event.ctrlKey || event.metaKey) {
            if (event.shiftKey) {
              // Ctrl+Shift+Z: Redo (future enhancement)
              console.log('Redo not implemented yet')
            } else {
              // Ctrl+Z: Undo
              undoLastAction()
            }
            event.preventDefault()
          }
          break
          
        case 'Backspace':
        case 'Delete':
          if (selectedMarker !== null && routePoints.length > 1) {
            handleMarkerDelete(selectedMarker)
            setSelectedMarker(null)
            event.preventDefault()
          } else if (routePoints.length > 0) {
            removeLastPoint()
            event.preventDefault()
          }
          break
          
        case 'Tab':
          // Tab: Navigate between markers
          if (routePoints.length > 0) {
            const nextIndex = selectedMarker === null ? 0 : 
                            selectedMarker >= routePoints.length - 1 ? 0 : 
                            selectedMarker + 1
            setSelectedMarker(nextIndex)
            event.preventDefault()
          }
          break
          
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          // Arrow keys: Move selected marker
          if (selectedMarker !== null && routePoints.length > selectedMarker) {
            const currentPoint = routePoints[selectedMarker]
            const moveDistance = 0.0001 // ~10 meters
            let newLat = currentPoint.lat
            let newLng = currentPoint.lng
            
            switch (event.key) {
              case 'ArrowUp':
                newLat += moveDistance
                break
              case 'ArrowDown':
                newLat -= moveDistance
                break
              case 'ArrowLeft':
                newLng -= moveDistance
                break
              case 'ArrowRight':
                newLng += moveDistance
                break
            }
            
            handleMarkerDrag(selectedMarker, { lat: newLat, lng: newLng })
            event.preventDefault()
          }
          break
          
        case ' ':
          // Spacebar: Toggle planning state
          if (isPlanning) {
            pausePlanning()
          } else if (isPaused) {
            resumePlanning()
          } else {
            startPlanning()
          }
          event.preventDefault()
          break
          
        case 'f':
          // F: Toggle fullscreen
          toggleFullscreen()
          event.preventDefault()
          break
          
        case 'c':
          if (event.ctrlKey || event.metaKey) {
            // Ctrl+C: Clear route with confirmation
            if (routePoints.length > 0) {
              if (window.confirm('Are you sure you want to clear the entire route? This action cannot be undone.')) {
                clearRoute()
              }
            }
            event.preventDefault()
          }
          break
          
        case 's':
          if (event.ctrlKey || event.metaKey) {
            // Ctrl+S: Export GPX
            exportGPX()
            event.preventDefault()
          }
          break
          
        case 'o':
          if (event.ctrlKey || event.metaKey) {
            // Ctrl+O: Import GPX
            fileInputRef.current?.click()
            event.preventDefault()
          }
          break
      }
    }
    
    const handleKeyUp = (event) => {
      if (event.key === 'Control' || event.key === 'Meta') {
        setIsCtrlPressed(false)
        setGhostMarker(null) // Clear ghost marker when Ctrl is released
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isFullscreen, isPlanning, isPaused, routePoints.length, selectedMarker, handleMarkerDelete, handleMarkerDrag])
  
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
            {isPaused && routePoints.length > 0 && (
              <button 
                onClick={() => resumePlanning(false)}
                className="btn btn-secondary"
                title="Switch to planning from the other end of the route"
              >
                ↔️ Flip
              </button>
            )}
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
            className={`${isPlanning ? 'planning-mode' : 'editing-mode'} ${isCtrlPressed ? 'ctrl-pressed' : ''}`}
            ref={mapRef}
          >
            <TileLayer
              url={tileUrl}
              attribution={attribution}
            />
            
            
            <MapEventHandler 
              onMapClick={handleMapClick}
              onRouteClick={handleRouteClick}
              routePoints={routePoints}
              isPlanning={isPlanning}
              isCtrlPressed={isCtrlPressed}
              onMouseMove={handleMouseMove}
              onMouseOut={handleMouseOut}
              isMobile={isMobile}
              onLongPress={handleLongPress}
            />
            
            {/* Route polyline */}
            {routePoints.length > 1 && (
              <InteractivePolyline
                positions={routePoints.map(p => [p.lat, p.lng])}
                onDoubleClick={handleRouteDoubleClick}
              />
            )}
            
            {/* Ghost marker for insertion preview */}
            {ghostMarker && (
              <Marker
                position={[ghostMarker.lat, ghostMarker.lng]}
                icon={createGhostIcon()}
                interactive={false}
              />
            )}
            
            {/* Route markers */}
            {routePoints.map((point, index) => (
              <DraggableMarker
                key={point.id}
                position={[point.lat, point.lng]}
                index={index}
                isLastPoint={index === routePoints.length - 1 && routePoints.length > 1}
                isSelected={selectedMarker === index}
                onDrag={handleMarkerDrag}
                onDelete={routePoints.length > 1 ? handleMarkerDelete : null}
                onSelect={handleMarkerSelect}
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
        
        {/* Hidden calculation-only component for fullscreen mode */}
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <ElevationProfile 
            routePoints={routePoints} 
            onElevationData={handleElevationData}
            calculationOnly={true}
          />
        </div>
        
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
          <div>
            <h4>Basic Usage:</h4>
            <ol>
              <li>Click <strong>"Start Planning"</strong> to begin creating your route</li>
              <li><strong>{isMobile ? 'Tap' : 'Click'}</strong> anywhere to add new waypoints at the end</li>
              <li><strong>{isMobile ? 'Long-press' : 'Ctrl/Cmd + Click'}</strong> anywhere to insert new points between adjacent points</li>
              <li>Drag markers to reposition them</li>
              <li>{isMobile ? 'Long-press markers to delete them' : 'Right-click markers to delete them'}</li>
              <li>Export your route as a GPX file when finished</li>
            </ol>
            
            {!isMobile && (
              <>
                <h4>Keyboard Shortcuts:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem', marginTop: '1rem' }}>
                  <div><strong>Space:</strong> Toggle planning</div>
                  <div><strong>Ctrl+Z:</strong> Undo</div>
                  <div><strong>Delete/Backspace:</strong> Remove last point</div>
                  <div><strong>F:</strong> Toggle fullscreen</div>
                  <div><strong>Tab:</strong> Select next marker</div>
                  <div><strong>Arrows:</strong> Move selected marker</div>
                  <div><strong>Ctrl+S:</strong> Export GPX</div>
                  <div><strong>Ctrl+O:</strong> Import GPX</div>
                  <div><strong>Ctrl+C:</strong> Clear route (with confirmation)</div>
                  <div><strong>Escape:</strong> Exit fullscreen/pause</div>
                </div>
              </>
            )}
            
            {isMobile && (
              <>
                <h4>Touch Gestures:</h4>
                <div style={{ fontSize: '0.9rem', marginTop: '1rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Tap:</strong> Add waypoint or select marker</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Long-press map:</strong> Insert point between adjacent points</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Long-press marker:</strong> Delete marker</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Drag:</strong> Move marker position</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Pinch:</strong> Zoom in/out</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="controls">
          <div className="control-group primary-controls">
            <button 
              onClick={isPlanning ? pausePlanning : (isPaused ? resumePlanning : startPlanning)}
              className={`btn ${isPlanning ? 'btn-secondary' : 'btn-primary'}`}
            >
              {isPlanning ? 'Pause Planning' : (isPaused ? 'Resume Planning' : 'Start Planning')}
            </button>
            {isPaused && routePoints.length > 0 && (
              <button 
                onClick={() => resumePlanning(false)}
                className="btn btn-secondary btn-compact"
                title="Switch to planning from the other end of the route"
              >
                ↔️
              </button>
            )}
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
          
          <div className="control-group file-controls">
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
            {routePoints.length > 0 && (
              <span className="point-count">({routePoints.length} points)</span>
            )}
          </div>
        </div>
        <div className="planning-info" style={{ minHeight: '2.5rem', display: 'flex', alignItems: 'center' }}>
          {isPlanning ? (
            isMobile 
              ? 'Tap to add waypoints. Long-press to insert points between adjacent points.' 
              : 'Click to add waypoints. Ctrl/Cmd + Click to insert points between adjacent points. Right-click markers to delete them.'
          ) : routePoints.length > 1 ? (
            isMobile 
              ? 'Long-press to insert new points between adjacent points. Drag markers to reposition them.' 
              : 'Ctrl/Cmd + Click to insert new points between adjacent points. Drag markers to reposition them.'
          ) : (
            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
              {isMobile ? 'Start planning to begin adding waypoints to your route' : 'Start planning to begin adding waypoints to your route'}
            </span>
          )}
        </div>
        
        {/* Route validation feedback */}
        {routeValidation.warnings.length > 0 && (
          <div className="route-validation">
            <div className="validation-warnings">
              <h4>⚠️ Warnings:</h4>
              <ul>
                {routeValidation.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        {/* Time and effort estimates - always show with min height to prevent jumping */}
        <div className="route-estimates" style={{ minHeight: totalDistance > 0 ? 'auto' : '4rem' }}>
          {totalDistance > 0 ? (
            <>
              <h4>🏃‍♂️ Estimated Running Times:</h4>
              <div className="estimate-grid">
                {(() => {
                  const estimates = calculateEstimates(totalDistance, elevationData.totalAscent)
                  return (
                    <>
                      <div className="estimate-item">
                        <div className="estimate-value">{estimates.easy}</div>
                        <div className="estimate-label">Easy Pace</div>
                      </div>
                      <div className="estimate-item">
                        <div className="estimate-value">{estimates.moderate}</div>
                        <div className="estimate-label">Moderate Pace</div>
                      </div>
                      <div className="estimate-item">
                        <div className="estimate-value">{estimates.fast}</div>
                        <div className="estimate-label">Fast Pace</div>
                      </div>
                      <div className="estimate-item">
                        <div className="estimate-value">{estimates.calories}</div>
                        <div className="estimate-label">Calories</div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </>
          ) : (
            <div style={{ color: '#9ca3af', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '4rem' }}>
              Add waypoints to your route to see estimated running times and calorie burn
            </div>
          )}
        </div>
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
          className={`${isPlanning ? 'planning-mode' : 'editing-mode'} ${isCtrlPressed ? 'ctrl-pressed' : ''}`}
          ref={mapRef}
        >
          <TileLayer
            url={tileUrl}
            attribution={attribution}
          />
          
          
          <MapEventHandler 
            onMapClick={handleMapClick}
            onRouteClick={handleRouteClick}
            routePoints={routePoints}
            isPlanning={isPlanning}
            isCtrlPressed={isCtrlPressed}
            onMouseMove={handleMouseMove}
            onMouseOut={handleMouseOut}
            isMobile={isMobile}
            onLongPress={handleLongPress}
          />
          
          {/* Route polyline */}
          {routePoints.length > 1 && (
            <InteractivePolyline
              positions={routePoints.map(p => [p.lat, p.lng])}
              onDoubleClick={handleRouteDoubleClick}
            />
          )}
          
          {/* Ghost marker for insertion preview */}
          {ghostMarker && (
            <Marker
              position={[ghostMarker.lat, ghostMarker.lng]}
              icon={createGhostIcon()}
              interactive={false}
            />
          )}
          
          {/* Route markers */}
          {routePoints.map((point, index) => (
            <DraggableMarker
              key={point.id}
              position={[point.lat, point.lng]}
              index={index}
              isLastPoint={index === routePoints.length - 1 && routePoints.length > 1}
              isSelected={selectedMarker === index}
              onDrag={handleMarkerDrag}
              onDelete={routePoints.length > 1 ? handleMarkerDelete : null}
              onSelect={handleMarkerSelect}
            />
          ))}
        </MapContainer>
      </div>
      
      {/* Elevation Profile - only show in regular mode */}
      <div className="elevation-profile">
        <h3>Elevation Profile</h3>
        <ElevationProfile 
          routePoints={routePoints} 
          onElevationData={handleElevationData}
        />
      </div>
    </div>
  )
}

export default RoutePlanner