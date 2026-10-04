import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/udg-*.spec.ts',
  webServer: {
    ...base.webServer,
    command: 'pnpm exec vite --cors --port 5273 --strictPort',
    url: 'http://localhost:5273',
    env: {
      VITE_WAS_SERVER_URL: '',
      VITE_DEFAULT_LANGUAGE: '',
      VITE_APP_NAME: '',
      VITE_APP_THEME: ''
    }
  }
})
