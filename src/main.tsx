import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import '@fontsource-variable/inter'
import '@/i18n'
import '@/lib/log'
import { InfoBoxProvider } from '@/context/InfoBoxProvider'
import { FreewalletThemeProvider } from '@/components/FreewalletThemeProvider'
import './index.css'
import '@/themes'
import App from './App'
import { APP_NAME } from '@/app.config'

document.title = APP_NAME
// Canonical hash routing keeps the one-use offer out of subsequent HTTP requests.
if (['/request', '/request.html', '/exchange'].includes(location.pathname)) {
  history.replaceState(null, '', `/#/request${location.search}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FreewalletThemeProvider>
      <HashRouter>
        <InfoBoxProvider>
          <App />
        </InfoBoxProvider>
      </HashRouter>
    </FreewalletThemeProvider>
  </StrictMode>
)

// Remove the static loading shell now that React has mounted.
document.getElementById('initial-loader')?.remove()
