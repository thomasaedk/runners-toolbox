import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Simple elevation profile component
// In a real implementation, this would fetch elevation data from an API like Open Elevation
const ElevationProfile = ({ routePoints, onElevationData, hidden = false, calculationOnly = false }) => {
  const { t } = useTranslation()
  // Use real elevation data by default in production, mock in development
  const USE_REAL_ELEVATION = import.meta.env.VITE_USE_REAL_ELEVATION !== 'false'
  const canvasRef = useRef(null)
  const [isCalculating, setIsCalculating] = useState(false)
  
  
  // Fetch real elevation data from Open Elevation API
  const fetchRealElevation = async (points, signal) => {
    if (points.length < 2) return { elevationData: [], totalAscent: 0, totalDescent: 0 }
    
    try {
      // Try Open Elevation API first
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: points.map(p => ({ latitude: p.lat, longitude: p.lng }))
        }),
        signal: signal
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
    
    // Create deterministic "random" function based on coordinates to ensure consistent results
    const seededRandom = (lat, lng, index) => {
      const seed = Math.abs(Math.sin(lat * lng * (index + 1)) * 10000)
      return seed - Math.floor(seed)
    }
    
    // Add first point with more reasonable starting elevation (deterministic)
    const firstElevation = 20 + seededRandom(points[0].lat, points[0].lng, 0) * 40
    elevationData.push({
      distance: 0,
      elevation: firstElevation
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
      const randomValue = seededRandom(points[i].lat, points[i].lng, i)
      const rawElevationChange = (randomValue - 0.5) * maxChangePerKm * segmentDistance
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
    const abortController = new AbortController()
    
    const updateElevationData = async () => {
      if (routePoints.length >= 2) {
        try {
          // Set loading state for real elevation API calls
          if (USE_REAL_ELEVATION) {
            setIsCalculating(true)
          }
          
          const { totalAscent, totalDescent } = USE_REAL_ELEVATION 
            ? await fetchRealElevation(routePoints, abortController.signal)
            : generateMockElevation(routePoints)
          
          // Only update if this effect hasn't been cancelled (i.e., route points haven't changed again)
          if (!abortController.signal.aborted && onElevationData) {
            onElevationData({ totalAscent, totalDescent })
          }
        } catch (error) {
          // Don't show errors for aborted requests
          if (error.name !== 'AbortError') {
            console.error('Error calculating elevation data:', error)
            // Fallback to mock data if real elevation fails
            if (!abortController.signal.aborted) {
              const { totalAscent, totalDescent } = generateMockElevation(routePoints)
              if (onElevationData) {
                onElevationData({ totalAscent, totalDescent })
              }
            }
          }
        } finally {
          // Clear loading state
          if (!abortController.signal.aborted) {
            setIsCalculating(false)
          }
        }
      } else if (!abortController.signal.aborted && onElevationData) {
        onElevationData({ totalAscent: 0, totalDescent: 0 })
      }
      
      if (!abortController.signal.aborted && !hidden && !calculationOnly) {
        drawProfile()
      }
    }
    
    updateElevationData()
    
    // Cleanup function to cancel the effect if component unmounts or routePoints change
    return () => {
      abortController.abort()
    }
  }, [routePoints, USE_REAL_ELEVATION, hidden, calculationOnly])
  
  // Separate effect to ensure elevation data is reset when points are cleared
  useEffect(() => {
    if (routePoints.length < 2 && onElevationData) {
      onElevationData({ totalAscent: 0, totalDescent: 0 })
    }
  }, [routePoints.length, onElevationData])
  
  useEffect(() => {
    if (hidden || calculationOnly) return
    
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
  }, [hidden, calculationOnly])
  
  // If this is calculation-only mode, don't render anything visual
  if (calculationOnly) {
    return <div style={{ display: 'none' }}></div>
  }
  
  if (routePoints.length < 2) {
    return (
      <div className="elevation-placeholder">
        <p><strong>{t('routePlanner.stats.elevationProfile')}</strong></p>
        <p>{t('routePlanner.messages.addPointsForElevation')}</p>
        <p className="elevation-note">
          {t('routePlanner.messages.elevationDataSource')}
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
            {t('routePlanner.messages.mockDataNote')}
          </p>
        </div>
      )}
    </div>
  )
}

export default ElevationProfile