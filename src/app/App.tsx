import { BrowserRouter } from 'react-router';
import { AuthModalHost } from '@/features/auth/AuthModalHost';
import { AppProviders } from './providers';
import { AppRoutes } from './router';

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
        <AuthModalHost />
      </BrowserRouter>
    </AppProviders>
  );
}
