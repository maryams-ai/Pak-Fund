// Entry point: puts the React app into <div id="root"> in index.html.
//
// Wrapping order (outside -> inside):
//   BrowserRouter  -> lets pages use links and the URL
//   AuthProvider   -> lets pages know who is logged in
//   App            -> the list of routes (pages)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { supabase } from './lib/supabase'
import { APP_NAME } from './config'
import SetupMissing from './pages/SetupMissing'

document.title = APP_NAME

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {supabase ? (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <SetupMissing />
    )}
  </StrictMode>,
)
