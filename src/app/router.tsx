import { Navigate, Route, Routes, useLocation } from 'react-router';
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
import { AccountAccessDevPage } from '@/pages/dev/AccountAccessDevPage';
import { ProductVerificationDevPage } from '@/pages/dev/ProductVerificationDevPage';
import { IngredientResolutionDevPage } from '@/pages/dev/IngredientResolutionDevPage';
import { ProCoreRecipesDevPage } from '@/pages/dev/ProCoreRecipesDevPage';
import { ProCoreProductionDevPage } from '@/pages/dev/ProCoreProductionDevPage';
import { ProCoreCostsDevPage } from '@/pages/dev/ProCoreCostsDevPage';
import { buildRealIntakeWiring } from '@/features/ocr-intake/ui/intakeWiring';
import { ReferenceProposalsPage } from '@/pages/dev/ReferenceProposalsPage';
import { SpineStatusPage } from '@/pages/dev/SpineStatusPage';
import { ProductIntelligencePreviewPage } from '@/pages/dev/ProductIntelligencePreviewPage';
import { PiCalculatedActivationPreviewPage } from '@/pages/dev/PiCalculatedActivationPreviewPage';
import { OptimizationPreviewPage } from '@/pages/dev/OptimizationPreviewPage';
import { BranchRecalculationPreviewPage } from '@/pages/dev/BranchRecalculationPreviewPage';
import { PiMonitorDevPage } from '@/pages/dev/PiMonitorDevPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { MachineProfilePage } from '@/pages/profile/MachineProfilePage';
import { MyRecipesPage } from '@/pages/recipes/MyRecipesPage';
import { ProWorkspacePage } from '@/pages/pro/ProWorkspacePage';
import { CustomerShellV1 } from '@/features/customer-shell/CustomerShellV1';
import {
  APIPage,
  CreateIngredientPage,
  CreateLabelPage,
  ProductImportPage,
  RecipesHubPage,
  SubscriptionPage,
  WorkWithUsPage,
} from '@/pages/destinations';

/** The canonical PINGÜINO Pro recipe editor path — the ONE professional workspace (owner P0). */
export const PRO_RECIPE_PATH = '/pro/recipe';

/** Pure target of the /studio redirect: the canonical editor, query params preserved. */
export const studioRedirectTo = (search: string): { pathname: string; search: string } => ({
  pathname: PRO_RECIPE_PATH,
  search,
});

/**
 * `/studio` → the canonical PINGÜINO Pro recipe editor (owner P0, 2026-07-22): there is no
 * separate customer-facing Studio product. Useful query parameters are preserved so deep links
 * keep their meaning; `replace` keeps history clean.
 */
export function LegacyStudioRedirect() {
  const location = useLocation();
  return <Navigate to={studioRedirectTo(location.search)} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Slice A (owner-approved): public root is the LIGHT landing page (spec §6);
          the customer flow lives at /start behind the primary CTA. */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/start" element={<CustomerShellV1 />} />
      {/* Owner decision (2026-07-17): retire the legacy dark AI-chat Home — „no page
          may look legacy”. /classic now redirects into the light flow, like /demo.
          The HomePage component is kept in the tree, just unrouted. */}
      <Route path="/classic" element={<Navigate to="/start" replace />} />
      {/* Legacy /demo entry pointed at the flow → keep old links/bookmarks landing
          in the flow, not on the marketing page. */}
      <Route path="/demo" element={<Navigate to="/start" replace />} />
      {/* PINGÜINO Pro — the ONE canonical professional workspace (owner P0, 2026-07-22).
          /pro = workspace root (shows the recipe editor); /pro/<section> = stable section URLs
          (recipe/monitor/versions/production/history/costs/exports/settings — direct link +
          refresh restore the same section). */}
      <Route path="/pro" element={<ProWorkspacePage />} />
      <Route path="/pro/:section" element={<ProWorkspacePage />} />
      {/* There is NO separate Studio product: /studio and /calculator land in the canonical
          PINGÜINO Pro recipe editor (query params preserved for /studio deep links). */}
      <Route path="/studio" element={<LegacyStudioRedirect />} />
      <Route path="/calculator" element={<Navigate to={PRO_RECIPE_PATH} replace />} />

      {/* Recipes hub (browse) + the saved-recipes list (self-guards anonymous visitors). */}
      <Route path="/recipes" element={<RecipesHubPage />} />
      <Route path="/my-recipes" element={<MyRecipesPage />} />

      {/* Phase 6C Slice 3 nav destinations. */}
      <Route path="/label" element={<CreateLabelPage />} />
      <Route path="/api" element={<APIPage />} />
      <Route path="/work-with-us" element={<WorkWithUsPage />} />
      <Route path="/subscription" element={<SubscriptionPage />} />
      <Route path="/create-ingredient" element={<CreateIngredientPage />} />

      {/* Profil → Moja maszyna (UIUX Slice B §8.6) — view/change the saved Home machine. */}
      <Route path="/profile/machine" element={<MachineProfilePage />} />

      {/* Product catalog intake — direct-URL / internal-first (no nav entry yet). */}
      <Route path="/products/import" element={<ProductImportPage />} />

      {/* Legacy customer-shell preview path → the flow's new canonical /start. */}
      <Route path="/customer-v1" element={<Navigate to="/start" replace />} />

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
      {import.meta.env.DEV && <Route path="/dev/pi-monitor" element={<PiMonitorDevPage />} />}
      {import.meta.env.DEV && <Route path="/dev/account-access" element={<AccountAccessDevPage />} />}
      {import.meta.env.DEV && <Route path="/dev/product-verification" element={<ProductVerificationDevPage />} />}
      {import.meta.env.DEV && <Route path="/dev/ingredient-resolution" element={<IngredientResolutionDevPage />} />}
      {import.meta.env.DEV && <Route path="/dev/pro-recipes" element={<ProCoreRecipesDevPage />} />}
      {import.meta.env.DEV && <Route path="/dev/pro-production" element={<ProCoreProductionDevPage />} />}
      {import.meta.env.DEV && <Route path="/dev/pro-costs" element={<ProCoreCostsDevPage />} />}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
