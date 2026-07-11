import { BrowserRouter } from 'react-router';
import { AuthModalHost } from '@/features/auth/AuthModalHost';
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
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
