import { useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

function ControlPointMarker({ position, onMove }) {
  const markerRef = useRef()
  
  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target
          const newPos = marker.getLatLng()
          onMove(newPos)
        }
      }}
      ref={markerRef}
    >
    </Marker>
  )
}

function MapClickHandler({ onMapClick, isAddingControlPoints }) {
  useMapEvents({
    click: (e) => {
      if (isAddingControlPoints) {
        onMapClick(e.latlng)
      }
    }
  })
  return null
}

function RouteExtractor() {
  const [step, setStep] = useState(1) // 1: upload, 2: align, 3: extract
  const [imagePreview, setImagePreview] = useState(null)
  const [filename, setFilename] = useState('')
  const [controlPoints, setControlPoints] = useState([])
  const [isAddingControlPoints, setIsAddingControlPoints] = useState(false)
  const [mapCenter] = useState([55.6761, 12.5683]) // Copenhagen default
  const [routePoints, setRoutePoints] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [imageZoomed, setImageZoomed] = useState(false)
  
  const fileInputRef = useRef()
  const imageRef = useRef()

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setError('')
    setIsProcessing(true)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)

    // Upload to backend
    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await fetch('/api/upload-route-image', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setFilename(data.filename)
        setStep(2)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Upload failed')
      }
    } catch {
      setError('Network error during upload')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImageClick = (e) => {
    if (!isAddingControlPoints) {
      // If not adding control points, toggle zoom
      setImageZoomed(!imageZoomed)
      return
    }
    
    const rect = imageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // Calculate relative coordinates
    const relativeX = x / rect.width
    const relativeY = y / rect.height
    
    setControlPoints(prev => [...prev, {
      id: Date.now(),
      imageX: relativeX,
      imageY: relativeY,
      mapLat: null,
      mapLng: null
    }])
  }

  const handleMapClick = (latlng) => {
    if (!isAddingControlPoints) return
    
    // Find the most recent control point without map coordinates
    const unassignedPoint = controlPoints.find(cp => cp.mapLat === null)
    if (unassignedPoint) {
      setControlPoints(prev => prev.map(cp => 
        cp.id === unassignedPoint.id 
          ? { ...cp, mapLat: latlng.lat, mapLng: latlng.lng }
          : cp
      ))
    }
  }

  const startAddingControlPoints = () => {
    setIsAddingControlPoints(true)
    setControlPoints([])
  }

  const finishAddingControlPoints = async () => {
    setIsAddingControlPoints(false)
    
    const validPoints = controlPoints.filter(cp => cp.mapLat !== null && cp.mapLng !== null)
    if (validPoints.length < 3) {
      setError('Need at least 3 control points for alignment')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const requestData = {
        filename,
        controlPoints: validPoints
      }
      
      const response = await fetch('/api/align-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      })

      if (response.ok) {
        setStep(3)
      } else {
        const errorData = await response.json()
        setError(errorData.error + (errorData.details ? `\n\nDetails: ${errorData.details}` : ''))
      }
    } catch {
      setError('Network error during alignment')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRouteExtraction = async () => {
    setIsProcessing(true)
    setError('')

    try {
      const response = await fetch('/api/extract-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          routePoints
        })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        setDownloadUrl(url)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Route extraction failed')
      }
    } catch {
      setError('Network error during route extraction')
    } finally {
      setIsProcessing(false)
    }
  }

  const resetProcess = () => {
    setStep(1)
    setImagePreview(null)
    setFilename('')
    setControlPoints([])
    setRoutePoints([])
    setError('')
    setDownloadUrl('')
    setImageZoomed(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="tool-container">
      <h2>Route Extractor</h2>
      <p>Upload an image of a route map and extract it as a GPX file</p>

      {error && (
        <div style={{
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          padding: '1rem',
          margin: '1rem 0',
          color: '#c00',
          whiteSpace: 'pre-wrap'
        }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="upload-section">
          <h3>Step 1: Upload Route Image</h3>
          <p>Choose an image file that shows a route on a map</p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={isProcessing}
            style={{ marginBottom: '1rem' }}
          />
          
          {imagePreview && (
            <div style={{ marginTop: '1rem' }}>
              <img 
                src={imagePreview} 
                alt="Preview" 
                style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
              />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="alignment-section">
          <h3>Step 2: Align Image with Map</h3>
          <p>Click on the image and then on the corresponding location on the map to create control points</p>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <button 
              onClick={startAddingControlPoints}
              disabled={isAddingControlPoints || isProcessing}
            >
              Start Adding Control Points
            </button>
            <button 
              onClick={finishAddingControlPoints}
              disabled={!isAddingControlPoints || controlPoints.filter(cp => cp.mapLat !== null).length < 3 || isProcessing}
            >
              Finish Alignment ({controlPoints.filter(cp => cp.mapLat !== null).length}/3+ points)
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', height: '400px' }}>
            <div style={{ flex: 1 }}>
              <h4>Route Image {!isAddingControlPoints && <span style={{ fontSize: '0.8em', color: '#666' }}>(click to zoom)</span>}</h4>
              {imagePreview && (
                <div style={{ 
                  position: 'relative', 
                  height: '300px',
                  overflow: imageZoomed ? 'auto' : 'hidden',
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}>
                  <img 
                    ref={imageRef}
                    src={imagePreview} 
                    alt="Route to align"
                    onClick={handleImageClick}
                    style={{ 
                      width: imageZoomed ? 'auto' : '100%', 
                      height: imageZoomed ? 'auto' : '300px',
                      maxWidth: imageZoomed ? 'none' : '100%',
                      minHeight: imageZoomed ? '100%' : 'auto',
                      objectFit: imageZoomed ? 'none' : 'contain',
                      cursor: isAddingControlPoints ? 'crosshair' : 'pointer'
                    }}
                  />
                  {controlPoints.map((cp) => {
                    const imgRect = imageRef.current?.getBoundingClientRect()
                    const containerRect = imageRef.current?.parentElement?.getBoundingClientRect()
                    
                    let left, top
                    if (imageZoomed && imgRect && containerRect) {
                      // For zoomed view, calculate absolute position
                      const imgLeft = imgRect.left - containerRect.left
                      const imgTop = imgRect.top - containerRect.top
                      left = imgLeft + (cp.imageX * imgRect.width)
                      top = imgTop + (cp.imageY * imgRect.height)
                    } else {
                      // For normal view, use percentage
                      left = `${cp.imageX * 100}%`
                      top = `${cp.imageY * 100}%`
                    }
                    
                    return (
                      <div
                        key={cp.id}
                        style={{
                          position: 'absolute',
                          left: typeof left === 'number' ? `${left}px` : left,
                          top: typeof top === 'number' ? `${top}px` : top,
                          width: '10px',
                          height: '10px',
                          background: cp.mapLat ? 'green' : 'red',
                          borderRadius: '50%',
                          transform: 'translate(-50%, -50%)',
                          border: '2px solid white',
                          zIndex: 10
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </div>
            
            <div style={{ flex: 1 }}>
              <h4>Reference Map</h4>
              <MapContainer 
                center={mapCenter} 
                zoom={10} 
                style={{ height: '300px', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickHandler 
                  onMapClick={handleMapClick} 
                  isAddingControlPoints={isAddingControlPoints}
                />
                {controlPoints
                  .filter(cp => cp.mapLat !== null)
                  .map(cp => (
                    <Marker 
                      key={cp.id} 
                      position={[cp.mapLat, cp.mapLng]}
                    />
                  ))
                }
              </MapContainer>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="extraction-section">
          <h3>Step 3: Extract Route</h3>
          <p>Click "Extract Route" to automatically detect and extract the route as a GPX file</p>
          
          <div style={{ marginBottom: '1rem' }}>
            <button 
              onClick={handleRouteExtraction}
              disabled={isProcessing}
            >
              {isProcessing ? 'Extracting...' : 'Extract Route'}
            </button>
          </div>

          {downloadUrl && (
            <div style={{
              background: '#efe',
              border: '1px solid #cfc',
              borderRadius: '4px',
              padding: '1rem',
              margin: '1rem 0'
            }}>
              <h4>Success!</h4>
              <p>Your route has been extracted and converted to GPX format.</p>
              <a 
                href={downloadUrl} 
                download={`extracted_route_${filename}.gpx`}
                style={{
                  display: 'inline-block',
                  background: '#007bff',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  marginTop: '0.5rem'
                }}
              >
                Download GPX File
              </a>
            </div>
          )}
        </div>
      )}

      {(step > 1) && (
        <div style={{ marginTop: '2rem' }}>
          <button onClick={resetProcess}>Start Over</button>
        </div>
      )}

      {isProcessing && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{ 
            background: 'white', 
            padding: '2rem', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div>Processing...</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RouteExtractor