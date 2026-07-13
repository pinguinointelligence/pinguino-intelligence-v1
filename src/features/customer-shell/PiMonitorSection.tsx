/**
 * Customer-shell — Monitor PI section (presentational + local state).
 *
 * Puts the PI Recipe Monitor on the customer result screen: the four customer axes
 * (Słodycz / Konsystencja / Kremowość / Pełnia) with deterministic stepped choices,
 * and the `Przelicz z PI` action GATED on ingredient resolution — reusing Agent B's
 * axis contracts and `evaluateRecalcGate` (the exact honest blocker copy). No engine
 * math runs here and no grams are shown: the customer result is a preview structure
 * without a computed engine recipe, so this captures the direction honestly and the
 * exact recalculation stays a Home/Pro action on a computed recipe (never faked).
 */
import { useState } from 'react';
import {
  PI_AXIS_ORDER,
  axisLabel,
  axisStepLabels,
  evaluateRecalcGate,
  NEUTRAL_AXIS_INTENTS,
  type AxisIntentStep,
  type IngredientResolutionSummary,
  type PiAxisIntents,
} from '@/features/pi-monitor';
import { SelectableCard, TouchButton } from './ui';
import { customerShellCopy as copy } from './customerShellCopy';

const STEPS: readonly AxisIntentStep[] = ['decrease', 'keep', 'increase'];

export function PiMonitorSection({
  summary,
  gramsVisible,
}: {
  summary: IngredientResolutionSummary;
  gramsVisible: boolean;
}) {
  const [intents, setIntents] = useState<PiAxisIntents>(NEUTRAL_AXIS_INTENTS);
  const [requested, setRequested] = useState(false);
  const gate = evaluateRecalcGate(summary);

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
                      setRequested(false);
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
        <TouchButton block size="lg" disabled={!gate.canRecalculate} onClick={() => setRequested(true)}>
          {copy.monitor.recalc}
        </TouchButton>
      </div>

      {!gate.canRecalculate ? (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
          {gate.blockCopy}
        </p>
      ) : requested ? (
        <p className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] leading-relaxed text-stone-400">
          {gramsVisible ? copy.monitor.readyNote : copy.monitor.demoNote}
        </p>
      ) : null}
    </section>
  );
}
