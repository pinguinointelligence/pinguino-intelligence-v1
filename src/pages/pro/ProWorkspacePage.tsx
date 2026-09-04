/**
 * PINGÜINO Pro workspace — THE one canonical professional product (owner P0, 2026-07-22;
 * ONE-SCREEN workbench architecture, 2026-07-24).
 *
 * ONE professional workspace with STABLE section URLs: `/pro` (root → the recipe
 * workbench) and `/pro/<section>` for recipe/monitor/versions/production/history/costs/
 * exports/settings/machine — direct link + refresh restore the same section, and legacy
 * `/pro?tab=<id>` deep-links redirect onto the stable paths. `/studio` redirects here.
 *
 * ONE HAMBURGER (owner): the visible tab row is GONE — every former tab destination
 * lives in the canonical AppNavDrawer (appNav.ts keeps all 9 routes + /pro/machine).
 *
 * Receptura/Monitor = the ONE-SCREEN workbench: compact ProWorkbar (≤64 px, name +
 * canonical save + Przelicz z PI + Monitor PI) → compact settings line → ingredient
 * editor (60–65 %) beside the LIVE Monitor PI panel (35–40 %) → thin action bar. On
 * desktop the shell locks to the viewport (`viewportLock`) — the BODY never scrolls
 * during normal editing; the red REVIEW ZONE sits below the fold (intentional scroll).
 * `/pro/monitor` renders the same workbench with the Monitor panel focused.
 *
 * The remaining sections surface HONEST states (ProSliceBackendState + honest notes) —
 * never a fake screen. Non-Pro personas see an honest PINGÜINO Pro gate; a DEV-only
 * persona switch lets acceptance exercise pro/home/demo without a login.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeading } from '@/components/shared/PageHeading';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { SurfaceToneContext } from '@/components/ui/surface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { AppShell } from '@/features/shell/AppShell';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useSessionStore } from '@/stores/sessionStore';
import { StudioEngineSurface, StudioReviewZone } from '@/features/studio/StudioEngineSurface';
import { ProWorkbar } from '@/features/pro-core/ProWorkbar';
import { ProRecalcPanel } from '@/features/pro-core/ProRecalcPanel';
import { ProMachineSelector } from '@/features/pro-core/ProMachineSelector';
import {
  beginPiRecalculation,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { RecipeVersionsSection } from '@/features/pro-core/RecipeVersionsSection';
import { ProSliceBackendState } from '@/features/pro-core/ProSliceBackendState';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import { resolveCostsRepository } from '@/features/pro-core/proCoreCostsRepo';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import type { CockpitTab, ProContextTab } from '@/features/pro-workbench/RecipeProfilePanel';
import type { LabelWorkspaceView } from '@/features/master-label/LabelWorkspace';
import { DESKTOP_TAB_STRIP } from '@/features/shell/desktopTabAnchorContract';
import { WorkbenchModuleTabs } from '@/features/pro-workbench/WorkbenchModuleTabs';
import { ReviewBadge } from '@/features/design-review/ReviewBadge';
import { OfficialProLogo } from '@/components/shared/OfficialProLogo';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { profileSettingsSignature } from '@/features/pro-workbench/recipeProfileStore';
import { profileSnapshotFromState } from '@/features/pro-workbench/recipeProfilePersistence';
import { useLegacyRecipeBehaviorRevalidation } from '@/features/product-intelligence';
import {
  APP_PAGE_BLOCK,
  APP_PAGE_MEASURE,
  APP_PAGE_WORKSPACE,
  PRO_WORKBENCH_FRAME_CLASS,
} from '@/features/shell/shellGeometry';
import { cockpitTabFromRoute, routeForCockpitTab } from './workbenchRoute';
import { WORKBENCH_ORIGIN_PARAM, workbenchOriginReturnPath } from './workbenchOrigin';
import {
  ExecutableRecipeHandoffError,
  openExecutableRecipeTemplate,
} from '@/services/executableRecipeHandoff';

const w = copy.proWorkspace;

type TabId = keyof typeof w.tabs;

const TAB_ORDER: TabId[] = [
  'recipe',
  'monitor',
  'versions',
  'production',
  'history',
  'costs',
  'exports',
  'settings',
  'machine',
  'tools',
];

const isTabId = (value: string | null): value is TabId =>
  value !== null && (TAB_ORDER as string[]).includes(value);

/** The four contexts that share the same editor and right-side workspace. */
const isWorkbenchSection = (tab: TabId): tab is ProContextTab =>
  tab === 'recipe' || tab === 'monitor' || tab === 'production';

/** DEV-only persona switch — mirrors RecipeVersionsSection so acceptance can reach the Pro
 * view (and the gate) without a real login. Never rendered in a production build. */
function DevPersonaSwitch({ persona }: { persona: ProCorePersona }) {
  const setDevPersona = useProCoreAccessStore((s) => s.setDevPersona);
  const setSessionPlan = useSessionStore((s) => s.setPlan);
  if (!import.meta.env.DEV) return null;
  return (
    <label className="hidden items-center gap-2 text-xs text-stone-500 sm:flex">
      <span className="hidden sm:inline">{w.devPersona}</span>
      <select
        className="rounded border border-ink/15 px-2 py-1"
        value={persona}
        onChange={(e) => {
          const next = e.target.value as ProCorePersona;
          setDevPersona(next);
          setSessionPlan(next === 'pro' ? 'pro' : 'demo');
        }}
        data-testid="pro-persona-switch"
      >
        <option value="pro">Pro</option>
        <option value="home">Home</option>
        <option value="demo">Demo</option>
      </select>
    </label>
  );
}

function ProTopActions({ persona }: { persona: ProCorePersona }) {
  const unresolvedRequiredCount = useIngredientTableUxStore(
    (state) => Object.keys(state.unresolvedRequiredByLineId).length,
  );
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="pro-top-workbar">
      {unresolvedRequiredCount > 0 ? (
        <span
          className="hidden text-xs font-semibold tracking-[0.04em] text-status-error uppercase xl:inline"
          data-testid="pro-recalc-required-block"
        >
          {copy.studio.builder.ingredientTable.infeasible.title}
        </span>
      ) : null}
      <DevPersonaSwitch persona={persona} />
      {/* The switch used to be rendered HERE, which made it conditional on
          `workbench` — true only for a signed-in PRO on a workbench tab. A
          signed-out visitor therefore saw no switch at all on /pro, breaking the
          frozen contract. AppShell now owns and renders it once on every route,
          so the workbar must not render a second copy. */}
    </div>
  );
}

function ProWorkbenchHeaderChrome({
  activeTab,
  onTabChange,
}: {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
}) {
  return (
    <div
      /* OWNER OVERRIDE §8 — the strip belongs to the RIGHT display column, not
         to the viewport. `DESKTOP_TAB_STRIP` pins its box to that column, so
         switching Receptura → Monitor → Produkcja → Etykieta moves it 0 px. */
      className={`pro-workbench-header-section-nav min-w-0 ${DESKTOP_TAB_STRIP}`}
      data-testid="pro-global-workbench-chrome"
    >
      <WorkbenchModuleTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        idPrefix="pro-context"
        className="w-full border-b-0"
      />
    </div>
  );
}

/** The ONE-SCREEN recipe workbench (also serves /pro/monitor with the panel focused). */
function RecipeWorkbench({
  activeTab,
  onTabChange,
  recalcOpen,
  onOpenExistingPreview,
  onRecalculate,
  onCloseRecalc,
  initialLabelView,
  labelViewRequestKey,
}: {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  recalcOpen: boolean;
  onOpenExistingPreview: () => void;
  onRecalculate: () => void;
  onCloseRecalc: () => void;
  initialLabelView: LabelWorkspaceView;
  labelViewRequestKey: string;
}) {
  const draftContextSeq = useRecipeStore((state) => state.draftContextSeq);
  const [recipeSaveAttention, setRecipeSaveAttention] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pro-viewport-region">
      <SurfaceToneContext.Provider value="paper">
        <div className="flex min-h-0 flex-1 flex-col bg-shell text-ivory">
          <StudioEngineSurface
            key={draftContextSeq}
            activeTab={activeTab}
            onTabChange={onTabChange}
            recipeBar={
              <ProWorkbar variant="panel" onSaveAttentionChange={setRecipeSaveAttention} />
            }
            recipeSaveAttention={recipeSaveAttention}
            recalcSlot={<ProRecalcPanel open={recalcOpen} onClose={onCloseRecalc} />}
            onRecalculate={onRecalculate}
            onOpenExistingPreview={onOpenExistingPreview}
            initialLabelView={initialLabelView}
            labelViewRequestKey={labelViewRequestKey}
          />
        </div>
      </SurfaceToneContext.Provider>
    </div>
  );
}

function NoteTab({ note }: { note: string }) {
  return <p className="max-w-2xl text-sm leading-relaxed text-stone-600">{note}</p>;
}

function SettingsTab({ persona }: { persona: ProCorePersona }) {
  const authAvailable = useAuthStore((s) => s.available);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthModalStore((s) => s.open);
  const authed = status === 'authed';

  return (
    <dl className="max-w-md space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-ink/5 pb-3">
        <dt className="text-xs tracking-label text-stone-600 uppercase">{w.settings.access}</dt>
        <dd>
          <span className="text-sm font-medium text-ink">
            {persona === 'pro' ? 'Pełny dostęp' : persona}
          </span>
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-ink/5 pb-3">
        <dt className="text-xs tracking-label text-stone-600 uppercase">{w.settings.account}</dt>
        <dd className="min-w-0 text-sm text-ink">
          {authed && user?.email ? (
            <span className="truncate" title={user.email}>
              {user.email}
            </span>
          ) : authAvailable ? (
            <button
              type="button"
              className={buttonClasses('primary', 'sm')}
              onClick={openAuthModal}
            >
              {copy.menu.signIn}
            </button>
          ) : (
            <span className="text-stone-500">{w.settings.signedOut}</span>
          )}
        </dd>
      </div>
      <Link
        to="/machine"
        className="inline-block text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:text-stone-600"
      >
        {w.openMachine}
      </Link>
    </dl>
  );
}

function MachineTab() {
  // S4: the professional-first machine + serving-mode selector, applied to the current recipe.
  // The full Home machine profile page (default machine, container) stays reachable below.
  return (
    <div className="space-y-8">
      {/* Owner review (RV-13, staging/QA only): per-recipe vs default machine — needs one
          distinguishing sentence on each surface. Customers never see the badge. */}
      <ReviewBadge itemId="RV-13" />
      <ProMachineSelector />
      <Link
        to="/machine"
        className="inline-block text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:text-stone-600"
      >
        {w.openMachine}
      </Link>
    </div>
  );
}

/** The NON-workbench sections — a plain titled page under the one hamburger. */
function SectionPanel({ tab, persona }: { tab: TabId; persona: ProCorePersona }) {
  switch (tab) {
    case 'versions':
      return <RecipeVersionsSection />;
    case 'production': {
      const state = resolveProductionRepository();
      return (
        <ProSliceBackendState
          unavailable={state.unavailable}
          isLocalDev={state.isLocalDev}
          note={w.soon.production}
        />
      );
    }
    case 'history':
      return <NoteTab note={w.soon.history} />;
    case 'costs': {
      const state = resolveCostsRepository();
      return (
        <ProSliceBackendState
          unavailable={state.unavailable}
          isLocalDev={state.isLocalDev}
          note={w.soon.costs}
        />
      );
    }
    case 'exports':
      return <NoteTab note={w.soon.exports} />;
    case 'settings':
      return <SettingsTab persona={persona} />;
    case 'machine':
      return <MachineTab />;
    case 'tools':
      return (
        <SurfaceToneContext.Provider value="paper">
          <StudioReviewZone />
        </SurfaceToneContext.Provider>
      );
    default:
      return null;
  }
}

export function ProWorkspacePage() {
  /* Unconditional, above every early return: the canonical switch renders on
     /pro for EVERY audience, so its entitlement must not sit behind a guard. */
  const [recalcOpen, setRecalcOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const persona = useProCorePersona();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const workbenchReturnPath = workbenchOriginReturnPath(searchParams.get(WORKBENCH_ORIGIN_PARAM));
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const ownerReviewGate = useRecipeStore((state) => state.ownerReviewGate);
  const [libraryHandoff, setLibraryHandoff] = useState<
    | { state: 'idle' }
    | { state: 'loading'; templateId: string }
    | { state: 'ready'; templateId: string; recipeName: string }
    | { state: 'blocked'; templateId: string | null; message: string }
  >({ state: 'idle' });
  const lastLibraryHandoff = useRef<string | null>(null);
  const isPro = persona === 'pro';
  useLegacyRecipeBehaviorRevalidation(isPro);
  const libraryTemplateId = searchParams.get('libraryTemplate')?.trim() || null;
  const libraryIntent =
    searchParams.get('source') === 'flavor_inspiration' ||
    searchParams.get('source') === 'curated_collection' ||
    searchParams.get('source') === 'executable_template';
  const activeLibraryHandoff =
    isPro && libraryIntent && !libraryTemplateId
      ? {
          state: 'blocked' as const,
          templateId: null,
          message:
            'Ta inspiracja nie ma jeszcze dokładnego, wykonawczego szablonu. Bieżąca receptura nie została zmieniona.',
        }
      : libraryHandoff;

  useEffect(() => {
    if (!isPro || !libraryIntent) return;
    if (!libraryTemplateId) return;
    if (!userId) return;
    const handoffKey = `${userId}:${libraryTemplateId}`;
    if (lastLibraryHandoff.current === handoffKey) return;
    lastLibraryHandoff.current = handoffKey;
    let cancelled = false;
    setLibraryHandoff({ state: 'loading', templateId: libraryTemplateId });
    void openExecutableRecipeTemplate(libraryTemplateId, userId)
      .then((materialized) => {
        if (cancelled) return;
        setLibraryHandoff({
          state: 'ready',
          templateId: libraryTemplateId,
          recipeName: materialized.template.displayName,
        });
        // Consume the one-shot handoff URL. Keeping libraryTemplate in the
        // address would rematerialize the pristine template after a reload and
        // overwrite the Owner's edited working draft.
        navigate('/pro/recipe', { replace: true });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        lastLibraryHandoff.current = null;
        setLibraryHandoff({
          state: 'blocked',
          templateId: libraryTemplateId,
          message:
            error instanceof ExecutableRecipeHandoffError
              ? error.message
              : 'Nie udało się otworzyć dokładnej wersji szablonu.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isPro, libraryIntent, libraryTemplateId, navigate, userId]);

  // Legacy `/pro?tab=<id>` deep-links → the stable `/pro/<id>` path (replace keeps history clean).
  const legacyTab = searchParams.get('tab');
  if (section === undefined && legacyTab !== null && isTabId(legacyTab)) {
    return <Navigate to={`/pro/${legacyTab}`} replace />;
  }
  // Unknown section → the canonical recipe editor (stable URLs, no fake pages).
  if (section !== undefined && !isTabId(section)) {
    return <Navigate to="/pro/recipe" replace />;
  }

  const activeTab: TabId = isTabId(section ?? null) ? (section as TabId) : 'recipe';
  const workbenchTab = isWorkbenchSection(activeTab) ? activeTab : null;
  const workbench = isPro && workbenchTab !== null;
  const activeCockpitTab = cockpitTabFromRoute(section, searchParams.get('panel'));
  const changeCockpitTab = (next: CockpitTab) => {
    navigate(routeForCockpitTab(next));
  };
  const startRecalc = async () => {
    // Every accepted click owns a fresh visible run. Open first and clear any
    // stale Preview/Undo evidence before an async server authority check.
    setRecalcOpen(true);
    const piRunGeneration = beginPiRecalculation();
    try {
      const recipe = useRecipeStore.getState();
      const profile = useRecipeProfileStore.getState();
      const snapshot = profileSnapshotFromState(
        recipe,
        recipe.direction_targets,
        profile.directionIntents,
      );
      const signature = profileSettingsSignature(snapshot);
      if (
        profile.activeDraftIdentity === null ||
        !profile.isConfirmed(signature, profile.activeDraftIdentity, recipe.draftContextSeq)
      ) {
        useConstraintStudioStore.setState({
          recalculationTerminal: { state: 'SETTINGS_CONFIRMATION_REQUIRED' },
        });
        return;
      }
      const unresolvedRequired = Object.values(
        useIngredientTableUxStore.getState().unresolvedRequiredByLineId,
      );
      if (unresolvedRequired.length > 0) {
        useConstraintStudioStore.setState({
          recalculationTerminal: {
            state: 'BLOCKED_WITH_EXACT_ACTION',
            code: 'missing_required_role',
            messagePl: `Brakuje wymaganego składnika: ${unresolvedRequired.map((item) => item.name).join(', ')}. Wybierz produkt, aby przeliczyć recepturę.`,
            action: 'choose_product',
          },
        });
        return;
      }
      await runPiRecalculationWithTerminal(undefined, piRunGeneration);
    } catch {
      const publishedTerminal = useConstraintStudioStore.getState().recalculationTerminal;
      if (publishedTerminal !== null && publishedTerminal.state !== 'WORKING') return;
      useConstraintStudioStore.setState({
        recalculationTerminal: {
          state: 'ERROR',
          messagePl: 'Nie udało się dokończyć przeliczenia. Wróć do receptury i spróbuj ponownie.',
        },
      });
    }
  };

  return (
    // White precision workspace: presentation-only token remap. The same components,
    // values, content, actions and below-fold review zone remain intact.
    <div
      className={`pro-studio-radius-system theme-pro-light${workbench ? ' gellatti-pro-workbench' : ''}`}
      data-testid="pro-light-scope"
    >
      <AppShell
        viewportLock={workbench}
        /* In workbench mode the header must share the workbench's cap, or the
           module strip — right-aligned inside the header — lands beside the
           display column instead of on it. Measured before this line existed:
           the strip sat 54 px right of the column at 1440 and 149 px at 2368. */
        maxWidthClass="max-w-[1776px]"
        brand={<OfficialProLogo />}
        /* FROZEN GLOBAL CONTRACT (owner, 2026-09-02): PRO renders the SAME
           canonical switch as every other surface — no PRO-specific control, no
           plan badge, no private lockup. `activeView="pro"` is the only
           difference: PRO presents as the current view, HOME as the other one.
           It closes the work column beside `ProTopActions`; the module strip
           keeps the right display column untouched. */
        workbenchChrome={
          workbench ? (
            <ProWorkbenchHeaderChrome activeTab={activeCockpitTab} onTabChange={changeCockpitTab} />
          ) : undefined
        }
        actions={
          workbench ? (
            <ProTopActions persona={persona} />
          ) : (
            <>
              <DevPersonaSwitch persona={persona} />
            </>
          )
        }
      >
        {!isPro ? (
          <>
            <div className={`${APP_PAGE_WORKSPACE} pt-8`}>
              <div className={APP_PAGE_MEASURE}>
                <PageHeading eyebrow={w.eyebrow} title={w.title} />
              </div>
            </div>
            <div className={`${APP_PAGE_WORKSPACE} flex justify-center py-16`}>
              <UpgradePrompt
                message={w.gate.message}
                cta={w.gate.cta}
                onAction={() => {
                  window.location.assign('/subscription');
                }}
              />
            </div>
          </>
        ) : workbench ? (
          // ONE-SCREEN workbench (recipe + monitor): no page heading, no tab row — the
          // viewport belongs to the edit loop; every destination lives in the hamburger.
          <div
            className={`${PRO_WORKBENCH_FRAME_CLASS} pro-workbench-body-frame`}
            data-testid={`pro-panel-${activeTab}`}
          >
            {activeLibraryHandoff.state === 'loading' ? (
              <div className="flex min-h-0 flex-1 items-center justify-center bg-paper px-6 py-12">
                <p className="text-sm text-stone-600" role="status">
                  Otwieramy dokładną wersję receptury…
                </p>
              </div>
            ) : (
              <>
                {activeLibraryHandoff.state === 'blocked' ? (
                  <p
                    className="shrink-0 border-b border-nonprod/25 bg-nonprod/[0.06] px-4 py-2 text-xs font-medium text-nonprod"
                    role="alert"
                    data-testid="pro-library-handoff-blocked"
                  >
                    {activeLibraryHandoff.message}
                  </p>
                ) : null}
                {ownerReviewGate ? (
                  <p
                    className="shrink-0 border-b border-attention/25 bg-attention/[0.06] px-4 py-2 text-xs font-medium text-attention"
                    role="status"
                    data-testid="pro-owner-review-base-only"
                  >
                    OWNER_REVIEW_EDITABLE · otwarty jest wyłącznie Base. Produkcja i etykieta
                    pozostają zablokowane; pominięte Toppingi:{' '}
                    {ownerReviewGate.omittedToppingLineIds.length}.
                  </p>
                ) : null}
                <RecipeWorkbench
                  activeTab={activeCockpitTab}
                  onTabChange={changeCockpitTab}
                  recalcOpen={recalcOpen}
                  onOpenExistingPreview={() => setRecalcOpen(true)}
                  onRecalculate={startRecalc}
                  onCloseRecalc={() => setRecalcOpen(false)}
                  initialLabelView={
                    searchParams.get('labelView') === 'settings' ? 'settings' : 'data'
                  }
                  labelViewRequestKey={location.key}
                />
              </>
            )}
          </div>
        ) : (
          // Plain titled sections (versions/production/history/costs/exports/settings/machine).
          <>
            <div className={`${APP_PAGE_WORKSPACE} pt-8`}>
              <div className={APP_PAGE_MEASURE}>
                {/* OWNER 2026-09-03: contextual back. It exists ONLY when this
                    page was opened from the workbench (`?from=<section>`), and
                    it returns to that exact section. Reached from the global
                    hamburger there is no origin and no control — a back button
                    implying a workbench the user never came from would be a
                    lie. See `workbenchOrigin.ts`. */}
                {workbenchReturnPath ? (
                  <Link
                    to={workbenchReturnPath}
                    data-testid="pro-section-back"
                    className="pro-focus-ring mb-3 -ml-1 inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-xs font-semibold text-stone-600 transition-colors hover:text-ink"
                  >
                    <span aria-hidden>←</span> Wróć
                  </Link>
                ) : null}
                <PageHeading eyebrow={w.eyebrow} title={`${w.title} — ${w.tabs[activeTab]}`} />
              </div>
            </div>
            <div
              className={`${APP_PAGE_WORKSPACE} ${APP_PAGE_BLOCK}`}
              data-testid={`pro-panel-${activeTab}`}
            >
              <div className={APP_PAGE_MEASURE}>
                <SectionPanel tab={activeTab} persona={persona} />
              </div>
            </div>
          </>
        )}
      </AppShell>
    </div>
  );
}
