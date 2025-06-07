import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import DualMapView from './DualMapView'

function GpxCompareTool({ onStateChange }) {
  const [files, setFiles] = useState({ file1: null, file2: null })
  const [resultData, setResultData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDirections, setShowDirections] = useState(true)
  const [dragActive, setDragActive] = useState({ file1: false, file2: false })
  const [mapType, setMapType] = useState(() => {
    // Load map type preference from localStorage
    return localStorage.getItem('gpx-map-type') || 'satellite'
  })
  const { t } = useTranslation()
  const resultRef = useRef(null)

  // Check if files are uploaded or processing is in progress
  const hasUnsavedWork = files.file1 || files.file2 || loading

  // Notify parent component of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ hasUnsavedWork, loading })
    }
  }, [hasUnsavedWork, loading, onStateChange])

  // Scroll to result when data is loaded
  useEffect(() => {
    if (resultData && resultRef.current) {
      setTimeout(() => {
        resultRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        })
      }, 100) // Small delay to ensure component is rendered
    }
  }, [resultData])

  // Add beforeunload warning when files are uploaded or processing
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasUnsavedWork) {
        const message = loading 
          ? t('gpxCompare.warnings.processingInProgress')
          : t('gpxCompare.warnings.filesUploaded')
        event.preventDefault()
        event.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedWork, loading, t])

  const handleFileChange = (fileNumber, event) => {
    const file = event.target.files[0]
    if (file && file.name.endsWith('.gpx')) {
      setFiles(prev => ({ ...prev, [fileNumber]: file }))
    } else {
      alert(t('gpxCompare.errors.onlyGpxFiles'))
    }
  }

  const handleDrop = (fileNumber, event) => {
    event.preventDefault()
    event.stopPropagation()
    // console.log('Drop event for', fileNumber, event.dataTransfer.files)
    
    // Reset drag active state
    setDragActive(prev => ({ ...prev, [fileNumber]: false }))
    
    // Check if there are files in the drop event
    if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) {
      // console.log('No files in drop event')
      return // No files dropped, do nothing
    }
    
    const file = event.dataTransfer.files[0]
    // console.log('File dropped:', file.name, file.type)
    
    // Check both file extension and MIME type
    const isValidGpx = (file.name && file.name.endsWith('.gpx')) || 
                       file.type === 'application/gpx+xml' ||
                       file.type === 'application/gpx' ||
                       file.type === 'text/xml'
    
    if (file && isValidGpx) {
      // console.log('Valid GPX file, setting', fileNumber)
      setFiles(prev => ({ ...prev, [fileNumber]: file }))
    } else {
      console.log('Invalid file type. Name:', file.name, 'Type:', file.type)
      alert(t('gpxCompare.errors.onlyGpxFilesDrop'))
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()
    // Must set dropEffect for drop to work
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragEnter = (fileNumber, event) => {
    event.preventDefault()
    event.stopPropagation()
    // console.log('Drag enter', fileNumber)
    setDragActive(prev => ({ ...prev, [fileNumber]: true }))
  }

  const handleDragLeave = (fileNumber, event) => {
    event.preventDefault()
    event.stopPropagation()
    // console.log('Drag leave', fileNumber)
    setDragActive(prev => ({ ...prev, [fileNumber]: false }))
  }

  const handleCompare = async () => {
    if (!files.file1 || !files.file2) {
      alert(t('gpxCompare.errors.selectBothFiles'))
      return
    }

    setLoading(true)
    
    const formData = new FormData()
    formData.append('file1', files.file1)
    formData.append('file2', files.file2)
    formData.append('mapType', mapType)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout
      
      const response = await fetch('/api/compare-gpx-data', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        setResultData(data)
      } else {
        // Try to get error details from response
        try {
          const errorData = await response.json()
          console.error('Backend error:', errorData)
          alert(t('gpxCompare.errors.processError') + (errorData.details ? `\n\nDetails: ${errorData.details}` : ''))
        } catch (e) {
          alert(t('gpxCompare.errors.processError'))
        }
      }
    } catch (error) {
      console.error('Error:', error)
      if (error.name === 'AbortError') {
        alert(t('gpxCompare.errors.timeoutError'))
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        alert(t('gpxCompare.errors.networkError'))
      } else {
        alert(t('gpxCompare.errors.connectionError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMapTypeChange = (newMapType) => {
    setMapType(newMapType)
    // Save to localStorage
    localStorage.setItem('gpx-map-type', newMapType)
    // No need to clear result data as maps can switch backgrounds dynamically
  }

  const clearFiles = () => {
    setFiles({ file1: null, file2: null })
    setResultData(null)
  }

  return (
    <div className="tool-container">
      <h2>{t('gpxCompare.title')}</h2>
      <p>{t('gpxCompare.description')}</p>
      
      {/* Example GPX Files */}
      <div className="example-files">
        <span className="example-files-label">{t('gpxCompare.tryWithExamples')}</span>
        <a 
          href="https://connect.garmin.com/modern/proxy/course-service/course/gpx/278051153" 
          className="example-link"
          target="_blank"
          rel="noopener noreferrer"
          download="aarhus-city-half-2024.gpx"
        >
          Aarhus City Half 2024
        </a>
        <span className="example-separator">•</span>
        <a 
          href="https://connect.garmin.com/modern/proxy/course-service/course/gpx/356705289" 
          className="example-link"
          target="_blank"
          rel="noopener noreferrer"
          download="aarhus-city-half-2025.gpx"
        >
          Aarhus City Half 2025
        </a>
      </div>
      
      <div className="file-upload-grid">
        <div>
          <h3>{t('gpxCompare.firstFile')}</h3>
          <div 
            className={`file-upload-area ${dragActive.file1 ? 'drag-active' : ''} ${files.file1 ? 'file-uploaded' : ''}`}
            onDrop={(e) => handleDrop('file1', e)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter('file1', e)}
            onDragLeave={(e) => handleDragLeave('file1', e)}
          >
            <input
              key={files?.file1?.name}
              type="file"
              accept=".gpx"
              onChange={(e) => handleFileChange('file1', e)}
              style={{ display: 'none' }}
              id="file1-input"
            />
            {files.file1 ? (
              <>
                <div className="uploaded-file-info">
                  <div className="file-icon">📁</div>
                  <div className="file-details">
                    <div className="file-name">{files.file1.name}</div>
                    <div className="file-size">{(files.file1.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <label htmlFor="file1-input" className="upload-button replace-button">
                  {t('gpxCompare.replaceFile')}
                </label>
              </>
            ) : (
              <>
                <label htmlFor="file1-input" className="upload-button">
                  {t('gpxCompare.chooseFile')}
                </label>
                <p>{t('gpxCompare.dragDrop')}</p>
              </>
            )}
          </div>
        </div>

        <div>
          <h3>{t('gpxCompare.secondFile')}</h3>
          <div 
            className={`file-upload-area ${dragActive.file2 ? 'drag-active' : ''} ${files.file2 ? 'file-uploaded' : ''}`}
            onDrop={(e) => handleDrop('file2', e)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter('file2', e)}
            onDragLeave={(e) => handleDragLeave('file2', e)}
          >
            <input
              key={files?.file2?.name}
              type="file"
              accept=".gpx"
              onChange={(e) => handleFileChange('file2', e)}
              style={{ display: 'none' }}
              id="file2-input"
            />
            {files.file2 ? (
              <>
                <div className="uploaded-file-info">
                  <div className="file-icon">📁</div>
                  <div className="file-details">
                    <div className="file-name">{files.file2.name}</div>
                    <div className="file-size">{(files.file2.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <label htmlFor="file2-input" className="upload-button replace-button">
                  {t('gpxCompare.replaceFile')}
                </label>
              </>
            ) : (
              <>
                <label htmlFor="file2-input" className="upload-button">
                  {t('gpxCompare.chooseFile')}
                </label>
                <p>{t('gpxCompare.dragDrop')}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="button-container">
        <button 
          className="upload-button" 
          onClick={handleCompare}
          disabled={!files.file1 || !files.file2 || loading}
        >
          {loading ? t('gpxCompare.processing') : t('gpxCompare.compare')}
        </button>
        <button className="upload-button" onClick={clearFiles}>
          {t('gpxCompare.clearFiles')}
        </button>
      </div>

      {resultData && (
        <div ref={resultRef}>
          <h3>{t('gpxCompare.comparisonResult')}</h3>
          <DualMapView 
            routeData={resultData}
            mapType={mapType}
            showDirections={showDirections}
            showOverlaps={true}
            onMapTypeChange={handleMapTypeChange}
          />
          
        </div>
      )}
    </div>
  )
}

export default GpxCompareTool