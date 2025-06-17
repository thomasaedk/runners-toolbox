import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, Rectangle, SVGOverlay, useMap, useMapEvents } from 'react-leaflet'
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

// Calculate bearing between two points
const calculateBearing = (lat1, lon1, lat2, lon2) => {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon)
  
  return Math.atan2(y, x)
}

// Calculate perpendicular offset point for side-by-side rendering
const calculateOffsetPoint = (lat, lon, bearing, offsetMeters) => {
  const R = 6371000 // Earth's radius in meters
  const offsetBearing = bearing + Math.PI / 2 // Perpendicular to route direction
  
  const latRad = lat * Math.PI / 180
  const lonRad = lon * Math.PI / 180
  
  const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(offsetMeters / R) + 
                             Math.cos(latRad) * Math.sin(offsetMeters / R) * Math.cos(offsetBearing))
  
  const newLonRad = lonRad + Math.atan2(Math.sin(offsetBearing) * Math.sin(offsetMeters / R) * Math.cos(latRad),
                                       Math.cos(offsetMeters / R) - Math.sin(latRad) * Math.sin(newLatRad))
  
  return {
    lat: newLatRad * 180 / Math.PI,
    lon: newLonRad * 180 / Math.PI
  }
}

// Process routes to create side-by-side rendering for overlapping segments
const processRoutesForSideBySideRendering = (route1, route2) => {
  if (!route1 || !route2 || !route1.points || !route2.points) {
    return {
      route1Points: route1?.points?.map(p => [p.lat, p.lon]) || [],
      route2Points: route2?.points?.map(p => [p.lat, p.lon]) || []
    }
  }

  const OVERLAP_THRESHOLD = 15 // meters
  const OFFSET_DISTANCE = 8 // meters
  
  // Simple, safe approach: only apply small consistent offsets to avoid loops
  const route1Points = route1.points.map(p => [p.lat, p.lon])
  const route2Points = route2.points.map(p => [p.lat, p.lon])
  
  // Quick overlap check with much larger sampling to avoid performance issues
  let hasSignificantOverlap = false
  const sampleRate = Math.max(20, Math.floor(route1.points.length / 50)) // Sample less frequently
  
  for (let i = 0; i < route1.points.length && !hasSignificantOverlap; i += sampleRate) {
    const r1Point = route1.points[i]
    
    for (let j = 0; j < route2.points.length; j += sampleRate) {
      const r2Point = route2.points[j]
      const distance = calculateDistance(r1Point.lat, r1Point.lon, r2Point.lat, r2Point.lon) * 1000
      
      if (distance < OVERLAP_THRESHOLD) {
        hasSignificantOverlap = true
        break
      }
    }
  }
  
  // If routes overlap, apply very simple, consistent offset to entire routes
  if (hasSignificantOverlap) {
    // Calculate overall direction of each route (first to last point)
    const r1Start = route1.points[0]
    const r1End = route1.points[route1.points.length - 1]
    const r2Start = route2.points[0]
    const r2End = route2.points[route2.points.length - 1]
    
    const overallBearing1 = calculateBearing(r1Start.lat, r1Start.lon, r1End.lat, r1End.lon)
    const overallBearing2 = calculateBearing(r2Start.lat, r2Start.lon, r2End.lat, r2End.lon)
    
    // Apply small, consistent offset to all points (simple and smooth)
    return {
      route1Points: route1.points.map(point => {
        const offsetPoint = calculateOffsetPoint(point.lat, point.lon, overallBearing1, -OFFSET_DISTANCE * 0.5)
        return [offsetPoint.lat, offsetPoint.lon]
      }),
      route2Points: route2.points.map(point => {
        const offsetPoint = calculateOffsetPoint(point.lat, point.lon, overallBearing2, OFFSET_DISTANCE * 0.5)
        return [offsetPoint.lat, offsetPoint.lon]
      })
    }
  }
  
  return {
    route1Points: route1Points.map(p => [p.lat, p.lon]),
    route2Points: route2Points.map(p => [p.lat, p.lon])
  }
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
  showKilometerMarkers = { route1: false, route2: false },
  showStartEndMarkers = true,
  showCommonSegments = true,
  highlightDifferences = true,
  showDifferenceBoxes = true,
  differenceThreshold = 30
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
  
  // Process routes for side-by-side rendering when both routes exist
  const { route1Points, route2Points } = processRoutesForSideBySideRendering(route1, route2)
  
  
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
        
        {/* Route outlines - render first */}
        {route1 && route1Points && route1Points.length > 0 && (
          <Polyline
            positions={route1Points}
            color="white"
            weight={6}
            opacity={0.7}
            pane="overlayPane"
          />
        )}
        
        {route2 && route2Points && route2Points.length > 0 && (
          <Polyline
            positions={route2Points}
            color="white"
            weight={6}
            opacity={0.7}
            pane="overlayPane"
          />
        )}
        
        {/* Route 1 - Red line (always renders first to be underneath) */}
        {route1 && route1Points && route1Points.length > 0 && (
          <Polyline
            positions={route1Points}
            color="red"
            weight={4}
            opacity={0.8}
            pane="overlayPane"
          />
        )}
        
        {/* Route 2 - Blue line with transparency so red shows through */}
        {route2 && route2Points && route2Points.length > 0 && (
          <Polyline
            positions={route2Points}
            color="blue"
            weight={4}
            opacity={0.7}
            pane="overlayPane"
          />
        )}
        
        {/* Merged boxes around difference areas */}
        {showDifferenceBoxes && (() => {
          // Helper function to check if two boxes overlap
          const boxesOverlap = (box1, box2) => {
            const tolerance = 0.0001 // Small tolerance for floating point comparison
            return !(box1.maxLat < (box2.minLat - tolerance) || 
                     box1.minLat > (box2.maxLat + tolerance) ||
                     box1.maxLon < (box2.minLon - tolerance) || 
                     box1.minLon > (box2.maxLon + tolerance))
          }
          
          // Helper function to merge two boxes
          const mergeTwoBoxes = (box1, box2) => {
            return {
              minLat: Math.min(box1.minLat, box2.minLat),
              maxLat: Math.max(box1.maxLat, box2.maxLat),
              minLon: Math.min(box1.minLon, box2.minLon),
              maxLon: Math.max(box1.maxLon, box2.maxLon)
            }
          }
          
          // Complete merging function that iteratively merges until no more overlaps
          const mergeOverlappingBoxes = (boxes) => {
            if (boxes.length === 0) return []
            
            let merged = [...boxes] // Start with a copy of all boxes
            let changed = true
            
            // Keep merging until no more changes occur
            while (changed) {
              changed = false
              const newMerged = []
              const used = new Set() // Track which boxes have been merged
              
              for (let i = 0; i < merged.length; i++) {
                if (used.has(i)) continue
                
                let currentBox = merged[i]
                let mergedWithSomething = false
                
                // Check if current box overlaps with any later box
                for (let j = i + 1; j < merged.length; j++) {
                  if (used.has(j)) continue
                  
                  if (boxesOverlap(currentBox, merged[j])) {
                    // Merge the boxes
                    currentBox = mergeTwoBoxes(currentBox, merged[j])
                    used.add(j) // Mark the merged box as used
                    mergedWithSomething = true
                    changed = true
                  }
                }
                
                used.add(i) // Mark current box as used
                newMerged.push(currentBox)
              }
              
              merged = newMerged
            }
            
            return merged
          }
          
          // Collect all difference area boxes from both routes
          const allDifferenceBoxes = []
          const thresholdInDegrees = differenceThreshold / 111000 // Convert threshold meters to degrees
          
          // Add Route 1 difference boxes
          if (route1 && route1.segments) {
            route1.segments.forEach((segment, index) => {
              if (segment.is_different && segment.points.length >= 2) {
                const segmentLats = segment.points.map(p => p.lat)
                const segmentLons = segment.points.map(p => p.lon)
                const minLat = Math.min(...segmentLats)
                const maxLat = Math.max(...segmentLats)
                const minLon = Math.min(...segmentLons)
                const maxLon = Math.max(...segmentLons)
                
                const latPadding = Math.max((maxLat - minLat) * 0.3, thresholdInDegrees)
                const lonPadding = Math.max((maxLon - minLon) * 0.3, thresholdInDegrees)
                
                allDifferenceBoxes.push({
                  minLat: minLat - latPadding,
                  maxLat: maxLat + latPadding,
                  minLon: minLon - lonPadding,
                  maxLon: maxLon + lonPadding
                })
              }
            })
          }
          
          // Add Route 2 difference boxes
          if (route2 && route2.segments) {
            route2.segments.forEach((segment, index) => {
              if (segment.is_different && segment.points.length >= 2) {
                const segmentLats = segment.points.map(p => p.lat)
                const segmentLons = segment.points.map(p => p.lon)
                const minLat = Math.min(...segmentLats)
                const maxLat = Math.max(...segmentLats)
                const minLon = Math.min(...segmentLons)
                const maxLon = Math.max(...segmentLons)
                
                const latPadding = Math.max((maxLat - minLat) * 0.3, thresholdInDegrees)
                const lonPadding = Math.max((maxLon - minLon) * 0.3, thresholdInDegrees)
                
                allDifferenceBoxes.push({
                  minLat: minLat - latPadding,
                  maxLat: maxLat + latPadding,
                  minLon: minLon - lonPadding,
                  maxLon: maxLon + lonPadding
                })
              }
            })
          }
          
          // Merge overlapping boxes
          const mergedBoxes = mergeOverlappingBoxes(allDifferenceBoxes)
          
          // Render merged boxes
          return mergedBoxes.map((box, index) => (
            <Rectangle
              key={`merged-diff-box-${index}`}
              bounds={[
                [box.minLat, box.minLon],
                [box.maxLat, box.maxLon]
              ]}
              pathOptions={{
                color: 'darkblue',
                weight: 3,
                opacity: 0.8,
                fillOpacity: 0,
                dashArray: '10, 10'
              }}
            />
          ))
        })()}
        
        {/* Difference area highlighting rectangles with fill */}
        {highlightDifferences && (() => {
          // Get merged difference boxes (reuse the same logic)
          const allDifferenceBoxes = []
          const thresholdInDegrees = differenceThreshold / 111000
          
          // Helper functions (same as above)
          const boxesOverlap = (box1, box2) => {
            const tolerance = 0.0001
            return !(box1.maxLat < (box2.minLat - tolerance) || 
                     box1.minLat > (box2.maxLat + tolerance) ||
                     box1.maxLon < (box2.minLon - tolerance) || 
                     box1.minLon > (box2.maxLon + tolerance))
          }
          
          const mergeTwoBoxes = (box1, box2) => {
            return {
              minLat: Math.min(box1.minLat, box2.minLat),
              maxLat: Math.max(box1.maxLat, box2.maxLat),
              minLon: Math.min(box1.minLon, box2.minLon),
              maxLon: Math.max(box1.maxLon, box2.maxLon)
            }
          }
          
          const mergeOverlappingBoxes = (boxes) => {
            if (boxes.length === 0) return []
            let merged = [...boxes]
            let changed = true
            
            while (changed) {
              changed = false
              const newMerged = []
              const used = new Set()
              
              for (let i = 0; i < merged.length; i++) {
                if (used.has(i)) continue
                let currentBox = merged[i]
                
                for (let j = i + 1; j < merged.length; j++) {
                  if (used.has(j)) continue
                  if (boxesOverlap(currentBox, merged[j])) {
                    currentBox = mergeTwoBoxes(currentBox, merged[j])
                    used.add(j)
                    changed = true
                  }
                }
                used.add(i)
                newMerged.push(currentBox)
              }
              merged = newMerged
            }
            return merged
          }
          
          // Collect boxes from both routes
          if (route1 && route1.segments) {
            route1.segments.forEach((segment) => {
              if (segment.is_different && segment.points.length >= 2) {
                const segmentLats = segment.points.map(p => p.lat)
                const segmentLons = segment.points.map(p => p.lon)
                const minLat = Math.min(...segmentLats)
                const maxLat = Math.max(...segmentLats)
                const minLon = Math.min(...segmentLons)
                const maxLon = Math.max(...segmentLons)
                const latPadding = Math.max((maxLat - minLat) * 0.3, thresholdInDegrees)
                const lonPadding = Math.max((maxLon - minLon) * 0.3, thresholdInDegrees)
                
                allDifferenceBoxes.push({
                  minLat: minLat - latPadding,
                  maxLat: maxLat + latPadding,
                  minLon: minLon - lonPadding,
                  maxLon: maxLon + lonPadding
                })
              }
            })
          }
          
          if (route2 && route2.segments) {
            route2.segments.forEach((segment) => {
              if (segment.is_different && segment.points.length >= 2) {
                const segmentLats = segment.points.map(p => p.lat)
                const segmentLons = segment.points.map(p => p.lon)
                const minLat = Math.min(...segmentLats)
                const maxLat = Math.max(...segmentLats)
                const minLon = Math.min(...segmentLons)
                const maxLon = Math.max(...segmentLons)
                const latPadding = Math.max((maxLat - minLat) * 0.3, thresholdInDegrees)
                const lonPadding = Math.max((maxLon - minLon) * 0.3, thresholdInDegrees)
                
                allDifferenceBoxes.push({
                  minLat: minLat - latPadding,
                  maxLat: maxLat + latPadding,
                  minLon: minLon - lonPadding,
                  maxLon: maxLon + lonPadding
                })
              }
            })
          }
          
          const mergedBoxes = mergeOverlappingBoxes(allDifferenceBoxes)
          
          if (mergedBoxes.length === 0) return null
          
          // Create bright highlight rectangles over difference areas
          return mergedBoxes.map((box, index) => (
            <Rectangle
              key={`highlight-${index}`}
              bounds={[
                [box.minLat, box.minLon],
                [box.maxLat, box.maxLon]
              ]}
              pathOptions={{
                color: 'yellow',
                weight: 0,
                opacity: 0,
                fillColor: 'yellow',
                fillOpacity: 0.3
              }}
            />
          ))
        })()}
        
        {/* Start/End Markers for Route 1 */}
        {showStartEndMarkers && route1 && (
          <>
            <Marker
              position={[route1.start.lat, route1.start.lon]}
              icon={createCustomIcon('red', 'start')}
            >
              <Popup>
                <strong>{route1.name}</strong><br />
                Start Point
              </Popup>
            </Marker>
            
            <Marker
              position={[route1.end.lat, route1.end.lon]}
              icon={createCustomIcon('red', 'end')}
            >
              <Popup>
                <strong>{route1.name}</strong><br />
                End Point
              </Popup>
            </Marker>
          </>
        )}
        
        {/* Start/End Markers for Route 2 */}
        {showStartEndMarkers && route2 && (
          <>
            <Marker
              position={[route2.start.lat, route2.start.lon]}
              icon={createCustomIcon('blue', 'start')}
            >
              <Popup>
                <strong>{route2.name}</strong><br />
                Start Point
              </Popup>
            </Marker>
            
            <Marker
              position={[route2.end.lat, route2.end.lon]}
              icon={createCustomIcon('blue', 'end')}
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
            icon={createArrowIcon(arrow.bearing, 'red')}
          />
        ))}
        
        {/* Direction Arrows for Route 2 */}
        {(typeof showDirections === 'boolean' ? showDirections : showDirections.route2) && route2 && route2.arrows && route2.arrows.map((arrow, index) => (
          <Marker
            key={`route2-arrow-${index}`}
            position={[arrow.lat, arrow.lon]}
            icon={createArrowIcon(arrow.bearing, 'blue')}
          />
        ))}
        
        {/* Kilometer Markers for Route 1 */}
        {showKilometerMarkers.route1 && route1 && route1.points && 
          generateKilometerMarkers(route1.points, 'red').map((marker, index) => (
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
          generateKilometerMarkers(route2.points, 'blue').map((marker, index) => (
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