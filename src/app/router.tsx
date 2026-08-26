import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { legacyDestinationRedirectTo } from './redirectState';
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
import { MachineProfilePage } from '@/pages/profile/MachineProfilePage';
import { ProWorkspacePage } from '@/pages/pro/ProWorkspacePage';
import { CommunityPage } from '@/pages/community/CommunityPage';
import { CreatorHandleRoute, PublicRecipeRoute } from '@/pages/community/HandleRoute';
import { CreatorHubPage } from '@/pages/community/CreatorHubPage';
import { PartnerPage } from '@/pages/community/PartnerPage';
import { PartnerPublicRoute } from '@/pages/community/PartnerPublicRoute';
import { AdminWorkspacePage } from '@/pages/admin/AdminWorkspacePage';
import { AdminRouteGuard } from '@/features/admin/AdminRouteGuard';
import { RoleAwareEntryRoute } from '@/features/auth/RoleAwareEntryRoute';
import { SharedRecipePage } from '@/pages/community/SharedRecipePage';
import { TopHundredPage } from '@/pages/community/TopHundredPage';
import {
  APIPage,
  AccountSettingsPage,
  FranchisePage,
  HowItWorksPage,
  LabelsHubPage,
  ProductImportPage,
  ProductScanPage,
  ProductScannerV1Page,
  ProductsHubPage,
  ProductionHubPage,
  RecipesHubPage,
  ShopPage,
  SubscriptionPage,
  WorkWithUsPage,
} from '@/pages/destinations';

/** The canonical PINGÜINO Pro recipe editor path — the ONE professional workspace (owner P0). */
export const PRO_RECIPE_PATH = '/pro/recipe';

/** Pure target of the /studio redirect: the canonical editor, deep-link state preserved. */
export const studioRedirectTo = (
  search: string,
  hash = '',
): { pathname: string; search: string; hash: string } => ({
  pathname: PRO_RECIPE_PATH,
  search,
  hash,
});

/**
 * `/studio` → the canonical PINGÜINO Pro recipe editor (owner P0, 2026-07-22): there is no
 * separate customer-facing Studio product. Useful query parameters are preserved so deep links
 * keep their meaning; `replace` keeps history clean.
 */
export function LegacyStudioRedirect() {
  const location = useLocation();
  return <Navigate to={studioRedirectTo(location.search, location.hash)} replace />;
}

/** Preserve recipe/session query state while consolidating a legacy destination. */
export function LegacyDestinationRedirect({
  pathname,
  forcedSearch,
}: {
  pathname: string;
  forcedSearch?: Readonly<Record<string, string>>;
}) {
  const location = useLocation();
  return (
    <Navigate
      to={legacyDestinationRedirectTo(pathname, location.search, forcedSearch, location.hash)}
      replace
    />
  );
}

/** The existing /@creator/recipe namespace and future /partner/code format
 * share a two-segment shape; dispatch by the reserved @ creator prefix. */
export function PublicRecipeOrPartnerRoute() {
  const { handle } = useParams();
  return handle?.startsWith('@') ? <PublicRecipeRoute /> : <PartnerPublicRoute />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Slice A (owner-approved): public root is the LIGHT landing page (spec §6);
          the customer flow lives at /start behind the primary CTA. */}
      <Route path="/" element={<RoleAwareEntryRoute entry="root" />} />
      <Route path="/start" element={<RoleAwareEntryRoute entry="start" />} />
      <Route path="/home" element={<RoleAwareEntryRoute entry="home" />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/franchise" element={<FranchisePage />} />
      {/* Owner decision (2026-07-17): retire the legacy dark AI-chat Home — „no page
          may look legacy”. /classic now redirects into the light flow, like /demo.
          The HomePage component is kept in the tree, just unrouted. */}
      <Route path="/classic" element={<LegacyDestinationRedirect pathname="/start" />} />
      {/* Legacy /demo entry pointed at the flow → keep old links/bookmarks landing
          in the flow, not on the marketing page. */}
      <Route path="/demo" element={<LegacyDestinationRedirect pathname="/start" />} />
      {/* PINGÜINO Pro — the ONE canonical professional workspace (owner P0, 2026-07-22).
          /pro = workspace root (shows the recipe editor); /pro/<section> = stable section URLs
          (recipe/monitor/versions/production/history/costs/exports/settings — direct link +
          refresh restore the same section). */}
      <Route path="/pro" element={<ProWorkspacePage />} />
      <Route
        path="/pro/history"
        element={
          <LegacyDestinationRedirect pathname="/production" forcedSearch={{ tab: 'history' }} />
        }
      />
      <Route path="/pro/machine" element={<LegacyDestinationRedirect pathname="/machine" />} />
      <Route path="/pro/settings" element={<LegacyDestinationRedirect pathname="/account" />} />
      <Route path="/pro/:section" element={<ProWorkspacePage />} />
      {/* There is NO separate Studio product: /studio and /calculator land in the canonical
          PINGÜINO Pro recipe editor (query params preserved for /studio deep links). */}
      <Route path="/studio" element={<LegacyStudioRedirect />} />
      <Route
        path="/calculator"
        element={<LegacyDestinationRedirect pathname={PRO_RECIPE_PATH} />}
      />

      {/* ── Gellatti Community, Creators and direct recipe sharing ──────────────
          `/@handle` and `/@handle/:slug` are the permanent public addresses of a
          creator and of a published recipe. They are declared BEFORE the catch-all
          and cannot collide with an application route: the `@` prefix is not a legal
          handle character, and every route word below is in the reserved-handle list
          that `validateHandle` and the DB both enforce.

          `/share/:token` is UNLISTED (§11): it is `noindex` in the SPA head and, more
          importantly, `X-Robots-Tag: noindex` at the edge (vercel.json / netlify.toml)
          so a crawler that never runs JavaScript still cannot index it.

          `/received/:shareLinkId` reopens a share already filed under „Udostępnione
          mi", where the recipient no longer has the token. */}
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/top100" element={<TopHundredPage />} />
      {/* Creator reach and Partner money are two pages on purpose (§36). */}
      <Route path="/creator" element={<CreatorHubPage />} />
      <Route path="/partner" element={<PartnerPage />} />
      <Route path="/:partnerSlug/:partnerCode/l/:linkSlug" element={<PartnerPublicRoute />} />
      <Route path="/admin" element={<AdminRouteGuard><AdminWorkspacePage /></AdminRouteGuard>} />
      <Route path="/admin/:section" element={<AdminRouteGuard><AdminWorkspacePage /></AdminRouteGuard>} />
      {/* A React Router param owns a whole segment, so `/@:handle` matches
          nothing. The handle namespace is declared as `/:handle` and gated by
          CreatorHandleRoute, which requires the leading `@` and a valid,
          non-reserved handle — so `/marysia` and `/@admin` stay 404s. Static
          routes outrank dynamic ones in React Router's matcher, so every
          application route above still wins; communityRoutes.test.tsx proves
          it by matching, not by assertion. */}
      <Route path="/:handle" element={<CreatorHandleRoute />} />
      <Route path="/:handle/:slug" element={<PublicRecipeOrPartnerRoute />} />
      <Route path="/share/:token" element={<SharedRecipePage />} />
      <Route path="/received/:shareLinkId" element={<SharedRecipePage />} />

      {/* One canonical recipe library. Legacy bookmarks keep their meaning through a redirect. */}
      <Route path="/recipes" element={<RecipesHubPage />} />
      <Route
        path="/my-recipes"
        element={<LegacyDestinationRedirect pathname="/recipes" forcedSearch={{ tab: 'mine' }} />}
      />

      {/* Canonical member hubs. Contextual recipe/production tools remain available by deep link. */}
      <Route path="/products" element={<ProductsHubPage />} />
      <Route path="/production" element={<ProductionHubPage />} />
      <Route path="/labels" element={<LabelsHubPage />} />
      <Route path="/account" element={<AccountSettingsPage />} />
      <Route path="/machine" element={<MachineProfilePage />} />
      <Route path="/label" element={<LegacyDestinationRedirect pathname="/labels" />} />

      {/* Existing destination functions preserved, but no longer promoted as global menu items. */}
      <Route path="/api" element={<APIPage />} />
      <Route path="/work-with-us" element={<WorkWithUsPage />} />
      <Route path="/subscription" element={<SubscriptionPage />} />
      <Route path="/create-ingredient" element={<LegacyDestinationRedirect pathname="/products/scan" />} />

      {/* Profil → Moja maszyna (UIUX Slice B §8.6) — view/change the saved Home machine. */}
      <Route path="/profile/machine" element={<LegacyDestinationRedirect pathname="/machine" />} />

      {/* Product catalog intake — direct-URL / internal-first (no nav entry yet). */}
      <Route path="/products/import" element={<AdminRouteGuard><ProductImportPage /></AdminRouteGuard>} />
      <Route path="/products/scan" element={<ProductScannerV1Page />} />
      <Route path="/products/add" element={<LegacyDestinationRedirect pathname="/products/scan" />} />
      {import.meta.env.DEV && <Route path="/products/scan/legacy" element={<ProductScanPage />} />}

      {/* Legacy customer-shell preview path → the flow's new canonical /start. */}
      <Route path="/customer-v1" element={<LegacyDestinationRedirect pathname="/start" />} />

      {/* DEV-ONLY internal tools — registered only in a dev build, never linked in nav.
          In production import.meta.env.DEV is false, so the route is never created and
          MapperSmokePage is dead-code-eliminated from the bundle. */}
      {import.meta.env.DEV && <Route path="/dev/mapper-smoke" element={<MapperSmokePage />} />}
      {import.meta.env.DEV && <Route path="/dev/mapper-batch-6" element={<MapperBatch6Page />} />}
      {import.meta.env.DEV && <Route path="/dev/mapper-review" element={<MapperReviewPage />} />}
      {import.meta.env.DEV && <Route path="/dev/mapper-status" element={<MapperStatusPage />} />}
      {import.meta.env.DEV && (
        <Route path="/dev/enrichment-preview" element={<EnrichmentPreviewPage />} />
      )}
      {import.meta.env.DEV && <Route path="/dev/snapshot-audit" element={<SnapshotAuditPage />} />}
      {import.meta.env.DEV && (
        <Route path="/dev/studio-picker-proof" element={<StudioPickerProofPage />} />
      )}
      {import.meta.env.DEV && <Route path="/dev/intake-hub" element={<IntakeHubPage />} />}
      {import.meta.env.DEV && (
        <Route
          path="/dev/ocr-intake"
          element={<OcrIntakePage wiring={buildRealIntakeWiring()} />}
        />
      )}
      {import.meta.env.DEV && <Route path="/dev/ocr-batch" element={<OcrBatchPage />} />}
      {import.meta.env.DEV && (
        <Route path="/dev/reference-proposals" element={<ReferenceProposalsPage />} />
      )}
      {import.meta.env.DEV && <Route path="/dev/spine" element={<SpineStatusPage />} />}
      {import.meta.env.DEV && (
        <Route
          path="/dev/product-intelligence-preview"
          element={<ProductIntelligencePreviewPage />}
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/dev/pi-calculated-activation-preview"
          element={<PiCalculatedActivationPreviewPage />}
        />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/optimization-preview" element={<OptimizationPreviewPage />} />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/dev/branch-recalculation-preview"
          element={<BranchRecalculationPreviewPage />}
        />
      )}
      {import.meta.env.DEV && <Route path="/dev/pi-monitor" element={<PiMonitorDevPage />} />}
      {import.meta.env.DEV && (
        <Route path="/dev/account-access" element={<AccountAccessDevPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/product-verification" element={<ProductVerificationDevPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/ingredient-resolution" element={<IngredientResolutionDevPage />} />
      )}
      {import.meta.env.DEV && <Route path="/dev/pro-recipes" element={<ProCoreRecipesDevPage />} />}
      {import.meta.env.DEV && (
        <Route path="/dev/pro-production" element={<ProCoreProductionDevPage />} />
      )}
      {import.meta.env.DEV && <Route path="/dev/pro-costs" element={<ProCoreCostsDevPage />} />}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
