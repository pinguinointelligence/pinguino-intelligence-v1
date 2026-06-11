import { BrowserRouter } from 'react-router';
import { AppProviders } from './providers';
import { AppRoutes } from './router';

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
