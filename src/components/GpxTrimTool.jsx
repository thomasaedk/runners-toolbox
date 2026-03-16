import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

function parseGpx(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('Invalid GPX file')

  const points = []
  const trkpts = doc.querySelectorAll('trkpt')
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'))
    const lon = parseFloat(pt.getAttribute('lon'))
    const eleEl = pt.querySelector('ele')
    const timeEl = pt.querySelector('time')
    points.push({
      lat,
      lon,
      ele: eleEl ? parseFloat(eleEl.textContent) : 0,
      time: timeEl ? new Date(timeEl.textContent) : null,
      raw: pt
    })
  })
  return { points, doc }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatTime(date) {
  if (!date) return '--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(date) {
  if (!date) return '--'
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function createTrimMarkerIcon(color, label) {
  return L.divIcon({
    className: 'trim-marker-icon',
    html: `<div style="
      background: ${color};
      color: white;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 13px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

function FitBoundsOnce({ bounds }) {
  const map = useMap()
  const fittedRef = useRef(false)
  useEffect(() => {
    if (bounds && !fittedRef.current) {
      map.fitBounds(bounds, { padding: [30, 30] })
      fittedRef.current = true
    }
  }, [map, bounds])
  return null
}

function RecenterButton({ bounds }) {
  const { t } = useTranslation()
  const map = useMap()
  const handleClick = () => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }
  return (
    <button
      className="trim-recenter-btn"
      onClick={handleClick}
      title={t('gpxTrim.recenter')}
    >
      ⊡
    </button>
  )
}

function ElevationSlider({ points, rangeStart, rangeEnd, onRangeChange }) {
  const { t } = useTranslation()
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const draggingRef = useRef(null) // 'start' | 'end' | null
  const [hoveredHandle, setHoveredHandle] = useState(null)

  const totalPoints = points.length
  const hasTime = points[0]?.time != null

  // Calculate cumulative distances
  const distances = useRef([])
  useEffect(() => {
    const d = [0]
    for (let i = 1; i < points.length; i++) {
      d.push(d[i - 1] + haversineDistance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon))
    }
    distances.current = d
  }, [points])

  const padding = { left: 50, right: 20, top: 25, bottom: 35 }

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length < 2) return

    const container = canvas.parentElement
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = 180

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const chartW = width - padding.left - padding.right
    const chartH = height - padding.top - padding.bottom

    // Clear
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#f8f9fa'
    ctx.fillRect(0, 0, width, height)

    const elevations = points.map(p => p.ele)
    const minEle = Math.min(...elevations)
    const maxEle = Math.max(...elevations)
    const eleRange = (maxEle - minEle) || 50
    const totalDist = distances.current[distances.current.length - 1] || 1

    const xForIndex = (i) => padding.left + (distances.current[i] / totalDist) * chartW
    const yForEle = (ele) => padding.top + chartH - ((ele - minEle) / eleRange) * chartH

    // Grid
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * chartH
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
    }

    // Trimmed region shading (before start)
    if (rangeStart > 0) {
      const x1 = padding.left
      const x2 = xForIndex(rangeStart)
      ctx.fillStyle = 'rgba(156, 163, 175, 0.15)'
      ctx.fillRect(x1, padding.top, x2 - x1, chartH)
    }

    // Trimmed region shading (after end)
    if (rangeEnd < totalPoints - 1) {
      const x1 = xForIndex(rangeEnd)
      const x2 = width - padding.right
      ctx.fillStyle = 'rgba(156, 163, 175, 0.15)'
      ctx.fillRect(x1, padding.top, x2 - x1, chartH)
    }

    // Selected region fill
    {
      ctx.beginPath()
      ctx.moveTo(xForIndex(rangeStart), padding.top + chartH)
      for (let i = rangeStart; i <= rangeEnd; i++) {
        ctx.lineTo(xForIndex(i), yForEle(points[i].ele))
      }
      ctx.lineTo(xForIndex(rangeEnd), padding.top + chartH)
      ctx.closePath()
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
      ctx.fill()
    }

    // Trimmed elevation line (before)
    if (rangeStart > 0) {
      ctx.beginPath()
      ctx.strokeStyle = '#9ca3af'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      for (let i = 0; i <= rangeStart; i++) {
        const x = xForIndex(i)
        const y = yForEle(points[i].ele)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Trimmed elevation line (after)
    if (rangeEnd < totalPoints - 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#9ca3af'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      for (let i = rangeEnd; i < totalPoints; i++) {
        const x = xForIndex(i)
        const y = yForEle(points[i].ele)
        i === rangeEnd ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Selected elevation line
    ctx.beginPath()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2.5
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const x = xForIndex(i)
      const y = yForEle(points[i].ele)
      i === rangeStart ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Handle lines and labels
    const drawHandle = (index, label, color, isHovered) => {
      const x = xForIndex(index)

      // Vertical line
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = isHovered ? 3 : 2
      ctx.moveTo(x, padding.top)
      ctx.lineTo(x, padding.top + chartH)
      ctx.stroke()

      // Handle grip
      const gripY = padding.top + chartH + 8
      const gripW = 14
      const gripH = 18
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(x - gripW / 2, gripY, gripW, gripH, 3)
      ctx.fill()

      // Grip lines
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1
      for (let l = -3; l <= 3; l += 3) {
        ctx.beginPath()
        ctx.moveTo(x - 3, gripY + gripH / 2 + l)
        ctx.lineTo(x + 3, gripY + gripH / 2 + l)
        ctx.stroke()
      }

      // Time label above
      if (hasTime && points[index].time) {
        ctx.fillStyle = color
        ctx.font = 'bold 11px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(formatTime(points[index].time), x, padding.top - 8)
      }
    }

    drawHandle(rangeStart, 'S', '#10b981', hoveredHandle === 'start')
    drawHandle(rangeEnd, 'E', '#ef4444', hoveredHandle === 'end')

    // Axis labels - elevation
    ctx.fillStyle = '#6b7280'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const ele = minEle + (1 - i / 4) * eleRange
      const y = padding.top + (i / 4) * chartH
      ctx.fillText(Math.round(ele) + 'm', padding.left - 6, y + 4)
    }

    // Axis labels - distance
    ctx.textAlign = 'center'
    const distSteps = 5
    for (let i = 0; i <= distSteps; i++) {
      const dist = (i / distSteps) * totalDist
      const x = padding.left + (i / distSteps) * chartW
      ctx.fillText(dist.toFixed(1) + ' km', x, height - 5)
    }
  }, [points, rangeStart, rangeEnd, hoveredHandle, padding])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  useEffect(() => {
    const handleResize = () => drawChart()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawChart])

  const getIndexFromX = useCallback((clientX) => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const chartW = rect.width - padding.left - padding.right
    const totalDist = distances.current[distances.current.length - 1] || 1
    const targetDist = ((x - padding.left) / chartW) * totalDist

    // Find closest point index by distance
    let closest = 0
    let minDiff = Infinity
    for (let i = 0; i < distances.current.length; i++) {
      const diff = Math.abs(distances.current[i] - targetDist)
      if (diff < minDiff) {
        minDiff = diff
        closest = i
      }
    }
    return closest
  }, [padding, points])

  const getHandleAtX = useCallback((clientX) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const chartW = rect.width - padding.left - padding.right
    const totalDist = distances.current[distances.current.length - 1] || 1

    const startX = padding.left + (distances.current[rangeStart] / totalDist) * chartW
    const endX = padding.left + (distances.current[rangeEnd] / totalDist) * chartW
    const mouseX = clientX - rect.left
    const threshold = 12

    if (Math.abs(mouseX - startX) < threshold) return 'start'
    if (Math.abs(mouseX - endX) < threshold) return 'end'
    return null
  }, [rangeStart, rangeEnd, padding, points])

  const handlePointerDown = useCallback((e) => {
    const handle = getHandleAtX(e.clientX)
    if (handle) {
      draggingRef.current = handle
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [getHandleAtX])

  const handlePointerMove = useCallback((e) => {
    if (draggingRef.current) {
      const idx = getIndexFromX(e.clientX)
      if (draggingRef.current === 'start') {
        const newStart = Math.min(idx, rangeEnd - 1)
        onRangeChange(Math.max(0, newStart), rangeEnd)
      } else {
        const newEnd = Math.max(idx, rangeStart + 1)
        onRangeChange(rangeStart, Math.min(totalPoints - 1, newEnd))
      }
    } else {
      const handle = getHandleAtX(e.clientX)
      setHoveredHandle(handle)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.style.cursor = handle ? 'ew-resize' : 'default'
      }
    }
  }, [getIndexFromX, getHandleAtX, rangeStart, rangeEnd, totalPoints, onRangeChange])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null
  }, [])

  return (
    <div ref={containerRef} className="trim-elevation-slider">
      <canvas
        ref={canvasRef}
        className="trim-elevation-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          draggingRef.current = null
          setHoveredHandle(null)
        }}
      />
      <div className="trim-slider-hint">
        {t('gpxTrim.dragHandles')}
      </div>
    </div>
  )
}

function GpxTrimTool({ onStateChange }) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null)
  const [gpxData, setGpxData] = useState(null)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState(null)
  const [mapType, setMapType] = useState(() => localStorage.getItem('trim-map-type') || 'satellite')
  const fileInputRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (onStateChange) {
      onStateChange({ hasUnsavedWork: gpxData != null })
    }
  }, [gpxData, onStateChange])

  const processFile = useCallback((f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.gpx')) {
      setError(t('gpxTrim.errors.onlyGpxFiles'))
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError(t('gpxTrim.errors.fileTooLarge'))
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = parseGpx(e.target.result)
        if (result.points.length < 2) {
          setError(t('gpxTrim.errors.tooFewPoints'))
          return
        }
        setGpxData({ points: result.points, rawXml: e.target.result, fileName: f.name })
        setRangeStart(0)
        setRangeEnd(result.points.length - 1)
        setFile(f)
      } catch (err) {
        setError(t('gpxTrim.errors.parseError'))
      }
    }
    reader.readAsText(f)
  }, [t])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }, [processFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  const handleFileChange = useCallback((e) => {
    processFile(e.target.files[0])
  }, [processFile])

  const handleRangeChange = useCallback((start, end) => {
    setRangeStart(start)
    setRangeEnd(end)
  }, [])

  const handleClear = useCallback(() => {
    setFile(null)
    setGpxData(null)
    setRangeStart(0)
    setRangeEnd(0)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleMapTypeChange = useCallback((type) => {
    setMapType(type)
    localStorage.setItem('trim-map-type', type)
  }, [])

  const handleExport = useCallback(() => {
    if (!gpxData) return

    const selectedPoints = gpxData.points.slice(rangeStart, rangeEnd + 1)

    // Build GPX XML
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Runner's Toolbox - GPX Trim"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <trk>
    <name>Trimmed Track</name>
    <trkseg>
`
    selectedPoints.forEach(p => {
      gpx += `      <trkpt lat="${p.lat}" lon="${p.lon}">\n`
      if (p.ele !== 0) gpx += `        <ele>${p.ele}</ele>\n`
      if (p.time) gpx += `        <time>${p.time.toISOString()}</time>\n`
      gpx += `      </trkpt>\n`
    })

    gpx += `    </trkseg>
  </trk>
</gpx>`

    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const baseName = gpxData.fileName.replace(/\.gpx$/i, '')
    a.download = `${baseName}_trimmed.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }, [gpxData, rangeStart, rangeEnd])

  // Compute derived data
  const selectedPoints = gpxData ? gpxData.points.slice(rangeStart, rangeEnd + 1) : []
  const beforePoints = gpxData ? gpxData.points.slice(0, rangeStart + 1) : []
  const afterPoints = gpxData ? gpxData.points.slice(rangeEnd) : []

  const selectedLatLngs = selectedPoints.map(p => [p.lat, p.lon])
  const beforeLatLngs = beforePoints.map(p => [p.lat, p.lon])
  const afterLatLngs = afterPoints.map(p => [p.lat, p.lon])

  let bounds = null
  if (gpxData && gpxData.points.length > 0) {
    const lats = gpxData.points.map(p => p.lat)
    const lons = gpxData.points.map(p => p.lon)
    bounds = [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    ]
  }

  // Stats
  let selectedDistance = 0
  let selectedAscent = 0
  let selectedDescent = 0
  for (let i = 1; i < selectedPoints.length; i++) {
    selectedDistance += haversineDistance(
      selectedPoints[i - 1].lat, selectedPoints[i - 1].lon,
      selectedPoints[i].lat, selectedPoints[i].lon
    )
    const eleDiff = selectedPoints[i].ele - selectedPoints[i - 1].ele
    if (eleDiff > 0) selectedAscent += eleDiff
    else selectedDescent += Math.abs(eleDiff)
  }

  const hasTime = gpxData?.points[0]?.time != null
  const selectedDuration = hasTime && selectedPoints.length >= 2
    ? selectedPoints[selectedPoints.length - 1].time - selectedPoints[0].time
    : null

  const startMarkerIcon = createTrimMarkerIcon('#10b981', 'S')
  const endMarkerIcon = createTrimMarkerIcon('#ef4444', 'E')

  const tileUrl = mapType === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const tileAttribution = mapType === 'satellite'
    ? 'Tiles &copy; Esri'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  return (
    <div className="tool-container gpx-trim-tool">
      <h2>{t('gpxTrim.title')}</h2>
      <p className="tool-description">{t('gpxTrim.description')}</p>

      {!gpxData && (
        <div
          className={`file-upload-area ${dragActive ? 'dragover' : ''} ${file ? 'file-uploaded' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('gpxTrim.chooseFile')}
          </button>
          <p>{t('gpxTrim.dragDrop')}</p>
        </div>
      )}

      {error && <div className="trim-error">{error}</div>}

      {gpxData && (
        <div className="trim-workspace">
          <div className="trim-file-info">
            <div className="trim-file-name">
              <span className="file-icon">📄</span>
              <span>{gpxData.fileName}</span>
              <span className="trim-point-count">
                ({gpxData.points.length} {t('gpxTrim.points')})
              </span>
            </div>
            <button className="trim-clear-btn" onClick={handleClear}>
              {t('gpxTrim.clearFile')}
            </button>
          </div>

          <div className="trim-map-container map-container">
            <MapContainer
              ref={mapRef}
              center={[gpxData.points[0].lat, gpxData.points[0].lon]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url={tileUrl} attribution={tileAttribution} />
              <FitBoundsOnce bounds={bounds} />
              <RecenterButton bounds={bounds} />

              {/* Trimmed before - gray dashed */}
              {beforeLatLngs.length > 1 && (
                <Polyline
                  positions={beforeLatLngs}
                  pathOptions={{ color: '#9ca3af', weight: 4, opacity: 0.5, dashArray: '8 6' }}
                />
              )}

              {/* Trimmed after - gray dashed */}
              {afterLatLngs.length > 1 && (
                <Polyline
                  positions={afterLatLngs}
                  pathOptions={{ color: '#9ca3af', weight: 4, opacity: 0.5, dashArray: '8 6' }}
                />
              )}

              {/* Selected portion - bold blue with white outline */}
              {selectedLatLngs.length > 1 && (
                <>
                  <Polyline
                    positions={selectedLatLngs}
                    pathOptions={{ color: 'white', weight: 7, opacity: 0.9 }}
                  />
                  <Polyline
                    positions={selectedLatLngs}
                    pathOptions={{ color: '#3b82f6', weight: 4, opacity: 1 }}
                  />
                </>
              )}

              {/* Start marker */}
              {selectedPoints.length > 0 && (
                <Marker
                  position={[selectedPoints[0].lat, selectedPoints[0].lon]}
                  icon={startMarkerIcon}
                />
              )}

              {/* End marker */}
              {selectedPoints.length > 1 && (
                <Marker
                  position={[selectedPoints[selectedPoints.length - 1].lat, selectedPoints[selectedPoints.length - 1].lon]}
                  icon={endMarkerIcon}
                />
              )}
            </MapContainer>

            <div className="map-type-toggle-inline">
              <button
                className={`map-type-button-inline ${mapType === 'satellite' ? 'active' : ''}`}
                onClick={() => handleMapTypeChange('satellite')}
                title={t('gpxTrim.satellite')}
              >
                🛰️
              </button>
              <button
                className={`map-type-button-inline ${mapType === 'street' ? 'active' : ''}`}
                onClick={() => handleMapTypeChange('street')}
                title={t('gpxTrim.streetMap')}
              >
                🗺️
              </button>
            </div>
          </div>

          <div className="trim-elevation-section">
            <ElevationSlider
              points={gpxData.points}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onRangeChange={handleRangeChange}
            />
          </div>

          <div className="trim-stats">
            <div className="trim-stats-grid">
              <div className="trim-stat-card">
                <div className="trim-stat-label">{t('gpxTrim.stats.from')}</div>
                <div className="trim-stat-value">
                  {hasTime ? (
                    <>
                      <span className="trim-stat-time">{formatTime(gpxData.points[rangeStart].time)}</span>
                      <span className="trim-stat-date">{formatDate(gpxData.points[rangeStart].time)}</span>
                    </>
                  ) : (
                    <span>{t('gpxTrim.stats.point')} {rangeStart + 1}</span>
                  )}
                </div>
              </div>
              <div className="trim-stat-card">
                <div className="trim-stat-label">{t('gpxTrim.stats.to')}</div>
                <div className="trim-stat-value">
                  {hasTime ? (
                    <>
                      <span className="trim-stat-time">{formatTime(gpxData.points[rangeEnd].time)}</span>
                      <span className="trim-stat-date">{formatDate(gpxData.points[rangeEnd].time)}</span>
                    </>
                  ) : (
                    <span>{t('gpxTrim.stats.point')} {rangeEnd + 1}</span>
                  )}
                </div>
              </div>
              <div className="trim-stat-card">
                <div className="trim-stat-label">{t('gpxTrim.stats.distance')}</div>
                <div className="trim-stat-value">
                  <span className="trim-stat-number">{selectedDistance.toFixed(2)} km</span>
                </div>
              </div>
              {selectedDuration != null && (
                <div className="trim-stat-card">
                  <div className="trim-stat-label">{t('gpxTrim.stats.duration')}</div>
                  <div className="trim-stat-value">
                    <span className="trim-stat-number">{formatDuration(selectedDuration)}</span>
                  </div>
                </div>
              )}
              <div className="trim-stat-card">
                <div className="trim-stat-label">{t('gpxTrim.stats.elevation')}</div>
                <div className="trim-stat-value trim-stat-value-row">
                  <span className="trim-stat-number trim-ascent">+{Math.round(selectedAscent)}m</span>
                  <span className="trim-stat-separator">/</span>
                  <span className="trim-stat-number trim-descent">-{Math.round(selectedDescent)}m</span>
                </div>
              </div>
              <div className="trim-stat-card">
                <div className="trim-stat-label">{t('gpxTrim.stats.points')}</div>
                <div className="trim-stat-value">
                  <span className="trim-stat-number">{selectedPoints.length} / {gpxData.points.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="trim-export">
            <button className="trim-export-btn" onClick={handleExport}>
              {t('gpxTrim.exportGpx')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GpxTrimTool
