import { useTranslation } from 'react-i18next'

function PlaceholderTool({ name }) {
  const { t } = useTranslation()

  return (
    <div className="tool-container">
      <h2>{name}</h2>
      <p>{t('placeholderTool.comingSoon')}</p>
      
      <div style={{ 
        background: '#f8f9fa', 
        border: '1px solid #e9ecef', 
        borderRadius: '8px', 
        padding: '2rem', 
        textAlign: 'center',
        color: '#6c757d'
      }}>
        <h3>{t('placeholderTool.underDevelopment')}</h3>
        <p>{t('placeholderTool.developmentMessage')}</p>
        <p>{t('placeholderTool.checkBack')}</p>
      </div>
    </div>
  )
}

export default PlaceholderTool