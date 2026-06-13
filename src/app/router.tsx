import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { StudioPage } from '@/pages/studio/StudioPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* Public demo entry — always a demo session (redacted corrections). */}
      <Route path="/demo" element={<StudioPage forceDemo />} />
      {/* Studio keeps the current session level (internal pro/test preview). */}
      <Route path="/studio" element={<StudioPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
