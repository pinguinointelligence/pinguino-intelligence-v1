import { BrowserRouter } from 'react-router';
import { AuthModalHost } from '@/features/auth/AuthModalHost';
import { DesignReviewOverlay } from '@/features/design-review/ReviewOverlay';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppProviders } from './providers';
import { AppRoutes } from './router';

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <AppRoutes />
          <AuthModalHost />
          {/* Owner/QA design-review markers — dev/staging + pro capability ONLY;
              renders null for every normal customer session (Masterpiece Phase 3). */}
          <DesignReviewOverlay />
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
