import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import './styles/savora-ui.css' // 🎨 design-system glassmorphism (sv-)
import './i18n/index' // 🌍 i18n debe importarse antes que App
import { ThemeProvider } from './context/ThemeContext'
import { applyTheme, resolveInitialTheme } from './utils/theme'

// Aplica el tema ANTES del primer render para evitar parpadeo.
applyTheme(resolveInitialTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)