import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom icons for start/end markers
const createCustomIcon = (color, type) => {
  const iconHtml = type === 'start' 
    ? `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">S</div>`
    : `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">E</div>`
  
  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13]
  })
}

// Custom arrow icon for direction indicators
const createArrowIcon = (bearing, color) => {
  const arrowHtml = `<div style="transform: rotate(${bearing}deg); color: ${color}; font-size: 16px; text-shadow: 1px 1px 2px rgba(0,0,0,0.7);">▲</div>`
  
  return L.divIcon({
    html: arrowHtml,
    className: 'arrow-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  })
}

// Custom kilometer marker icon
const createKilometerIcon = (kilometer, color) => {
  const markerHtml = `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px;">${kilometer}</div>`
  
  return L.divIcon({
    html: markerHtml,
    className: 'kilometer-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  })
}

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

// Generate kilometer markers for a route
const generateKilometerMarkers = (points, color) => {
  if (!points || points.length < 2) return []
  
  const markers = []
  let totalDistance = 0
  let nextKilometer = 1
  
  for (let i = 1; i < points.length; i++) {
    const segmentDistance = calculateDistance(
      points[i-1].lat, points[i-1].lon,
      points[i].lat, points[i].lon
    )
    
    const segmentStart = totalDistance
    const segmentEnd = totalDistance + segmentDistance
    
    // Check if we crossed a kilometer mark in this segment
    while (nextKilometer <= segmentEnd) {
      const distanceIntoSegment = nextKilometer - segmentStart
      const ratio = distanceIntoSegment / segmentDistance
      
      // Interpolate position
      const lat = points[i-1].lat + (points[i].lat - points[i-1].lat) * ratio
      const lon = points[i-1].lon + (points[i].lon - points[i-1].lon) * ratio
      
      markers.push({
        position: [lat, lon],
        kilometer: nextKilometer,
        color: color
      })
      
      nextKilometer++
    }
    
    totalDistance = segmentEnd
  }
  
  return markers
}

// Component to handle map events and sync
const MapEventHandler = ({ onViewChange, syncView }) => {
  const map = useMap()
  
  const mapEvents = {}
  
  // Only add event handlers if onViewChange is provided
  if (onViewChange) {
    mapEvents.moveend = () => {
      const center = map.getCenter()
      const zoom = map.getZoom()
      onViewChange({ center, zoom })
    }
    mapEvents.zoomend = () => {
      const center = map.getCenter()
      const zoom = map.getZoom()
      onViewChange({ center, zoom })
    }
  }
  
  useMapEvents(mapEvents)
  
  useEffect(() => {
    if (syncView && syncView.center && syncView.zoom !== undefined) {
      const currentCenter = map.getCenter()
      const currentZoom = map.getZoom()
      
      // Only update if significantly different to prevent infinite loops
      const latDiff = Math.abs(currentCenter.lat - syncView.center.lat)
      const lngDiff = Math.abs(currentCenter.lng - syncView.center.lng)
      const zoomDiff = Math.abs(currentZoom - syncView.zoom)
      
      if (latDiff > 0.001 || lngDiff > 0.001 || zoomDiff > 0.1) {
        // Use setView with animation disabled to prevent conflicts
        map.setView(syncView.center, syncView.zoom, { animate: false })
      }
    }
  }, [syncView, map])
  
  // Handle initial map setup
  useEffect(() => {
    const timer = setTimeout(() => {
      const container = map.getContainer()
      map.invalidateSize(true)
    }, 150)
    return () => clearTimeout(timer)
  }, [map])
  
  // Additional effect to ensure map renders with routes
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [map])
  
  return null
}

// Component to fit bounds when data changes and handle map resize
const BoundsHandler = ({ bounds }) => {
  const map = useMap()
  
  useEffect(() => {
    // Invalidate map size when component mounts or bounds change
    const timer = setTimeout(() => {
      map.invalidateSize(true) // Force invalidation
      
      // Additional delay for bounds fitting
      setTimeout(() => {
        if (bounds) {
          const leafletBounds = L.latLngBounds(
            [bounds.south, bounds.west],
            [bounds.north, bounds.east]
          )
          map.fitBounds(leafletBounds, { padding: [20, 20] })
        }
      }, 50)
    }, 200)
    
    return () => clearTimeout(timer)
  }, [bounds, map])
  
  return null
}

const InteractiveMap = forwardRef(({ 
  routeData, 
  mapType = 'satellite', 
  onViewChange, 
  syncView,
  showDirections = { route1: true, route2: true },
  showOverlaps = true,
  backgroundOpacity = 0.3,
  showKilometerMarkers = { route1: false, route2: false }
}, ref) => {
  const mapRef = useRef()
  const containerRef = useRef()
  
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current
  }))
  
  // Handle map resize when container size changes
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      if (mapRef.current) {
        setTimeout(() => {
          mapRef.current.invalidateSize(true)
        }, 100)
      }
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [])
  
  if (!routeData) {
    return (
      <div className="map-placeholder">
        <p>No route data available</p>
      </div>
    )
  }
  
  
  
  const { route1, route2, bounds } = routeData
  
  // Convert points to Leaflet format (handle null routes)
  const route1Points = route1 ? route1.points.map(p => [p.lat, p.lon]) : []
  const route2Points = route2 ? route2.points.map(p => [p.lat, p.lon]) : []
  
  
  // Calculate center point
  const center = bounds ? [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2
  ] : [55.6761, 12.5683] // Default to Copenhagen
  
  
  // Tile layer URL based on map type
  const tileUrl = mapType === 'satellite' 
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  
  const attribution = mapType === 'satellite'
    ? '&copy; <a href="https://www.esri.com/">Esri</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  
  return (
    <div className="interactive-map" ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          url={tileUrl}
          attribution={attribution}
          opacity={backgroundOpacity}
        />
        
        {/* Route 1 */}
        {route1 && route1Points && route1Points.length > 0 && (
          <Polyline
            positions={route1Points}
            color={route1.color}
            weight={4}
            opacity={0.8}
          />
        )}
        
        {/* Route 2 */}
        {route2 && route2Points && route2Points.length > 0 && (
          <Polyline
            positions={route2Points}
            color={route2.color}
            weight={4}
            opacity={0.8}
          />
        )}
        
        
        {/* Start/End Markers for Route 1 */}
        {route1 && (
          <>
            <Marker
              position={[route1.start.lat, route1.start.lon]}
              icon={createCustomIcon(route1.color, 'start')}
            >
              <Popup>
                <strong>{route1.name}</strong><br />
                Start Point
              </Popup>
            </Marker>
            
            <Marker
              position={[route1.end.lat, route1.end.lon]}
              icon={createCustomIcon(route1.color, 'end')}
            >
              <Popup>
                <strong>{route1.name}</strong><br />
                End Point
              </Popup>
            </Marker>
          </>
        )}
        
        {/* Start/End Markers for Route 2 */}
        {route2 && (
          <>
            <Marker
              position={[route2.start.lat, route2.start.lon]}
              icon={createCustomIcon(route2.color, 'start')}
            >
              <Popup>
                <strong>{route2.name}</strong><br />
                Start Point
              </Popup>
            </Marker>
            
            <Marker
              position={[route2.end.lat, route2.end.lon]}
              icon={createCustomIcon(route2.color, 'end')}
            >
              <Popup>
                <strong>{route2.name}</strong><br />
                End Point
              </Popup>
            </Marker>
          </>
        )}
        
        {/* Direction Arrows for Route 1 */}
        {(typeof showDirections === 'boolean' ? showDirections : showDirections.route1) && route1 && route1.arrows && route1.arrows.map((arrow, index) => (
          <Marker
            key={`route1-arrow-${index}`}
            position={[arrow.lat, arrow.lon]}
            icon={createArrowIcon(arrow.bearing, route1.color)}
          />
        ))}
        
        {/* Direction Arrows for Route 2 */}
        {(typeof showDirections === 'boolean' ? showDirections : showDirections.route2) && route2 && route2.arrows && route2.arrows.map((arrow, index) => (
          <Marker
            key={`route2-arrow-${index}`}
            position={[arrow.lat, arrow.lon]}
            icon={createArrowIcon(arrow.bearing, route2.color)}
          />
        ))}
        
        {/* Kilometer Markers for Route 1 */}
        {showKilometerMarkers.route1 && route1 && route1.points && 
          generateKilometerMarkers(route1.points, route1.color).map((marker, index) => (
            <Marker
              key={`route1-km-${marker.kilometer}`}
              position={marker.position}
              icon={createKilometerIcon(marker.kilometer, marker.color)}
            >
              <Popup>
                <strong>{route1.name}</strong><br />
                Kilometer {marker.kilometer}
              </Popup>
            </Marker>
          ))
        }
        
        {/* Kilometer Markers for Route 2 */}
        {showKilometerMarkers.route2 && route2 && route2.points && 
          generateKilometerMarkers(route2.points, route2.color).map((marker, index) => (
            <Marker
              key={`route2-km-${marker.kilometer}`}
              position={marker.position}
              icon={createKilometerIcon(marker.kilometer, marker.color)}
            >
              <Popup>
                <strong>{route2.name}</strong><br />
                Kilometer {marker.kilometer}
              </Popup>
            </Marker>
          ))
        }
        
        {/* Map event handlers */}
        <MapEventHandler onViewChange={onViewChange} syncView={syncView} />
        <BoundsHandler bounds={bounds} />
      </MapContainer>
    </div>
  )
})

InteractiveMap.displayName = 'InteractiveMap'

export default InteractiveMap