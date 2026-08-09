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
 * Desktop (lg+): a viewport-filling column that NEVER page-scrolls during normal
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
}: {
  forceDemo?: boolean;
  /** The Przelicz z PI overlay (Preview → Zastosuj/Anuluj → Cofnij), host-wired. */
  recalcSlot?: ReactNode;
  /** Stable right-panel route: Profile / Monitor / Production / History. */
  activePanel?: ProContextTab;
  /** The one recipe name/save bar, mounted at the bottom-left of the editor. */
  recipeBar?: ReactNode;
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
  const { result, corrections, input } =
    cockpitTab === 'production'
      ? {
          result: production.forecastResult,
          corrections: production.corrections,
          input: production.forecastInput,
        }
      : planning;
  const scoreDisplay = monitorScoreView(result, input).match.display;
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
        className="flex min-h-0 flex-col lg:flex-1 lg:overflow-hidden"
        data-testid="pro-workbench"
      >
        {/* Main split — editor (60–65 %) | LIVE Monitor PI (35–40 %). */}
        <div className="min-h-0 flex-1 lg:flex lg:flex-row">
          <div
            className="min-h-0 lg:flex lg:w-[62%] lg:flex-col lg:border-r lg:border-ivory/10"
            data-testid="workbench-editor-pane"
          >
            {fullFormula ? (
              <div className="min-h-0 flex-1 lg:overflow-hidden">
                <IngredientBuilder
                  items={result.items}
                  totalBatchG={result.total_batch_g}
                  targetBatchG={batchGrams}
                  demo={forceDemo}
                  layout="workbench"
                  mode={cockpitTab === 'production' ? 'production' : 'recipe'}
                  production={production}
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
            className="hidden min-h-0 border-t border-ink/10 lg:block lg:w-[38%] lg:overflow-y-auto lg:border-t-0"
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
              production={production}
            />
          </aside>
        </div>
        <div className="shrink-0 border-t border-ink/10">
          {cockpitTab === 'production' && production.session?.status === 'in_progress' ? (
            <div className="flex min-h-12 items-center justify-between gap-3 bg-white px-3 py-2 text-ink" data-testid="production-bottom-bar">
              <div className="min-w-0">
                <strong className="block truncate text-xs">{production.session.source.recipeName}</strong>
                <span className="font-mono text-[9px] tabular-nums text-stone-500">
                  {production.progress?.confirmedCount ?? 0}/{production.progress?.totalCount ?? 0} · {production.progress?.confirmedMassG.toFixed(1) ?? '0.0'} g w naczyniu
                </span>
              </div>
              <button
                type="button"
                disabled={!production.progress?.coherent}
                onClick={production.complete}
                className="h-9 shrink-0 bg-ink px-4 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                Zakończ produkcję
              </button>
            </div>
          ) : cockpitTab === 'production' && production.session?.status === 'completed' ? (
            <div className="flex min-h-12 items-center justify-between bg-white px-3 py-2 text-xs text-ink">
              <span>Partia zakończona · Master Label</span>
              <span className="font-mono tabular-nums">{production.session?.completionSnapshot?.actualFinalMassG.toFixed(1) ?? '—'} g</span>
            </div>
          ) : (
            recipeBar
          )}
        </div>

        <button
          ref={cockpitTriggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={mobileCockpitOpen}
          aria-controls="mobile-cockpit-dialog"
          onClick={() => setMobileCockpitOpen(true)}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-30 flex items-center gap-2 rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink shadow-[0_8px_24px_rgba(16,17,19,0.12)] lg:hidden"
          data-testid="mobile-cockpit-trigger"
        >
          <span className="font-mono tabular-nums">{scoreDisplay}</span>
          Kokpit
        </button>

        {mobileCockpitOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" data-testid="mobile-cockpit-sheet">
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
              className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-lg border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_rgba(16,17,19,0.14)]"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-3 py-2">
                <h2 id="mobile-cockpit-title" className="text-xs font-semibold text-ink">
                  Kokpit aktualnej receptury
                </h2>
                <button
                  type="button"
                  aria-label="Zamknij kokpit"
                  onClick={() => setMobileCockpitOpen(false)}
                  className="grid size-9 place-items-center rounded-full border border-ink/10 text-lg text-ink"
                >
                  ×
                </button>
              </div>
              <RecipeProfilePanel
                activeTab={cockpitTab}
                onTabChange={setCockpitTab}
                result={result}
                servingTemperatureC={temperatureC}
                corrections={corrections}
                input={input}
                production={production}
              />
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
            className="inline-flex w-full items-center justify-center rounded-md border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
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
