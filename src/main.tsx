import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import '@fontsource-variable/space-grotesk'
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'
import './i18n'
import './styles.css'
import { routerBasename } from './lib/basePath'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

const routerBase = routerBasename(import.meta.env.BASE_URL)

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <App />
    </BrowserRouter>
  </StrictMode>
)
