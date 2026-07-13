/**
 * Customer-shell — Monitor PI section (real recalculation on the current recipe).
 *
 * Runs the customer's stepped wishes through Agent B's REAL pipeline
 * (`recalculateWithPi` → `realPiRecalculationRunner` → previewOptimization → the
 * canonical engine + solver) on the CURRENT real `recipeInput`. Exact recalc is
 * gated on ingredient resolution AND on a calculated recipe existing. Nothing is
 * saved; the corrected snapshot is local-only. Demo stays qualitative (redaction
 * happens inside the pipeline via the persona capability).
 */
import { useState } from 'react';
import type { RecipeInput } from '@/engine';
import {
  PI_AXIS_ORDER,
  axisLabel,
  axisStepLabels,
  evaluateRecalcGate,
  NEUTRAL_AXIS_INTENTS,
  piBaseIntentFromRecipe,
  realPiRecalculationRunner,
  recalculateWithPi,
  type AxisIntentStep,
  type IngredientResolutionSummary,
  type PiAxisIntents,
  type PiMonitorPersona,
  type PiRecalculationView,
} from '@/features/pi-monitor';
import { SelectableCard, TouchButton } from './ui';
import { customerShellCopy as copy } from './customerShellCopy';

const STEPS: readonly AxisIntentStep[] = ['decrease', 'keep', 'increase'];

export function PiMonitorSection({
  summary,
  gramsVisible,
  recipeInput,
  persona,
}: {
  summary: IngredientResolutionSummary;
  gramsVisible: boolean;
  recipeInput: RecipeInput | null;
  persona: PiMonitorPersona;
}) {
  const [intents, setIntents] = useState<PiAxisIntents>(NEUTRAL_AXIS_INTENTS);
  const [result, setResult] = useState<PiRecalculationView | null>(null);

  const gate = evaluateRecalcGate(summary);
  const canRun = recipeInput !== null && gate.canRecalculate;

  const recalc = () => {
    if (recipeInput === null) return;
    setResult(
      recalculateWithPi({
        baseIntent: piBaseIntentFromRecipe(recipeInput),
        recipeDraft: recipeInput,
        axisIntents: intents,
        resolution: summary,
        persona,
        runner: realPiRecalculationRunner,
      }),
    );
  };

  return (
    <section className="mt-6 rounded-2xl border border-ink/10 bg-ink/[0.02] p-4">
      <p className="text-[12px] uppercase tracking-[0.14em] text-stone-500">{copy.monitor.label}</p>
      <p className="mt-1 text-[17px] font-medium text-ink">{copy.monitor.title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-stone-500">{copy.monitor.lead}</p>

      <div className="mt-4 flex flex-col gap-4">
        {PI_AXIS_ORDER.map((id) => {
          const labels = axisStepLabels(id);
          const current = intents[id];
          return (
            <div key={id}>
              <p className="text-[14px] font-medium text-ink">{axisLabel(id)}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {STEPS.map((step) => (
                  <SelectableCard
                    key={step}
                    title={labels[step]}
                    selected={current === step}
                    onSelect={() => {
                      setResult(null);
                      setIntents((prev) => ({ ...prev, [id]: step }));
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <TouchButton block size="lg" disabled={!canRun} onClick={recalc}>
          {copy.monitor.recalc}
        </TouchButton>
      </div>

      {/* Blocked by unresolved ingredients. */}
      {!gate.canRecalculate ? (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
          {gate.blockCopy}
        </p>
      ) : recipeInput === null ? (
        <p className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] leading-relaxed text-stone-400">
          {copy.monitor.needsCalculatedNote}
        </p>
      ) : result && result.ran ? (
        <div className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3">
          <p className="text-[14px] font-medium text-ink">{result.outcomeLabel}</p>
          {result.outcomeDetail ? (
            <p className="mt-1 text-[13px] leading-relaxed text-stone-400">{result.outcomeDetail}</p>
          ) : null}
          {/* Exact gram adjustments — Home/Pro only (Demo payload carries none). */}
          {gramsVisible && result.proposedAdjustments && result.proposedAdjustments.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12px] uppercase tracking-[0.12em] text-stone-500">{copy.monitor.adjustmentsTitle}</p>
              <ul className="mt-1 space-y-1">
                {result.proposedAdjustments.map((a, i) => (
                  <li key={`${a.ingredient}-${i}`} className="text-[13px] text-stone-300">
                    {a.ingredient}: {a.grams > 0 ? '+' : ''}
                    {Math.round(a.grams)} {copy.device.unitGrams}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3">
            <TouchButton variant="quiet" size="md" onClick={() => setResult(null)}>
              {copy.monitor.undo}
            </TouchButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
