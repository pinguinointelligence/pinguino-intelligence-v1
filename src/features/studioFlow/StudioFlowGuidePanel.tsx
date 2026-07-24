/**
 * StudioFlowGuidePanel — the PL-first User-Flow guidance layer in Studio.
 *
 * READ-ONLY: derives the current situation from state Studio already has
 * (optimization preview, tier capabilities, signed-in status) and renders the
 * locked PL copy. No buttons that save or apply, no persistence, no
 * auto-actions — the only interactive element is a native disclosure for the
 * production-flow explanations. Honesty gates mirror the save control: the
 * save note appears only for a genuinely rerun-verified saveable solve.
 */
import { useAccess } from '@/access/useAccess';
import { useAuthStore } from '@/stores/authStore';
import type { OptimizationPreviewView } from '@/features/optimization/optimizationPreviewRunner';
import { productionFlowGuidance, studioFlowGuidance } from './studioFlowGuidance';

/** Saveable = the same core conditions the save control enforces (conservative). */
const saveableSolve = (view: OptimizationPreviewView): boolean => {
  const solve = view.engineSeededSolve;
  return (
    solve.active &&
    (solve.decision === 'optimized' || solve.decision === 'tradeoff') &&
    solve.rerunState === 'rerun_complete' &&
    solve.proposedAdjustments.length > 0 &&
    solve.correctedRecipeSnapshot != null
  );
};

export function StudioFlowGuidePanel({ view }: { view: OptimizationPreviewView | null }) {
  const { exactCorrectionGrams, saveRecipes } = useAccess();
  const authStatus = useAuthStore((state) => state.status);

  const guidance = studioFlowGuidance({
    authStatus,
    exactCorrectionGrams,
    saveRecipes,
    optimization: view
      ? {
          finalDecision: view.finalDecision,
          saveableSolve: saveableSolve(view),
          productProfile: view.productProfile,
          servingTemperatureC: view.servingTemperatureC,
        }
      : null,
  });

  return (
    <div className="space-y-2 rounded-lg border border-ivory/10 bg-black/20 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ivory/60">Przewodnik</p>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ivory/90">{guidance.title}</p>
        {guidance.contextLine ? (
          <p className="font-mono text-[11px] text-ivory/60">{guidance.contextLine}</p>
        ) : null}
        <p className="text-xs leading-relaxed text-ivory/60">{guidance.body}</p>
        <p className="text-xs leading-relaxed text-ivory/65">→ {guidance.nextAction}</p>
      </div>

      <p className="text-[11px] leading-relaxed text-ivory/60">{guidance.tierNote}</p>

      {guidance.saveNote ? (
        <p className="text-[11px] leading-relaxed text-ivory/65">{guidance.saveNote}</p>
      ) : null}
      {guidance.saveVsApplyNote ? (
        <p className="text-[11px] leading-relaxed text-ivory/60">{guidance.saveVsApplyNote}</p>
      ) : null}

      <details className="text-[11px] leading-relaxed text-ivory/60">
        <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wide text-ivory/60">
          Przepływy produkcyjne
        </summary>
        <div className="mt-1.5 space-y-1.5">
          {productionFlowGuidance().map((item) => (
            <p key={item.title}>
              <span className="text-ivory/60">{item.title}:</span> {item.body}
            </p>
          ))}
        </div>
      </details>

      <div className="border-t border-ivory/10 pt-1.5">
        {guidance.disclaimers.map((line) => (
          <p key={line} className="text-[10px] leading-relaxed text-ivory/60">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
