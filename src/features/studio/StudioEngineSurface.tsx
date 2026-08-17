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
import { PresetSelector } from '@/features/studio/PresetSelector';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { LockedCalculatorPreview } from '@/features/studio/locked/LockedCalculatorPreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { ProReviewZone, type ReviewInventoryRow } from '@/features/pro-workbench/ProReviewZone';
import {
  RecipeProfilePanel,
  type CockpitTab,
  type ProContextTab,
} from '@/features/pro-workbench/RecipeProfilePanel';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { useProductionWorkspace } from '@/features/production-workspace/useProductionWorkspace';
import {
  MOBILE_COCKPIT_QUERY,
  shouldActivateMobileCockpitModal,
} from '@/features/studio/mobileCockpitModal';

const { studio } = copy;
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
  activePanel = 'recipe',
  recipeBar,
  onRecalculate,
}: {
  forceDemo?: boolean;
  /** The Przelicz z PI overlay (Preview → Zastosuj/Anuluj → Cofnij), host-wired. */
  recalcSlot?: ReactNode;
  /** Stable right-panel route: Profile / Monitor / Production / History. */
  activePanel?: ProContextTab;
  /** The one recipe name/save bar, mounted at the bottom-left of the editor. */
  recipeBar?: ReactNode;
  onRecalculate?: () => void;
}) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const loadPreset = useRecipeStore((state) => state.loadPreset);
  const { fullFormula } = useAccess();
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const batchGrams = useRecipeStore((state) => state.target_batch_grams);
  const initialCockpit: CockpitTab =
    activePanel === 'monitor' ? 'monitor' : activePanel === 'production' ? 'production' : 'profile';
  const [cockpitTab, setCockpitTab] = useState<CockpitTab>(initialCockpit);
  const planning = useStudioResult('planning');
  const production = useProductionWorkspace(cockpitTab === 'production');
  const productionReady = cockpitTab === 'production' && production.practicalReady !== false;
  const { result, corrections, input } = productionReady
    ? {
        result: production.forecastResult,
        corrections: production.corrections,
        input: production.forecastInput,
      }
    : planning;
  const scoreDisplay = monitorScoreView(planning.result, planning.input).match.display;
  const [mobileCockpitOpen, setMobileCockpitOpen] = useState(activePanel === 'monitor');
  const [mobileViewport, setMobileViewport] = useState(false);
  const cockpitTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cockpitPanelRef = useRef<HTMLElement | null>(null);

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
      setCockpitTab('profile');
      setMobileCockpitOpen(true);
      queueMicrotask(() =>
        document.querySelector<HTMLElement>('[data-testid="workbench-settings-line"]')?.focus(),
      );
    };
    window.addEventListener('pinguino:profile-settings-required', showProfileSettings);
    return () =>
      window.removeEventListener('pinguino:profile-settings-required', showProfileSettings);
  }, []);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_COCKPIT_QUERY);
    const sync = () => setMobileViewport(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

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
        setMobileCockpitOpen(false);
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
  }, [mobileCockpitOpen, mobileViewport]);

  return (
    <>
      {/* ── ONE-SCREEN WORKBENCH — fills the remaining viewport height on desktop; every
          edit-loop control lives INSIDE this section (owner zero-page-scroll rule). ── */}
      <section
        className="flex min-h-0 flex-col xl:flex-1 xl:overflow-hidden"
        data-testid="pro-workbench"
      >
        {/* Main split — editor (60–65 %) | LIVE Monitor PI (35–40 %). */}
        <div className="min-h-0 flex-1 xl:grid xl:max-h-[var(--pro-workbench-body-max)] xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)] xl:gap-[var(--pro-workbench-gap)]">
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
            className="min-h-0 xl:flex xl:min-w-0 xl:flex-col"
            data-testid="workbench-editor-pane"
          >
            {fullFormula && cockpitTab === 'production' && !productionReady ? (
              <section
                className="grid h-full min-h-[24rem] place-items-center bg-paper p-6"
                data-testid="production-editor-practical-block"
              >
                <div className="max-w-md rounded-[22px] border border-attention/25 bg-pro-amber/35 p-6 text-center shadow-pro-sm">
                  <p className="text-xs font-semibold tracking-[0.08em] text-attention uppercase">
                    Wymaga receptury wykonawczej
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-ink">
                    Najpierw zweryfikuj Preview
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Produkcja nie pokazuje ani nie przyjmuje gramatur ze szkicu. Zastosuj praktyczną
                    recepturę pełnogramową, a ten obszar przełączy się na plan, faktyczną masę i
                    potwierdzenia.
                  </p>
                </div>
              </section>
            ) : fullFormula ? (
              <div className="min-h-0 flex-1 xl:overflow-hidden">
                <IngredientBuilder
                  items={result.items}
                  totalBatchG={result.total_batch_g}
                  targetBatchG={batchGrams}
                  demo={forceDemo}
                  layout="workbench"
                  mode={productionReady ? 'production' : 'recipe'}
                  production={production}
                  onRecalculate={onRecalculate}
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
            className="hidden min-h-0 border-t border-pro-line bg-pro-warm xl:block xl:min-w-0 xl:overflow-hidden xl:border-t-0"
            data-testid="pro-monitor-panel"
            aria-label={copy.proWorkbench.profile.title}
          >
            <RecipeProfilePanel
              activeTab={cockpitTab}
              onTabChange={setCockpitTab}
              result={result}
              servingTemperatureC={temperatureC}
              corrections={corrections}
              input={input}
              canonicalResult={planning.result}
              canonicalInput={planning.input}
              production={production}
            />
          </aside>
        </div>
        <div className="shrink-0 border-t border-ink/10 bg-white px-3 py-2 xl:hidden">
          <button
            ref={cockpitTriggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mobileCockpitOpen}
            aria-controls="mobile-cockpit-dialog"
            onClick={() => setMobileCockpitOpen(true)}
            className="pro-focus-ring flex min-h-11 w-full items-center justify-between rounded-[14px] border border-ink/12 bg-ink px-4 py-2 text-xs font-semibold text-white shadow-pro-e1"
            data-testid="mobile-cockpit-trigger"
          >
            <span>Otwórz kokpit receptury</span>
            <span className="font-mono tabular-nums text-gold-soft">{scoreDisplay}</span>
          </button>
        </div>
        <div className="shrink-0 border-t border-ink/10 xl:mt-2 xl:border-0">{recipeBar}</div>

        {mobileCockpitOpen ? (
          <div className="fixed inset-0 z-50 xl:hidden" data-testid="mobile-cockpit-sheet">
            <button
              type="button"
              aria-label="Zamknij kokpit"
              onClick={() => setMobileCockpitOpen(false)}
              className="absolute inset-0 bg-black/35"
            />
            <section
              ref={cockpitPanelRef}
              id="mobile-cockpit-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-cockpit-title"
              className="absolute inset-x-0 bottom-0 flex h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] max-h-none flex-col overflow-hidden rounded-t-[26px] border-t border-white/10 bg-[#17191d] pb-[env(safe-area-inset-bottom)] shadow-pro-e3 [overscroll-behavior:contain]"
            >
              <div className="relative z-40 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#17191d] px-4 py-3">
                <h2 id="mobile-cockpit-title" className="text-sm font-semibold text-white">
                  Kokpit aktualnej receptury
                </h2>
                <button
                  type="button"
                  aria-label="Zamknij kokpit"
                  onClick={() => setMobileCockpitOpen(false)}
                  className="grid size-11 place-items-center rounded-full border border-white/15 text-lg text-white"
                >
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RecipeProfilePanel
                  activeTab={cockpitTab}
                  onTabChange={setCockpitTab}
                  result={result}
                  servingTemperatureC={temperatureC}
                  corrections={corrections}
                  input={input}
                  canonicalResult={planning.result}
                  canonicalInput={planning.input}
                  production={production}
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
