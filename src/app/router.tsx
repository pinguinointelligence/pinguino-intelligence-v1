import { Navigate, Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MapperBatch6Page } from '@/pages/dev/MapperBatch6Page';
import { MapperReviewPage } from '@/pages/dev/MapperReviewPage';
import { MapperStatusPage } from '@/pages/dev/MapperStatusPage';
import { MapperSmokePage } from '@/pages/dev/MapperSmokePage';
import { EnrichmentPreviewPage } from '@/pages/dev/EnrichmentPreviewPage';
import { SnapshotAuditPage } from '@/pages/dev/SnapshotAuditPage';
import { StudioPickerProofPage } from '@/pages/dev/StudioPickerProofPage';
import { IntakeHubPage } from '@/pages/dev/IntakeHubPage';
import { OcrIntakePage } from '@/pages/dev/OcrIntakePage';
import { OcrBatchPage } from '@/pages/dev/OcrBatchPage';
import { buildRealIntakeWiring } from '@/features/ocr-intake/ui/intakeWiring';
import { ReferenceProposalsPage } from '@/pages/dev/ReferenceProposalsPage';
import { SpineStatusPage } from '@/pages/dev/SpineStatusPage';
import { ProductIntelligencePreviewPage } from '@/pages/dev/ProductIntelligencePreviewPage';
import { PiCalculatedActivationPreviewPage } from '@/pages/dev/PiCalculatedActivationPreviewPage';
import { OptimizationPreviewPage } from '@/pages/dev/OptimizationPreviewPage';
import { BranchRecalculationPreviewPage } from '@/pages/dev/BranchRecalculationPreviewPage';
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

      {/* DEV-ONLY internal tools — registered only in a dev build, never linked in nav.
          In production import.meta.env.DEV is false, so the route is never created and
          MapperSmokePage is dead-code-eliminated from the bundle. */}
      {import.meta.env.DEV && <Route path="/dev/mapper-smoke" element={<MapperSmokePage />} />}
      {import.meta.env.DEV && <Route path="/dev/mapper-batch-6" element={<MapperBatch6Page />} />}
      {import.meta.env.DEV && <Route path="/dev/mapper-review" element={<MapperReviewPage />} />}
      {import.meta.env.DEV && <Route path="/dev/mapper-status" element={<MapperStatusPage />} />}
      {import.meta.env.DEV && <Route path="/dev/enrichment-preview" element={<EnrichmentPreviewPage />} />}
      {import.meta.env.DEV && <Route path="/dev/snapshot-audit" element={<SnapshotAuditPage />} />}
      {import.meta.env.DEV && <Route path="/dev/studio-picker-proof" element={<StudioPickerProofPage />} />}
      {import.meta.env.DEV && <Route path="/dev/intake-hub" element={<IntakeHubPage />} />}
      {import.meta.env.DEV && (
        <Route path="/dev/ocr-intake" element={<OcrIntakePage wiring={buildRealIntakeWiring()} />} />
      )}
      {import.meta.env.DEV && <Route path="/dev/ocr-batch" element={<OcrBatchPage />} />}
      {import.meta.env.DEV && <Route path="/dev/reference-proposals" element={<ReferenceProposalsPage />} />}
      {import.meta.env.DEV && <Route path="/dev/spine" element={<SpineStatusPage />} />}
      {import.meta.env.DEV && <Route path="/dev/product-intelligence-preview" element={<ProductIntelligencePreviewPage />} />}
      {import.meta.env.DEV && <Route path="/dev/pi-calculated-activation-preview" element={<PiCalculatedActivationPreviewPage />} />}
      {import.meta.env.DEV && <Route path="/dev/optimization-preview" element={<OptimizationPreviewPage />} />}
      {import.meta.env.DEV && <Route path="/dev/branch-recalculation-preview" element={<BranchRecalculationPreviewPage />} />}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
