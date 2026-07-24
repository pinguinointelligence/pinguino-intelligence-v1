import { useEffect, useState, type ReactNode } from 'react';
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
import { engineRouteLabel } from '@/features/studio/engineRouteLabel';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { LockedCalculatorPreview } from '@/features/studio/locked/LockedCalculatorPreview';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';
import { MonitorPanelContent } from '@/features/pro-workbench/MonitorPanelContent';
import { ProReviewZone, type ReviewInventoryRow } from '@/features/pro-workbench/ProReviewZone';
import { WorkbenchActionBar } from '@/features/pro-workbench/WorkbenchActionBar';
import { WorkbenchSettingsLine } from '@/features/pro-workbench/WorkbenchSettingsLine';
import { DEFAULT_PRESET } from '@/data/demoPresets';

const { studio } = copy;

/** Owner review inventory (2026-07-24, one-screen architecture): every module moved
 * BELOW the core workbench, with the explicit decision column = OCZEKUJE. Mirrors the
 * design-review pattern (PL metadata beside the marked modules, nothing removed). */
const REVIEW_INVENTORY: readonly ReviewInventoryRow[] = [
  {
    id: 'studio-tools',
    name: studio.secondary.reviewMarked.studioTools,
    purpose: studio.secondary.reviewMarked.studioToolsNote,
    route: '/pro/recipe → strefa przeglądu',
    recommendation: 'Scalić z edytorem (blokady są już w tabeli) lub zostawić jako narzędzie zaawansowane.',
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
  onOpenRecalcPanel,
  recalcSlot,
  focusMonitor = false,
}: {
  forceDemo?: boolean;
  /** Re-open the recalculation overlay on an ALREADY-staged preview (no new solve). */
  onOpenRecalcPanel?: () => void;
  /** The Przelicz z PI overlay (Preview → Zastosuj/Anuluj → Cofnij), host-wired. */
  recalcSlot?: ReactNode;
  /** /pro/monitor deep-link: visually focus the LIVE Monitor panel. */
  focusMonitor?: boolean;
}) {
  const setPlan = useSessionStore((state) => state.setPlan);
  const loadPreset = useRecipeStore((state) => state.loadPreset);
  const { fullFormula } = useAccess();
  const { result, corrections, input } = useStudioResult();

  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const batchGrams = useRecipeStore((state) => state.target_batch_grams);
  const servingModeId = useRecipeStore((state) => state.servingModeId);

  // The route chip derives from the CURRENT resolved Engine route (owner P0 temperature
  // contract) — never a hardcoded engine name. Same store values buildRecipeInput uses.
  const route = engineRouteLabel(servingModeId, temperatureC);

  // The public /demo entry is always a demo session that cold-opens the curated
  // default scenario; /pro (forceDemo=false) preserves persisted edits.
  useEffect(() => {
    if (forceDemo) {
      setPlan('demo');
      loadPreset(DEFAULT_PRESET);
    }
  }, [forceDemo, setPlan, loadPreset]);

  return (
    <>
      {/* ── ONE-SCREEN WORKBENCH — fills the remaining viewport height on desktop; every
          edit-loop control lives INSIDE this section (owner zero-page-scroll rule). ── */}
      <section
        className="flex min-h-0 flex-col lg:flex-1 lg:overflow-hidden"
        data-testid="pro-workbench"
      >
        {/* Row 2 — the compact settings line + the live Engine-route chip. */}
        <div className="shrink-0">
          <WorkbenchSettingsLine />
          <div className="flex flex-wrap items-center gap-x-3 border-b border-ivory/10 px-4 py-1">
            <span className="text-[10px] tracking-[0.06em] text-ivory/60 uppercase" data-testid="engine-route-chip">
              {studio.eyebrow} · {route.main}
            </span>
            {route.detail ? (
              <span className="text-[10px] leading-none text-ivory/60" data-testid="engine-route-detail">
                {route.detail}
              </span>
            ) : null}
          </div>
        </div>

        {/* Main split — editor (60–65 %) | LIVE Monitor PI (35–40 %). */}
        <div className="min-h-0 flex-1 lg:flex lg:flex-row">
          <div
            className="min-h-0 lg:flex lg:w-[62%] lg:flex-col lg:border-r lg:border-ivory/10"
            data-testid="workbench-editor-pane"
          >
            {fullFormula ? (
              <IngredientBuilder
                items={result.items}
                totalBatchG={result.total_batch_g}
                targetBatchG={batchGrams}
                demo={forceDemo}
                layout="workbench"
              />
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
            className={`hidden min-h-0 px-4 py-3 lg:block lg:w-[38%] lg:overflow-y-auto ${
              focusMonitor ? 'ring-2 ring-inset ring-ivory/40' : ''
            }`}
            data-testid="pro-monitor-panel"
            aria-label={copy.monitorPi.panelTitle}
          >
            <MonitorPanelContent
              result={result}
              servingTemperatureC={temperatureC}
              corrections={corrections}
              input={input}
            />
          </aside>
        </div>

        {/* Bottom action/result bar — thin, fixed inside the workbench. */}
        <div className="shrink-0">
          <WorkbenchActionBar
            totalBatchG={result.total_batch_g}
            onOpenPreview={onOpenRecalcPanel ?? (() => {})}
          />
        </div>
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
                setOptimizationView(previewOptimization({ recipe: input, intent: studioIntentFromRecipe(input) }))
              }
              className="inline-flex w-full items-center justify-center rounded-md border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            >
              {studio.optimization.run}
            </button>
            {optimizationView ? (
              <>
                <OptimizationPreviewPanel
                  view={optimizationView}
                  policy={optimizationDisplayPolicy({ exactCorrectionGrams, technicalView }, { dev: import.meta.env.DEV })}
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
