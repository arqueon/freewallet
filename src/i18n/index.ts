import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { APP_NAME, DEFAULT_UI_LANGUAGE } from '@/app.config'
import en from './locales/en.json'
import es from './locales/es.json'
import { readStoredUiLanguage, supportedUiLanguageCodes } from './uiLanguages'

// An explicit choice from the language selector (persisted in localStorage)
// always wins; a first visit uses the configured deployment language.
const initialLanguage = readStoredUiLanguage() ?? DEFAULT_UI_LANGUAGE

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es }
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: supportedUiLanguageCodes(),
  interpolation: {
    escapeValue: false,
    defaultVariables: { appName: APP_NAME }
  }
})

document.documentElement.lang = initialLanguage
i18n.on('languageChanged', language => {
  document.documentElement.lang = language
})

export default i18n
