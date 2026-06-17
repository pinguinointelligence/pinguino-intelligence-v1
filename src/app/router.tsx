import { Navigate, Route, Routes } from 'react-router';
import { copy } from '@/copy/en';
import { ComingSoonSurface } from '@/pages/ComingSoonSurface';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { HomePage } from '@/pages/home/HomePage';
import { MyRecipesPage } from '@/pages/recipes/MyRecipesPage';
import { StudioPage } from '@/pages/studio/StudioPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* AI-first Home on the premium black shell (Phase 6C) — always Free Preview. */}
      <Route path="/" element={<HomePage />} />
      {/* Legacy /demo entry → Home (kept so old links/bookmarks still land). */}
      <Route path="/demo" element={<Navigate to="/" replace />} />
      {/* Advanced Studio · −11°C Engine — internal pro/test view (white chrome in Slice 1). */}
      <Route path="/studio" element={<StudioPage />} />
      {/* My Recipes (Phase 2A.2) — the page self-guards anonymous visitors. */}
      <Route path="/recipes" element={<MyRecipesPage />} />

      {/* Phase 6C nav placeholder destinations — framework only; content in Slice 3. */}
      <Route path="/calculator" element={<ComingSoonSurface title={copy.nav.calculator.title} />} />
      <Route path="/label" element={<ComingSoonSurface title={copy.nav.label.title} />} />
      <Route path="/api" element={<ComingSoonSurface title={copy.nav.api.title} />} />
      <Route path="/work-with-us" element={<ComingSoonSurface title={copy.nav.work.title} />} />
      <Route path="/subscription" element={<ComingSoonSurface title={copy.nav.subscription.title} />} />
      <Route
        path="/create-ingredient"
        element={<ComingSoonSurface title={copy.nav.ingredient.title} />}
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
