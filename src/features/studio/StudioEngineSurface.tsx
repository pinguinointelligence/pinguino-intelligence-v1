import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { useSessionStore } from '@/stores/sessionStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { BranchWorkflowPreviews } from '@/features/optimization/BranchWorkflowPreviews';
import { OptimizationPreviewPanel } from '@/features/optimization/OptimizationPreviewPanel';
import { SaveCorrectionControl } from '@/features/optimization/SaveCorrectionControl';
import { StudioFlowGuidePanel } from '@/features/studioFlow/StudioFlowGuidePanel';
import { StudioAssistantShell } from '@/features/studioFlow/StudioAssistantShell';
import { optimizationDisplayPolicy } from '@/features/optimization/optimizationPreviewPolicy';
import {
  previewOptimization,
  studioIntentFromRecipe,
  type OptimizationPreviewView,
} from '@/features/optimization/optimizationPreviewRunner';
import { ConstraintStudioSection } from '@/features/constraint-studio';
import { IngredientBuilder } from '@/features/ingredient-builder/IngredientBuilder';
import { HistoricalVersionNotice } from '@/features/pro-core/HistoricalVersionNotice';
import { PresetSelector } from '@/features/studio/PresetSelector';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { LockedCalculatorPreview } from '@/features/studio/locked/LockedCalculatorPreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { ProReviewZone, type ReviewInventoryRow } from '@/features/pro-workbench/ProReviewZone';
import { RecipeProfilePanel, type CockpitTab } from '@/features/pro-workbench/RecipeProfilePanel';
import type { LabelWorkspaceView } from '@/features/master-label/LabelWorkspace';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { WorkbenchRecipeActionDock } from '@/features/pro-workbench/WorkbenchRecipeActionDock';
import { WorkbenchModuleTabs } from '@/features/pro-workbench/WorkbenchModuleTabs';
import { useProductionWorkspace } from '@/features/production-workspace/useProductionWorkspace';
import { ProductionWorkspaceHeader } from '@/features/production-workspace/ProductionWorkspaceHeader';
import {
  collapsedMobileCockpitRoute,
  MOBILE_COCKPIT_QUERY,
  nextMobileCockpitState,
  shouldActivateMobileCockpitModal,
  shouldRevealProductionWeighingOnNarrowViewport,
} from '@/features/studio/mobileCockpitModal';

const { studio } = copy;

/** The open preview names itself; the bottom bar owns switching between them. */
const MOBILE_PREVIEW_TITLES: Record<CockpitTab, string> = {
  profile: 'Receptura',
  monitor: 'Monitor',
  production: 'Produkcja',
  summary: 'Etykieta',
};
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Owner review inventory (2026-07-24, one-screen architecture): every module moved
 * BELOW the core workbench, with the explicit decision column = OCZEKUJE. Mirrors the
 * design-review pattern (PL metadata beside the marked modules, nothing removed). */
const REVIEW_INVENTORY: readonly ReviewInventoryRow[] = [
  {
    id: 'studio-tools',
    name: studio.secondary.reviewMarked.studioTools,
    purpose: studio.secondary.reviewMarked.studioToolsNote,
    route: '/pro/recipe → strefa przeglądu',
    recommendation:
      'Scalić z edytorem (blokady są już w tabeli) lub zostawić jako narzędzie zaawansowane.',
  },
  {
    id: 'assistant',
    name: studio.secondary.reviewMarked.assistant,
    purpose: 'Konwersacyjny szkic intencji (tylko odczyt, deterministyczny).',
    route: '/pro/recipe → strefa przeglądu',
    recommendation: 'Decyzja właściciela: rozwijać albo wycofać.',
  },
  {
    id: 'flow-guide',
    name: studio.secondary.reviewMarked.flowGuide,
    purpose: 'Objaśnia bieżącą sytuację przepływu pracy (tylko odczyt).',
    route: '/pro/recipe → strefa przeglądu',
    recommendation: 'Kandydat do scalenia z Monitorem PI (sekcja komunikatów).',
  },
  {
    id: 'optimization',
    name: studio.secondary.reviewMarked.optimization,
    purpose: studio.secondary.reviewMarked.optimizationNote,
    route: '/pro/recipe → strefa przeglądu',
    recommendation: 'Nakłada się z „Przelicz z PI" — decyzja: jedno wejście czy dwa.',
  },
  {
    id: 'branch-previews',
    name: studio.secondary.reviewMarked.branchPreviews,
    purpose: studio.secondary.reviewMarked.branchPreviewsNote,
    route: '/pro/recipe → strefa przeglądu',
    recommendation: 'Docelowo sekcja Produkcja; do tego czasu zostaje tutaj.',
  },
  {
    id: 'owner-diagnostic',
    name: studio.secondary.reviewMarked.ownerDiagnostic,
    purpose: studio.secondary.reviewMarked.ownerDiagnosticNote,
    route: 'Monitor PI → Zaawansowane / diagnostyka',
    recommendation: 'Zostaje w Monitorze (sesje właściciela/QA); klienci nie widzą.',
  },
  {
    id: 'presets',
    name: 'Scenariusze demo (DEV)',
    purpose: 'Wewnętrzne scenariusze QA — tylko buildy deweloperskie.',
    route: '/pro/recipe → strefa przeglądu (DEV)',
    recommendation: 'Bez zmian: narzędzie wewnętrzne, nieobecne w produkcji.',
  },
];

/**
 * StudioEngineSurface — THE one-screen Pro workbench (owner architecture, 2026-07-24).
 *
 * Desktop (xl+): a viewport-filling column that NEVER page-scrolls during normal
 * editing — compact settings line (row 2) → editor pane (60–65 %, internal row scroll)
 * beside the LIVE always-visible Monitor PI panel (35–40 %, internal scroll) → compact
 * bottom action bar. The recalculation preview is a compact OVERLAY (`recalcSlot`),
 * never a page section. Mobile: the same pieces flow vertically; the Monitor lives in
 * the bottom sheet (`MonitorDrawer`).
 *
 * Below the workbench — reached only by INTENTIONAL scroll — the red REVIEW ZONE keeps
 * every legacy module functional and visibly marked with the owner inventory
 * (decision = OCZEKUJE). No engine math or gating here: the surface reads the
 * deterministic engine result and gates exact panels on `useAccess` (§22.1 — Demo
 * never receives full grams; Free Preview mounts decorative locked previews).
 */
export function StudioEngineSurface({
  forceDemo = false,
  recalcSlot,
  activeTab = 'profile',
  onTabChange,
  recipeBar,
  onRecalculate,
  onOpenExistingPreview,
  recipeSaveAttention = false,
  initialLabelView = 'label',
  labelViewRequestKey,
}: {
  forceDemo?: boolean;
  /** The Przelicz z PI overlay (Preview → Zastosuj/Anuluj → Cofnij), host-wired. */
  recalcSlot?: ReactNode;
  /** Route-controlled module. Click, refresh and browser history share this authority. */
  activeTab?: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  /** The one recipe name/save bar, mounted at the bottom-left of the editor. */
  recipeBar?: ReactNode;
  onRecalculate?: () => void;
  onOpenExistingPreview?: () => void;
  /** Exact canonical-save readiness published by the existing ProWorkbar. */
  recipeSaveAttention?: boolean;
  initialLabelView?: LabelWorkspaceView;
  labelViewRequestKey?: string;
}) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const loadPreset = useRecipeStore((state) => state.loadPreset);
  const { fullFormula } = useAccess();
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const batchGrams = useRecipeStore((state) => state.target_batch_grams);
  const planning = useStudioResult('planning');
  const production = useProductionWorkspace(activeTab === 'production');
  const productionActive =
    activeTab === 'production' &&
    production.practicalReady !== false &&
    production.session !== null;
  const { result, corrections, input } = productionActive
    ? {
        result: production.forecastResult,
        corrections: production.corrections,
        input: production.forecastInput,
      }
    : planning;
  /**
   * Which module the mobile panel is showing, and whether it is open.
   *
   * These are TWO facts, and conflating them broke Receptura: the open flag used
   * to be derived as `activeTab !== 'profile'`, so the one module whose route is
   * `/pro/recipe` could never open its panel at all — tapping Receptura returned
   * the user to the bare ingredient list and the recipe settings (Słodycz /
   * Twardość, typ produktu, maszyna, partia, OPTIMAL-ECO, name + save) were
   * unreachable on a phone. Monitor, Produkcja and Etykieta were unaffected
   * precisely because none of them is the default route.
   *
   * The bar now states its intent OPTIMISTICALLY before navigating, so the
   * route-sync below only fires for an EXTERNAL change — a deep link or the
   * back button — where „open" genuinely does follow the route.
   */
  const [mobileCockpitState, setMobileCockpitState] = useState({
    activeTab,
    open: activeTab !== 'profile',
  });
  if (mobileCockpitState.activeTab !== activeTab) {
    setMobileCockpitState({ activeTab, open: activeTab !== 'profile' });
  }
  const mobileCockpitOpen = mobileCockpitState.open;
  /** One selector for the bottom bar: open, collapse, or switch. */
  const selectMobileModule = (tab: CockpitTab) => {
    const next = nextMobileCockpitState(mobileCockpitState, tab);
    setMobileCockpitState(next);
    if (next.open && tab !== activeTab) onTabChange(tab);
  };
  // Collapsing is also a ROUTE change for the non-default modules, so „what is
  // open" stays visible in the address bar and survives refresh/back.
  const collapseMobileCockpit = () => {
    setMobileCockpitState({ activeTab, open: false });
    const routeAfterCollapse = collapsedMobileCockpitRoute(
      activeTab,
      'profile',
      activeTab === 'production' && production.session?.status === 'in_progress',
    );
    if (routeAfterCollapse !== activeTab) onTabChange(routeAfterCollapse);
  };
  // The Escape handler is installed once per open sheet; reading the collapse
  // through a ref keeps that effect's dependencies stable.
  const collapseRef = useRef(collapseMobileCockpit);
  useEffect(() => {
    collapseRef.current = collapseMobileCockpit;
  });
  const [mobileViewport, setMobileViewport] = useState(false);
  const cockpitTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cockpitPanelRef = useRef<HTMLElement | null>(null);
  const previousProductionSessionIdRef = useRef(production.session?.sessionId ?? null);
  const focusProductionAfterCollapseRef = useRef(false);

  // The public /demo entry is always a demo session that cold-opens the curated
  // default scenario; /pro (forceDemo=false) preserves persisted edits.
  useEffect(() => {
    if (forceDemo) {
      setPlan('demo');
      loadPreset(DEFAULT_PRESET);
    }
  }, [forceDemo, setPlan, loadPreset]);

  useEffect(() => {
    const showProfileSettings = () => {
      onTabChange('profile');
      setMobileCockpitState({ activeTab: 'profile', open: true });
      queueMicrotask(() =>
        document.querySelector<HTMLElement>('[data-testid="workbench-settings-line"]')?.focus(),
      );
    };
    window.addEventListener('pinguino:profile-settings-required', showProfileSettings);
    return () =>
      window.removeEventListener('pinguino:profile-settings-required', showProfileSettings);
  }, [onTabChange]);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_COCKPIT_QUERY);
    const sync = () => setMobileViewport(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const currentSessionId = production.session?.sessionId ?? null;
    const reveal = shouldRevealProductionWeighingOnNarrowViewport({
      previousSessionId: previousProductionSessionIdRef.current,
      currentSessionId,
      currentStatus: production.session?.status ?? null,
      activeTab,
      cockpitOpen: mobileCockpitOpen,
      mobileViewport,
    });
    previousProductionSessionIdRef.current = currentSessionId;
    if (!reveal) return;

    focusProductionAfterCollapseRef.current = true;
    setMobileCockpitState({ activeTab: 'production', open: false });
  }, [
    activeTab,
    mobileCockpitOpen,
    mobileViewport,
    production.session?.sessionId,
    production.session?.status,
  ]);

  useEffect(() => {
    if (
      !focusProductionAfterCollapseRef.current ||
      !mobileViewport ||
      mobileCockpitOpen ||
      activeTab !== 'production' ||
      production.session?.status !== 'in_progress'
    ) {
      return;
    }

    focusProductionAfterCollapseRef.current = false;
    queueMicrotask(() => {
      document
        .querySelector<HTMLElement>('[data-production-active="true"] [role="spinbutton"]')
        ?.focus();
    });
  }, [
    activeTab,
    mobileCockpitOpen,
    mobileViewport,
    production.session?.sessionId,
    production.session?.status,
  ]);

  useEffect(() => {
    if (!shouldActivateMobileCockpitModal(mobileCockpitOpen, mobileViewport)) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const trigger = cockpitTriggerRef.current;
    const focusables = () =>
      cockpitPanelRef.current
        ? Array.from(cockpitPanelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];

    body.style.overflow = 'hidden';
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        collapseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [activeTab, mobileCockpitOpen, mobileViewport]);

  // ONE recipe action dock (score / „Przelicz" + the action bar). It is placed
  // in the editor toolbar on the workbench breakpoint and in the mobile bottom
  // stack below it — exactly one of the two is visible at any viewport width.
  const openLearning = () => {
    onTabChange('profile');
    queueMicrotask(() => window.dispatchEvent(new Event('pinguino:open-learning')));
  };
  const recipeActionDock =
    !productionActive && onRecalculate ? (
      <WorkbenchRecipeActionDock
        result={planning.result}
        input={planning.input}
        onRecalculate={onRecalculate}
        onOpenPreview={onOpenExistingPreview ?? (() => undefined)}
        onOpenLearning={openLearning}
      />
    ) : null;
  const mobileRecipeActionDock =
    !productionActive && onRecalculate ? (
      <WorkbenchRecipeActionDock
        result={planning.result}
        input={planning.input}
        onRecalculate={onRecalculate}
        onOpenPreview={onOpenExistingPreview ?? (() => undefined)}
        onOpenLearning={openLearning}
      />
    ) : null;
  const productionNeedsAttention =
    production.deviationDecisionUnresolved && !(activeTab === 'production' && mobileCockpitOpen);
  const labelNeedsAttention =
    production.session?.status === 'completed' && !(activeTab === 'summary' && mobileCockpitOpen);
  const recipeNeedsAttention =
    recipeSaveAttention && !(activeTab === 'profile' && mobileCockpitOpen);
  const mobileAttentionTab: CockpitTab | null = productionNeedsAttention
    ? 'production'
    : labelNeedsAttention
      ? 'summary'
      : recipeNeedsAttention
        ? 'profile'
        : null;

  return (
    <>
      {/* ── ONE-SCREEN WORKBENCH — fills the remaining viewport height on desktop; every
          edit-loop control lives INSIDE this section (owner zero-page-scroll rule). ── */}
      <section
        className="flex min-h-0 flex-col pb-[calc(var(--pro-bottom-nav-height)+4.75rem+env(safe-area-inset-bottom))] xl:flex-1 xl:overflow-hidden xl:pb-0"
        data-testid="pro-workbench"
      >
        {activeTab === 'production' && production.session ? (
          <ProductionWorkspaceHeader production={production} />
        ) : null}
        {/* Main split — editor (60–65 %) | LIVE Monitor PI (35–40 %). */}
        <div className="min-h-0 flex-1 xl:grid xl:h-full xl:grid-cols-[minmax(0,1.62fr)_minmax(400px,1fr)] xl:gap-[var(--pro-workbench-gap)] xl:pt-2 xl:pb-3">
          <span
            aria-hidden
            data-testid="workbench-divider-rail"
            className="pointer-events-none hidden"
          >
            <span
              className="absolute inset-x-0 top-0 h-8 rounded-full bg-ink"
              data-testid="workbench-divider-handle"
            />
          </span>
          <div
            className="min-h-0 xl:flex xl:min-w-0 xl:flex-col xl:overflow-hidden xl:rounded-[18px] xl:border xl:border-ink/10 xl:bg-white xl:shadow-pro-e1"
            data-testid="workbench-editor-pane"
          >
            {/* Owner v1.4 §7: an immutable snapshot opened from the library's WERSJA selector must
                announce itself before any of its grams are read as the current recipe. */}
            <HistoricalVersionNotice />
            {fullFormula ? (
              <div className="min-h-0 flex-1 xl:overflow-hidden">
                <IngredientBuilder
                  items={result.items}
                  totalBatchG={result.total_batch_g}
                  targetBatchG={batchGrams}
                  demo={forceDemo}
                  layout="workbench"
                  mode={productionActive ? 'production' : 'recipe'}
                  production={production}
                  recipeActionDock={recipeActionDock ?? undefined}
                />
              </div>
            ) : (
              <div className="px-4 py-3">
                <LockedCalculatorPreview />
              </div>
            )}
          </div>

          {/* The LIVE Monitor PI — always visible on desktop, recomputed on every draft
              change (useStudioResult), ONE predictable internal scroll surface (B6).
              Mobile reaches the SAME content through the Monitor bottom sheet. */}
          <aside
            className="hidden min-h-0 xl:block xl:min-w-0 xl:overflow-hidden"
            data-testid="pro-monitor-panel"
            aria-label={copy.proWorkbench.profile.title}
          >
            <RecipeProfilePanel
              activeTab={activeTab}
              onTabChange={onTabChange}
              result={result}
              servingTemperatureC={temperatureC}
              corrections={corrections}
              input={input}
              production={production}
              recipeBar={recipeBar}
              idPrefix="pro-context"
              showTabs={false}
              onOpenPreview={onOpenExistingPreview ?? (() => undefined)}
              onRecalculate={onRecalculate ?? (() => undefined)}
              initialLabelView={initialLabelView}
              labelViewRequestKey={labelViewRequestKey}
            />
          </aside>
        </div>
        {/* ── MOBILE PREVIEW BAR (owner §11/§12) ────────────────────────────
            The desktop right-hand pane becomes a bottom control bar: the SAME
            four modules, the same typography, the same active state. Tap once
            to open, tap the open module again to collapse, tap another to
            switch. The score / „Przelicz" strip sits directly above it so the
            formal calculation state is never more than a thumb away, and the
            whole stack respects `env(safe-area-inset-bottom)`. */}
        <div
          className="fixed inset-x-0 bottom-0 z-[60] xl:hidden"
          data-testid="mobile-cockpit-trigger"
        >
          {mobileRecipeActionDock ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-ink/10 bg-white px-[var(--pro-mobile-gutter)] py-2">
              {mobileRecipeActionDock}
            </div>
          ) : null}
          <WorkbenchModuleTabs
            activeTab={activeTab}
            onTabChange={selectMobileModule}
            onCollapse={collapseMobileCockpit}
            expanded={mobileCockpitOpen}
            triggerRef={cockpitTriggerRef}
            idPrefix="mobile-preview"
            variant="bottom"
            attentionTab={mobileAttentionTab}
          />
        </div>
        {mobileCockpitOpen && mobileViewport ? (
          <div
            className="fixed inset-x-0 top-0 bottom-[calc(var(--pro-bottom-nav-height)+env(safe-area-inset-bottom))] z-50 xl:hidden"
            data-testid="mobile-cockpit-sheet"
          >
            <button
              type="button"
              aria-label="Zamknij kokpit"
              onClick={collapseMobileCockpit}
              className="absolute inset-0 bg-black/35"
            />
            <section
              ref={cockpitPanelRef}
              id="mobile-cockpit-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-cockpit-title"
              className="absolute inset-x-0 bottom-0 flex h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] max-h-full flex-col overflow-hidden rounded-t-[22px] border-t border-ink/10 bg-white shadow-pro-e3 [overscroll-behavior:contain]"
            >
              <div className="relative z-40 flex shrink-0 items-center justify-between border-b border-ink/10 bg-white px-4 py-3">
                <h2 id="mobile-cockpit-title" className="text-sm font-semibold text-ink">
                  {MOBILE_PREVIEW_TITLES[activeTab]}
                </h2>
                <button
                  type="button"
                  aria-label="Zamknij kokpit"
                  onClick={collapseMobileCockpit}
                  className="grid size-11 place-items-center rounded-full border border-ink/15 text-lg text-ink"
                >
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto [--label-workspace-bottom-inset:4.75rem]">
                <RecipeProfilePanel
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                  result={result}
                  servingTemperatureC={temperatureC}
                  corrections={corrections}
                  input={input}
                  production={production}
                  recipeBar={recipeBar}
                  idPrefix="mobile-pro-context"
                  showTabs={false}
                  onOpenPreview={onOpenExistingPreview ?? (() => undefined)}
                  onRecalculate={onRecalculate ?? (() => undefined)}
                  initialLabelView={initialLabelView}
                  labelViewRequestKey={labelViewRequestKey}
                />
              </div>
            </section>
          </div>
        ) : null}
      </section>

      {/* Przelicz z PI — the compact OVERLAY (never a page section). */}
      {recalcSlot}
    </>
  );
}

/**
 * StudioReviewZone — the RED REVIEW ZONE below the viewport-height workbench
 * (intentional scroll only; owner architecture 2026-07-24). Hosted by the page
 * OUTSIDE the height-locked region so it never competes with the edit loop.
 * Every legacy module stays functional + visibly red-marked; the inventory table
 * carries the owner decision column (OCZEKUJE).
 */
export function StudioReviewZone() {
  const { fullFormula, technicalView, exactCorrectionGrams } = useAccess();
  const { input } = useStudioResult();
  // Production optimization preview (Slice 15) — computed on explicit click, never persisted.
  const [optimizationView, setOptimizationView] = useState<OptimizationPreviewView | null>(null);

  return (
    <ProReviewZone inventory={REVIEW_INVENTORY}>
      {/* QA/demo scenarios are an internal tool (owner P0): never the default owner
            workspace — dev builds only, dead-code-eliminated from production. */}
      {import.meta.env.DEV ? <PresetSelector /> : null}

      {/* UIUX Slice E (§17–§20): locks, Preview→verify-gated Apply, §18 feasibility
            honesty, history/Undo/Explain — legacy Studio tools. Exact-gram surface —
            mounted only with fullFormula (§22.1: Demo never receives full grams). */}
      {fullFormula ? (
        <ReviewMarkedModule
          id="studio-tools"
          title={studio.secondary.reviewMarked.studioTools}
          badge="DO PRZEGLĄDU"
          note={studio.secondary.reviewMarked.studioToolsNote}
        >
          <ConstraintStudioSection />
        </ReviewMarkedModule>
      ) : null}

      {/* Conversational Assistant Shell (PL-first, deterministic): read-only intent draft. */}
      <ReviewMarkedModule
        id="assistant"
        title={studio.secondary.reviewMarked.assistant}
        badge="OPCJONALNE"
      >
        <StudioAssistantShell />
      </ReviewMarkedModule>

      {/* User-Flow guidance layer (PL-first, read-only): explains the current situation. */}
      <ReviewMarkedModule
        id="flow-guide"
        title={studio.secondary.reviewMarked.flowGuide}
        badge="OPCJONALNE"
      >
        <StudioFlowGuidePanel view={optimizationView} />
      </ReviewMarkedModule>

      {/* Production optimization preview (Slice 15): real solver + Base Engine rerun on the
            LIVE recipe on explicit click. Pure preview — never saves/applies/persists/mutates. */}
      <ReviewMarkedModule
        id="optimization"
        title={studio.secondary.reviewMarked.optimization}
        badge="OPCJONALNE"
        note={studio.secondary.reviewMarked.optimizationNote}
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ivory/60">
            {studio.optimization.note}
            {!exactCorrectionGrams ? ` ${studio.optimization.proOnly}` : ''}
          </p>
          <button
            type="button"
            onClick={() =>
              setOptimizationView(
                previewOptimization({ recipe: input, intent: studioIntentFromRecipe(input) }),
              )
            }
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
          >
            {studio.optimization.run}
          </button>
          {optimizationView ? (
            <>
              <OptimizationPreviewPanel
                view={optimizationView}
                policy={optimizationDisplayPolicy(
                  { exactCorrectionGrams, technicalView },
                  { dev: import.meta.env.DEV },
                )}
              />
              {/* Slice 24 — the FIRST write control: signed-in Pro may persist an accepted
                    correction as ONE immutable audit record. Explicit click; recipe never changed. */}
              <SaveCorrectionControl view={optimizationView} recipe={input} />
            </>
          ) : null}
        </div>
      </ReviewMarkedModule>

      {/* IF9/IF10 branch previews (Slice 21): Batch Rescue + Stock Shortage —
            paid-gated, explicit-click, non-persisted. */}
      <ReviewMarkedModule
        id="branch-previews"
        title={studio.secondary.reviewMarked.branchPreviews}
        badge="ADVANCED / REVIEW"
        note={studio.secondary.reviewMarked.branchPreviewsNote}
      >
        <BranchWorkflowPreviews
          recipe={input}
          capabilities={{ exactCorrectionGrams, technicalView }}
        />
      </ReviewMarkedModule>
    </ProReviewZone>
  );
}
