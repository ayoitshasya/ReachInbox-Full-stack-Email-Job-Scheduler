// Frontend entry point (referenced by frontend/index.html). Mounts the root
// React component (App.tsx) into the page's #root div and pulls in the
// global Tailwind stylesheet (index.css).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The `!` tells TypeScript we're sure #root exists in index.html — Vite's
// template always includes it. StrictMode enables extra React dev-time
// checks (e.g. detecting unsafe side effects) with no effect in production.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
