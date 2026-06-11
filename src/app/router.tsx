import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { StudioPage } from '@/pages/studio/StudioPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<StudioPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
