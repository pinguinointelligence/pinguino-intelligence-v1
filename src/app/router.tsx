import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { HomePage } from '@/pages/home/HomePage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { MyRecipesPage } from '@/pages/recipes/MyRecipesPage';
import { StudioPage } from '@/pages/studio/StudioPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* Public demo entry — the AI-first Home (always a demo session). */}
      <Route path="/demo" element={<HomePage />} />
      {/* Advanced Studio · −11°C Engine — internal pro/test view, reached via the menu. */}
      <Route path="/studio" element={<StudioPage />} />
      {/* My Recipes (Phase 2A.2) — the page self-guards anonymous visitors. */}
      <Route path="/recipes" element={<MyRecipesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
