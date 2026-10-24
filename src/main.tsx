import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { OutputView } from './output.tsx'
import { PairingView } from './PairingView.tsx'
import { PortalView } from './portal.tsx'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'
import '@aether/ui/tokens.css'
import '@aether/ui/widgets.css'
import './index.css'

// One bundle serves the editor, projector and authenticated player-pairing flow.
const query = new URLSearchParams(location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {query.has('pair') ? <AppErrorBoundary><PairingView /></AppErrorBoundary> : query.has('portal') ? <PortalView /> : query.has('output') ? <OutputView /> : <AppErrorBoundary><App /></AppErrorBoundary>}
  </StrictMode>,
)
