import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/index.css';
import { App } from '@/app/App';
import { initSentryReporting } from '@/app/sentryReporting';
import { lockMobileScale } from '@/app/mobileScaleLock';

// Error monitoring: wires global error listeners immediately; initializes Sentry
// only when VITE_SENTRY_DSN is configured (fire-and-forget, never blocks render).
void initSentryReporting();

// Keep the phone layout at 1:1 (owner). The viewport meta does this everywhere except
// iOS Safari, which ignores it; this adds the gesture opt-out Safari does honour.
lockMobileScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
