import { useEffect, useRef } from 'react'

// Simple elevation profile component
// In a real implementation, this would fetch elevation data from an API like Open Elevation
const ElevationProfile = ({ routePoints, onElevationData }) => {
  // Use real elevation data by default in production, mock in development
  const USE_REAL_ELEVATION = import.meta.env.VITE_USE_REAL_ELEVATION !== 'false'
  const canvasRef = useRef(null)
  
  // Fetch real elevation data from Open Elevation API
  const fetchRealElevation = async (points) => {
    if (points.length < 2) return { elevationData: [], totalAscent: 0, totalDescent: 0 }
    
    try {
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: points.map(p => ({ latitude: p.lat, longitude: p.lng }))
        })
      })
      
      if (!response.ok) {
        throw new Error(`Elevation API request failed with status ${response.status}`)
      }
      
      const data = await response.json()
      const elevations = data.results.map(r => r.elevation)
      
      // Calculate distance between points using Haversine formula
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
      
      let totalAscent = 0, totalDescent = 0, cumulativeDistance = 0
      const elevationData = []
      
      elevations.forEach((elevation, i) => {
        if (i > 0) {
          const segmentDistance = calculateDistance(
            points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng
          )
          cumulativeDistance += segmentDistance
          
          const elevationChange = elevation - elevations[i-1]
          if (elevationChange > 0) {
            totalAscent += elevationChange
          } else {
            totalDescent += Math.abs(elevationChange)
          }
        }
        
        elevationData.push({ 
          distance: cumulativeDistance, 
          elevation: elevation 
        })
      })
      
      return { elevationData, totalAscent, totalDescent }
      
    } catch (error) {
      console.error('Failed to fetch real elevation data, falling back to mock:', error)
      return generateMockElevation(points) // Fallback to mock
    }
  }
  
  // Generate mock elevation data for demonstration
  const generateMockElevation = (points) => {
    if (points.length < 2) return { elevationData: [], totalAscent: 0, totalDescent: 0 }
    
    const elevationData = []
    let cumulativeDistance = 0
    let totalAscent = 0
    let totalDescent = 0
    
    // Calculate distance between points using Haversine formula
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
    
    // Add first point with more reasonable starting elevation
    elevationData.push({
      distance: 0,
      elevation: 20 + Math.random() * 40 // Mock elevation between 20-60m
    })
    
    // Add subsequent points
    for (let i = 1; i < points.length; i++) {
      const segmentDistance = calculateDistance(
        points[i-1].lat, points[i-1].lng,
        points[i].lat, points[i].lng
      )
      cumulativeDistance += segmentDistance
      
      // Generate realistic elevation changes based on segment distance
      const prevElevation = elevationData[i-1].elevation
      // Scale elevation change based on distance - smaller changes for shorter segments
      const maxChangePerKm = 5 // Maximum 5m change per kilometer (reduced from 8m)
      const rawElevationChange = (Math.random() - 0.5) * maxChangePerKm * segmentDistance
      // Apply smoothing to prevent wild swings
      const smoothingFactor = 0.7
      const elevationChange = rawElevationChange * smoothingFactor
      const newElevation = Math.max(5, prevElevation + elevationChange) // Minimum 5m elevation
      
      // Calculate ascent and descent
      if (newElevation > prevElevation) {
        totalAscent += (newElevation - prevElevation)
      } else {
        totalDescent += (prevElevation - newElevation)
      }
      
      elevationData.push({
        distance: cumulativeDistance,
        elevation: newElevation
      })
    }
    
    return { elevationData, totalAscent, totalDescent }
  }
  
  const drawProfile = async () => {
    const canvas = canvasRef.current
    if (!canvas || routePoints.length < 2) return
    
    const ctx = canvas.getContext('2d')
    const width = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1)
    const height = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1)
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Get elevation data based on environment
    const { elevationData } = USE_REAL_ELEVATION 
      ? await fetchRealElevation(routePoints)
      : generateMockElevation(routePoints)
    
    if (elevationData.length < 2) return
    
    // Calculate scales
    const maxDistance = elevationData[elevationData.length - 1].distance
    const maxElevation = Math.max(...elevationData.map(d => d.elevation))
    const minElevation = Math.min(...elevationData.map(d => d.elevation))
    const elevationRange = maxElevation - minElevation || 100
    
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    
    // Draw background
    ctx.fillStyle = '#f8f9fa'
    ctx.fillRect(0, 0, width, height)
    
    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    
    // Vertical grid lines (distance)
    const distanceSteps = 5
    for (let i = 0; i <= distanceSteps; i++) {
      const x = padding + (i / distanceSteps) * chartWidth
      ctx.beginPath()
      ctx.moveTo(x, padding)
      ctx.lineTo(x, height - padding)
      ctx.stroke()
    }
    
    // Horizontal grid lines (elevation)
    const elevationSteps = 5
    for (let i = 0; i <= elevationSteps; i++) {
      const y = padding + (i / elevationSteps) * chartHeight
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(width - padding, y)
      ctx.stroke()
    }
    
    // Draw elevation profile
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 3
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
    
    ctx.beginPath()
    
    // Start from bottom left
    ctx.moveTo(padding, height - padding)
    
    // Draw profile line
    elevationData.forEach((point, index) => {
      const x = padding + (point.distance / maxDistance) * chartWidth
      const y = height - padding - ((point.elevation - minElevation) / elevationRange) * chartHeight
      
      if (index === 0) {
        ctx.lineTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    // Complete the fill area
    const lastPoint = elevationData[elevationData.length - 1]
    const lastX = padding + (lastPoint.distance / maxDistance) * chartWidth
    ctx.lineTo(lastX, height - padding)
    ctx.closePath()
    
    // Fill the area under the curve
    ctx.fill()
    
    // Stroke the elevation line
    ctx.beginPath()
    elevationData.forEach((point, index) => {
      const x = padding + (point.distance / maxDistance) * chartWidth
      const y = height - padding - ((point.elevation - minElevation) / elevationRange) * chartHeight
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()
    
    // Draw labels
    ctx.fillStyle = '#374151'
    ctx.font = '12px Inter, sans-serif'
    
    // Distance labels
    for (let i = 0; i <= distanceSteps; i++) {
      const distance = (i / distanceSteps) * maxDistance
      const x = padding + (i / distanceSteps) * chartWidth
      const label = distance.toFixed(1) + ' km'
      const textWidth = ctx.measureText(label).width
      ctx.fillText(label, x - textWidth / 2, height - 10)
    }
    
    // Elevation labels
    for (let i = 0; i <= elevationSteps; i++) {
      const elevation = minElevation + (i / elevationSteps) * elevationRange
      const y = height - padding - (i / elevationSteps) * chartHeight
      const label = Math.round(elevation) + ' m'
      ctx.fillText(label, 5, y + 4)
    }
    
  }
  
  useEffect(() => {
    const updateElevationData = async () => {
      if (routePoints.length >= 2) {
        const { totalAscent, totalDescent } = USE_REAL_ELEVATION 
          ? await fetchRealElevation(routePoints)
          : generateMockElevation(routePoints)
        
        if (onElevationData) {
          onElevationData({ totalAscent, totalDescent })
        }
      }
      drawProfile()
    }
    
    updateElevationData()
  }, [routePoints, onElevationData, USE_REAL_ELEVATION])
  
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas) {
        const container = canvas.parentElement
        const dpr = window.devicePixelRatio || 1
        
        // Set actual size
        canvas.width = container.clientWidth * dpr
        canvas.height = 200 * dpr
        
        // Scale canvas back down using CSS
        canvas.style.width = container.clientWidth + 'px'
        canvas.style.height = '200px'
        
        // Scale the drawing context so everything draws at the higher resolution
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        
        drawProfile()
      }
    }
    
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  if (routePoints.length < 2) {
    return (
      <div className="elevation-placeholder">
        <p><strong>Elevation Profile</strong></p>
        <p>Add at least 2 points to your route to see the elevation profile</p>
        <p className="elevation-note">
          Elevation data is fetched from the Open Elevation API.
        </p>
      </div>
    )
  }
  
  return (
    <div className="elevation-profile-container">
      <canvas 
        ref={canvasRef}
        className="elevation-canvas"
        width={600}
        height={200}
      />
      {!USE_REAL_ELEVATION && (
        <div className="elevation-info">
          <p className="elevation-note">
            <strong>Note:</strong> This elevation profile uses mock data for demonstration purposes.
            In production, real elevation data will be fetched from Open Elevation API.
          </p>
        </div>
      )}
    </div>
  )
}

export default ElevationProfile