import { useState } from 'react'
import { useTranslation } from 'react-i18next'

function GpxCompareTool() {
  const [files, setFiles] = useState({ file1: null, file2: null })
  const [resultImage, setResultImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

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
    const file = event.dataTransfer.files[0]
    if (file && file.name.endsWith('.gpx')) {
      setFiles(prev => ({ ...prev, [fileNumber]: file }))
    } else {
      alert(t('gpxCompare.errors.onlyGpxFilesDrop'))
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
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
            className="file-upload-area"
            onDrop={(e) => handleDrop('file1', e)}
            onDragOver={handleDragOver}
          >
            <input
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
            className="file-upload-area"
            onDrop={(e) => handleDrop('file2', e)}
            onDragOver={handleDragOver}
          >
            <input
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
        <div>
          <h3>{t('gpxCompare.comparisonResult')}</h3>
          <img src={resultImage} alt="GPX Comparison" className="result-image" />
        </div>
      )}
    </div>
  )
}

export default GpxCompareTool