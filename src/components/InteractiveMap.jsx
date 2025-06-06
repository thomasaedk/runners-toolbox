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
      console.log('Map container size:', container.offsetWidth, 'x', container.offsetHeight)
      map.invalidateSize(true)
      console.log('Map invalidated, current zoom:', map.getZoom())
    }, 150)
    return () => clearTimeout(timer)
  }, [map])
  
  // Additional effect to ensure map renders with routes
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize(true)
      console.log('Second invalidation completed')
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
  showDirections = true,
  showOverlaps = true,
  backgroundOpacity = 0.3
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
  
  console.log('InteractiveMap rendering:', {
    hasRoute1: !!route1,
    hasRoute2: !!route2,
    route1Points: route1Points.length,
    route2Points: route2Points.length,
    bounds
  })
  
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
        {showDirections && route1 && route1.arrows && route1.arrows.map((arrow, index) => (
          <Marker
            key={`route1-arrow-${index}`}
            position={[arrow.lat, arrow.lon]}
            icon={createArrowIcon(arrow.bearing, route1.color)}
          />
        ))}
        
        {/* Direction Arrows for Route 2 */}
        {showDirections && route2 && route2.arrows && route2.arrows.map((arrow, index) => (
          <Marker
            key={`route2-arrow-${index}`}
            position={[arrow.lat, arrow.lon]}
            icon={createArrowIcon(arrow.bearing, route2.color)}
          />
        ))}
        
        {/* Map event handlers */}
        <MapEventHandler onViewChange={onViewChange} syncView={syncView} />
        <BoundsHandler bounds={bounds} />
      </MapContainer>
    </div>
  )
})

InteractiveMap.displayName = 'InteractiveMap'

export default InteractiveMap