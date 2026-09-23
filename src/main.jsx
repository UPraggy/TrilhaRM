import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import { I18nProvider } from './i18n/index.jsx'
import './styles/tokens.css'
import './styles.css'
import './styles/base.css'
import './v2.css'
import './styles/motion.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
