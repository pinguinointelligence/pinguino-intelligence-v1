import { BrowserRouter } from 'react-router';
import { AuthModalHost } from '@/features/auth/AuthModalHost';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppProviders } from './providers';
import { AppRoutes } from './router';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { PartnerReferralBridge } from '@/features/partner/PartnerReferralBridge';

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <AppRoutes />
          <AuthModalHost />
          <NotificationCenter />
          <PartnerReferralBridge />
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
