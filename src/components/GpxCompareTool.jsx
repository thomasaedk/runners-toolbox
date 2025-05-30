import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

function GpxCompareTool() {
  const [files, setFiles] = useState({ file1: null, file2: null })
  const [resultImage, setResultImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState({ file1: false, file2: false })
  const { t } = useTranslation()
  const resultRef = useRef(null)

  // Scroll to result when image is loaded
  useEffect(() => {
    if (resultImage && resultRef.current) {
      setTimeout(() => {
        resultRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        })
      }, 100) // Small delay to ensure image is rendered
    }
  }, [resultImage])

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
    
    console.log('Drop event for', fileNumber, event.dataTransfer.files)
    
    // Reset drag active state
    setDragActive(prev => ({ ...prev, [fileNumber]: false }))
    
    // Check if there are files in the drop event
    if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) {
      console.log('No files in drop event')
      return // No files dropped, do nothing
    }
    
    const file = event.dataTransfer.files[0]
    console.log('File dropped:', file.name, file.type)
    
    // Check both file extension and MIME type
    const isValidGpx = (file.name && file.name.endsWith('.gpx')) || 
                       file.type === 'application/gpx+xml' ||
                       file.type === 'application/gpx' ||
                       file.type === 'text/xml'
    
    if (file && isValidGpx) {
      console.log('Valid GPX file, setting', fileNumber)
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
    console.log('Drag enter', fileNumber)
    setDragActive(prev => ({ ...prev, [fileNumber]: true }))
  }

  const handleDragLeave = (fileNumber, event) => {
    event.preventDefault()
    event.stopPropagation()
    console.log('Drag leave', fileNumber)
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

    try {
      const response = await fetch('/api/compare-gpx', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const blob = await response.blob()
        const imageUrl = URL.createObjectURL(blob)
        setResultImage(imageUrl)
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
      alert(t('gpxCompare.errors.connectionError'))
    } finally {
      setLoading(false)
    }
  }

  const clearFiles = () => {
    setFiles({ file1: null, file2: null })
    setResultImage(null)
  }

  return (
    <div className="tool-container">
      <h2>{t('gpxCompare.title')}</h2>
      <p>{t('gpxCompare.description')}</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <h3>{t('gpxCompare.firstFile')}</h3>
          <div 
            className={`file-upload-area ${dragActive.file1 ? 'drag-active' : ''}`}
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
            <label htmlFor="file1-input" className="upload-button">
              {t('gpxCompare.chooseFile')}
            </label>
            <p>{t('gpxCompare.dragDrop')}</p>
          </div>
          {files.file1 && (
            <div className="file-info">
              <strong>{t('gpxCompare.selected')}</strong> {files.file1.name}
              <br />
              <strong>{t('gpxCompare.size')}</strong> {(files.file1.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>

        <div>
          <h3>{t('gpxCompare.secondFile')}</h3>
          <div 
            className={`file-upload-area ${dragActive.file2 ? 'drag-active' : ''}`}
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
            <label htmlFor="file2-input" className="upload-button">
              {t('gpxCompare.chooseFile')}
            </label>
            <p>{t('gpxCompare.dragDrop')}</p>
          </div>
          {files.file2 && (
            <div className="file-info">
              <strong>{t('gpxCompare.selected')}</strong> {files.file2.name}
              <br />
              <strong>{t('gpxCompare.size')}</strong> {(files.file2.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '2rem 0' }}>
        <button 
          className="upload-button" 
          onClick={handleCompare}
          disabled={!files.file1 || !files.file2 || loading}
          style={{ marginRight: '1rem' }}
        >
          {loading ? t('gpxCompare.processing') : t('gpxCompare.compare')}
        </button>
        <button className="upload-button" onClick={clearFiles}>
          {t('gpxCompare.clearFiles')}
        </button>
      </div>

      {resultImage && (
        <div ref={resultRef}>
          <h3>{t('gpxCompare.comparisonResult')}</h3>
          <img src={resultImage} alt="GPX Comparison" className="result-image" />
        </div>
      )}
    </div>
  )
}

export default GpxCompareTool