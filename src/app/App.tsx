import { BrowserRouter } from 'react-router';
import { AuthModalHost } from '@/features/auth/AuthModalHost';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppProviders } from './providers';
import { AppRoutes } from './router';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { PartnerReferralBridge } from '@/features/partner/PartnerReferralBridge';
import { ReferralClaimBridge } from '@/features/referral/ReferralClaimBridge';
import { ProductCountryBootstrap } from '@/features/global-catalog/ProductCountryBootstrap';

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <ProductCountryBootstrap />
          <AppRoutes />
          <AuthModalHost />
          <NotificationCenter />
          <PartnerReferralBridge />
          {/* „Poleć Gellatti” — a separate programme from Affiliate, so a
              separate bridge: PRO days, no application, no commission. */}
          <ReferralClaimBridge />
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
