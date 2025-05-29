import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enTranslation from './locales/en/translation.json'
import daTranslation from './locales/da/translation.json'

const resources = {
  en: {
    translation: enTranslation
  },
  da: {
    translation: daTranslation
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      checkWhitelist: true
    },

    interpolation: {
      escapeValue: false
    },

    whitelist: ['en', 'da'],
    supportedLngs: ['en', 'da']
  })

export default i18n