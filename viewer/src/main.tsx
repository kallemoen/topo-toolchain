import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App.tsx'
import { useToposStore } from './store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// When served by `topo view`, boot in live mode: stream the map over SSE.
if ((window as unknown as { __TOPO_LIVE__?: boolean }).__TOPO_LIVE__) {
  useToposStore.getState().connectLive()
}
