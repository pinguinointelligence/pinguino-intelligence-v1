import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/index.css';
import { App } from '@/app/App';
import { initSentryReporting } from '@/app/sentryReporting';

// Error monitoring: wires global error listeners immediately; initializes Sentry
// only when VITE_SENTRY_DSN is configured (fire-and-forget, never blocks render).
void initSentryReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
