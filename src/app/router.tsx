import { Navigate, Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { HomePage } from '@/pages/home/HomePage';
import { MyRecipesPage } from '@/pages/recipes/MyRecipesPage';
import { StudioPage } from '@/pages/studio/StudioPage';
import {
  APIPage,
  CreateIngredientPage,
  CreateLabelPage,
  ProductImportPage,
  RecipesHubPage,
  SubscriptionPage,
  WorkWithUsPage,
} from '@/pages/destinations';

export function AppRoutes() {
  return (
    <Routes>
      {/* AI-first Home on the premium black shell (Phase 6C) — always Free Preview. */}
      <Route path="/" element={<HomePage />} />
      {/* Legacy /demo entry → Home (kept so old links/bookmarks still land). */}
      <Route path="/demo" element={<Navigate to="/" replace />} />
      {/* Advanced Studio · −11°C Engine. */}
      <Route path="/studio" element={<StudioPage />} />
      {/* PI Calculator → Advanced Studio (no intermediate surface). */}
      <Route path="/calculator" element={<Navigate to="/studio" replace />} />

      {/* Recipes hub (browse) + the saved-recipes list (self-guards anonymous visitors). */}
      <Route path="/recipes" element={<RecipesHubPage />} />
      <Route path="/my-recipes" element={<MyRecipesPage />} />

      {/* Phase 6C Slice 3 nav destinations. */}
      <Route path="/label" element={<CreateLabelPage />} />
      <Route path="/api" element={<APIPage />} />
      <Route path="/work-with-us" element={<WorkWithUsPage />} />
      <Route path="/subscription" element={<SubscriptionPage />} />
      <Route path="/create-ingredient" element={<CreateIngredientPage />} />

      {/* Product catalog intake — direct-URL / internal-first (no nav entry yet). */}
      <Route path="/products/import" element={<ProductImportPage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
