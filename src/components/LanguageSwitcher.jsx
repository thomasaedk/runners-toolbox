import { useTranslation } from 'react-i18next'

function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  const changeLanguage = (lng) => {
    console.log('Language change requested:', lng)
    i18n.changeLanguage(lng)
  }

  return (
    <div className="language-switcher">
      <label htmlFor="language-select">{t('language.switch')}:</label>
      <select 
        id="language-select"
        value={i18n.language} 
        onChange={(e) => changeLanguage(e.target.value)}
        className="language-select"
      >
        <option value="en">{t('language.english')}</option>
        <option value="da">{t('language.danish')}</option>
      </select>
    </div>
  )
}

export default LanguageSwitcher