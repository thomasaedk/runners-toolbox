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

// Calculate distance in meters between two points
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  return calculateDistance(lat1, lon1, lat2, lon2) * 1000
}

// Find the closest point on route2 to a given point on route1
const findClosestPoint = (point, route2Points, proximityThreshold) => {
  let minDistance = Infinity
  let closestPoint = null
  
  for (const point2 of route2Points) {
    const distance = calculateDistanceMeters(point.lat, point.lon, point2.lat, point2.lon)
    if (distance < minDistance) {
      minDistance = distance
      closestPoint = point2
    }
  }
  
  return minDistance <= proximityThreshold ? { point: closestPoint, distance: minDistance } : null
}

// Calculate bearing/direction vector between two points
const calculateBearing = (point1, point2) => {
  const dLon = (point2.lon - point1.lon) * Math.PI / 180
  const lat1 = point1.lat * Math.PI / 180
  const lat2 = point2.lat * Math.PI / 180
  
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  
  return Math.atan2(y, x)
}

// Calculate vector from preceding points for directional analysis
const getRouteVector = (routePoints, index, lookBackCount = 3) => {
  if (index < lookBackCount) {
    // Use available points from start
    const startIdx = Math.max(0, index - 1)
    const endIdx = Math.min(routePoints.length - 1, index + 1)
    if (startIdx === endIdx) return null
    return calculateBearing(routePoints[startIdx], routePoints[endIdx])
  }
  
  // Use preceding points to calculate direction vector
  const startPoint = routePoints[index - lookBackCount]
  const endPoint = routePoints[index]
  return calculateBearing(startPoint, endPoint)
}

// More accurate distance to line segment calculation
const distanceToLineSegment = (point, lineStart, lineEnd) => {
  const A = point.lat - lineStart.lat
  const B = point.lon - lineStart.lon
  const C = lineEnd.lat - lineStart.lat
  const D = lineEnd.lon - lineStart.lon
  
  const dot = A * C + B * D
  const lenSq = C * C + D * D
  
  if (lenSq === 0) {
    // Line segment is a point
    return calculateDistanceMeters(point.lat, point.lon, lineStart.lat, lineStart.lon)
  }
  
  let param = dot / lenSq
  
  let closestPoint
  if (param < 0) {
    closestPoint = lineStart
  } else if (param > 1) {
    closestPoint = lineEnd
  } else {
    closestPoint = {
      lat: lineStart.lat + param * C,
      lon: lineStart.lon + param * D
    }
  }
  
  return calculateDistanceMeters(point.lat, point.lon, closestPoint.lat, closestPoint.lon)
}

// Advanced proximity calculation using route direction vectors
const findMinDistanceToRouteWithDirection = (point, pointIndex, currentRoutePoints, otherRoutePoints, proximityThreshold) => {
  if (!otherRoutePoints || otherRoutePoints.length < 2) {
    return Infinity
  }
  
  // Get direction vector for current point
  const currentVector = getRouteVector(currentRoutePoints, pointIndex)
  
  let minDistance = Infinity
  let bestMatch = null
  
  for (let i = 0; i < otherRoutePoints.length - 1; i++) {
    const segmentDistance = distanceToLineSegment(point, otherRoutePoints[i], otherRoutePoints[i + 1])
    
    if (segmentDistance < proximityThreshold) {
      // If within threshold, check direction compatibility
      const otherVector = getRouteVector(otherRoutePoints, i)
      
      let directionCompatibility = 1 // Default if no direction info
      
      if (currentVector !== null && otherVector !== null) {
        // Calculate angular difference
        let angleDiff = Math.abs(currentVector - otherVector)
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff
        
        // Convert to compatibility score (1 = same direction, 0 = opposite)
        directionCompatibility = 1 - (angleDiff / Math.PI)
        
        // Weight the distance by direction compatibility
        const weightedDistance = segmentDistance / (0.3 + 0.7 * directionCompatibility)
        
        if (weightedDistance < minDistance) {
          minDistance = weightedDistance
          bestMatch = {
            distance: segmentDistance,
            directionCompatibility,
            weightedDistance
          }
        }
      } else if (segmentDistance < minDistance) {
        minDistance = segmentDistance
        bestMatch = {
          distance: segmentDistance,
          directionCompatibility: 1,
          weightedDistance: segmentDistance
        }
      }
    }
  }
  
  return bestMatch ? bestMatch.distance : minDistance
}

// Find minimum distance from a point to any segment of the route (legacy version)
const findMinDistanceToRoute = (point, routePoints, proximityThreshold) => {
  if (!routePoints || routePoints.length < 2) {
    return Infinity
  }
  
  let minDistance = Infinity
  
  for (let i = 0; i < routePoints.length - 1; i++) {
    const distance = distanceToLineSegment(point, routePoints[i], routePoints[i + 1])
    if (distance < minDistance) {
      minDistance = distance
    }
    
    // Early exit if we're already within threshold
    if (minDistance <= proximityThreshold) {
      return minDistance
    }
  }
  
  return minDistance
}

// Analyze route differences for both routes
const analyzeAllRouteDifferences = (route1Points, route2Points, proximityThreshold = 50) => {
  if (!route1Points || !route2Points || route1Points.length === 0 || route2Points.length === 0) {
    return { 
      commonSegments: [], 
      route1DifferenceSegments: [], 
      route2DifferenceSegments: [] 
    }
  }
  
  // Analyze route1 against route2
  const route1Analysis = analyzeRouteDifferences(route1Points, route2Points, proximityThreshold)
  // Analyze route2 against route1  
  const route2Analysis = analyzeRouteDifferences(route2Points, route1Points, proximityThreshold)
  
  return {
    commonSegments: route1Analysis.commonSegments,
    route1DifferenceSegments: route1Analysis.differenceSegments,
    route2DifferenceSegments: route2Analysis.differenceSegments
  }
}

// Analyze route differences based on proximity threshold with direction vectors
const analyzeRouteDifferences = (routePoints, otherRoutePoints, proximityThreshold = 50) => {
  if (!routePoints || !otherRoutePoints || routePoints.length === 0 || otherRoutePoints.length === 0) {
    return { commonSegments: [], differenceSegments: [] }
  }
  
  const commonSegments = []
  const differenceSegments = []
  let currentSegment = []
  let segmentType = null
  
  // Use all points for better accuracy, but with some optimization
  const stepSize = Math.max(1, Math.floor(routePoints.length / 1500)) // Max 1500 points for performance
  
  for (let i = 0; i < routePoints.length; i += stepSize) {
    const point = routePoints[i]
    
    // Use improved direction-aware proximity calculation
    const minDistance = findMinDistanceToRouteWithDirection(point, i, routePoints, otherRoutePoints, proximityThreshold * 2)
    const isClose = minDistance <= proximityThreshold
    const newSegmentType = isClose ? 'common' : 'different'
    
    if (segmentType !== newSegmentType) {
      // Finish previous segment
      if (currentSegment.length > 1) {
        if (segmentType === 'common') {
          commonSegments.push([...currentSegment])
        } else {
          differenceSegments.push([...currentSegment])
        }
      }
      
      // Start new segment
      currentSegment = [[point.lat, point.lon]]
      segmentType = newSegmentType
    } else {
      // Continue current segment
      currentSegment.push([point.lat, point.lon])
    }
  }
  
  // Add the final point if we didn't reach it
  if (routePoints.length > 1) {
    const finalPoint = routePoints[routePoints.length - 1]
    if (currentSegment.length === 0 || 
        currentSegment[currentSegment.length - 1][0] !== finalPoint.lat ||
        currentSegment[currentSegment.length - 1][1] !== finalPoint.lon) {
      currentSegment.push([finalPoint.lat, finalPoint.lon])
    }
  }
  
  // Save final segment
  if (currentSegment.length > 1) {
    if (segmentType === 'common') {
      commonSegments.push(currentSegment)
    } else {
      differenceSegments.push(currentSegment)
    }
  }
  
  return { commonSegments, differenceSegments }
}

// Generate markers for common segments
const generateCommonSegmentMarkers = (commonSegments, type = 'km', color = '#6B7280') => {
  if (!commonSegments || commonSegments.length === 0) return []
  
  const markers = []
  
  commonSegments.forEach((segment, segmentIndex) => {
    if (segment.length < 2) return
    
    // Convert segment back to points format
    const segmentPoints = segment.map(([lat, lon]) => ({ lat, lon }))
    
    if (type === 'km') {
      const kmMarkers = generateKilometerMarkers(segmentPoints, color)
      markers.push(...kmMarkers.map(marker => ({
        ...marker,
        key: `common-km-${segmentIndex}-${marker.kilometer}`
      })))
    } else if (type === 'arrows') {
      const arrowMarkers = generateDirectionArrows(segmentPoints, color)
      markers.push(...arrowMarkers.map((marker, index) => ({
        ...marker,
        key: `common-arrow-${segmentIndex}-${index}`
      })))
    }
  })
  
  return markers
}

// Generate direction arrows for a route
const generateDirectionArrows = (points, color) => {
  if (!points || points.length < 2) return []
  
  const arrows = []
  const arrowInterval = Math.max(10, Math.floor(points.length / 20)) // Show ~20 arrows max
  
  for (let i = arrowInterval; i < points.length; i += arrowInterval) {
    const prevPoint = points[i - 1]
    const currentPoint = points[i]
    
    const bearing = calculateBearing(prevPoint, currentPoint)
    const bearingDegrees = (bearing * 180 / Math.PI + 360) % 360
    
    arrows.push({
      lat: currentPoint.lat,
      lon: currentPoint.lon,
      bearing: bearingDegrees,
      color: color
    })
  }
  
  return arrows
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
  showStartEndMarkers = { route1: true, route2: true }
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
  
  
  
  const { route1, route2, bounds, proximityThreshold, highlightDifferences, showCommonSegments, showDifferenceSegments, showCommonDirections, showCommonKilometerMarkers } = routeData
  
  // Convert points to Leaflet format (handle null routes)
  const route1Points = route1 ? route1.points.map(p => [p.lat, p.lon]) : []
  const route2Points = route2 ? route2.points.map(p => [p.lat, p.lon]) : []
  
  // Analyze route differences if highlighting is enabled
  const routeDifferences = highlightDifferences && route1 && route2 && proximityThreshold
    ? analyzeAllRouteDifferences(route1.points, route2.points, proximityThreshold)
    : { commonSegments: [], route1DifferenceSegments: [], route2DifferenceSegments: [] }
  
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
        
        {/* Routes - either normal or with difference highlighting */}
        {highlightDifferences && (routeDifferences.commonSegments.length > 0 || routeDifferences.route1DifferenceSegments.length > 0 || routeDifferences.route2DifferenceSegments.length > 0) ? (
          <>
            {/* Common segments - neutral color */}
            {showCommonSegments && routeDifferences.commonSegments.map((segment, index) => (
              <Polyline
                key={`common-${index}`}
                positions={segment}
                color="#D946EF"
                weight={4}
                opacity={0.8}
              />
            ))}
            
            {/* Route 1 difference segments */}
            {showDifferenceSegments && route1 && routeDifferences.route1DifferenceSegments.map((segment, index) => (
              <Polyline
                key={`route1-diff-${index}`}
                positions={segment}
                color={route1.color}
                weight={5}
                opacity={1.0}
              />
            ))}
            
            {/* Route 2 difference segments */}
            {showDifferenceSegments && route2 && routeDifferences.route2DifferenceSegments.map((segment, index) => (
              <Polyline
                key={`route2-diff-${index}`}
                positions={segment}
                color={route2.color}
                weight={5}
                opacity={1.0}
              />
            ))}
          </>
        ) : (
          <>
            {/* Normal route rendering */}
            {route1 && route1Points && route1Points.length > 0 && (
              <Polyline
                positions={route1Points}
                color={route1.color}
                weight={4}
                opacity={0.8}
              />
            )}
            
            {route2 && route2Points && route2Points.length > 0 && (
              <Polyline
                positions={route2Points}
                color={route2.color}
                weight={4}
                opacity={0.8}
              />
            )}
          </>
        )}
        
        
        {/* Start/End Markers for Route 1 */}
        {route1 && showStartEndMarkers.route1 && (
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
        {route2 && showStartEndMarkers.route2 && (
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
        
        {/* Route 1 Kilometer Markers - hidden in differences view */}
        {route1 && showKilometerMarkers.route1 && !highlightDifferences && 
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
        
        {/* Route 2 Kilometer Markers - hidden in differences view */}
        {route2 && showKilometerMarkers.route2 && !highlightDifferences && 
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
        
        {/* Common Segments Direction Arrows */}
        {highlightDifferences && showCommonDirections && routeDifferences.commonSegments &&
          generateCommonSegmentMarkers(routeDifferences.commonSegments, 'arrows', '#D946EF').map((marker) => (
            <Marker
              key={marker.key}
              position={[marker.lat, marker.lon]}
              icon={createArrowIcon(marker.bearing, marker.color)}
            />
          ))
        }
        
        {/* Common Segments Kilometer Markers */}
        {highlightDifferences && showCommonKilometerMarkers && routeDifferences.commonSegments &&
          generateCommonSegmentMarkers(routeDifferences.commonSegments, 'km', '#D946EF').map((marker) => (
            <Marker
              key={marker.key}
              position={marker.position}
              icon={createKilometerIcon(marker.kilometer, marker.color)}
            >
              <Popup>
                <strong>Common Path</strong><br />
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