/**
 * Customer-shell — Monitor receptury (SPEC §13 Monitor Home, UIUX Slice D).
 *
 * The customer result's monitor, built ON the existing pi-monitor bridge (no
 * parallel monitor):
 *  - „Dopasowanie receptury" 1–10 + §15.1 verdict (recipe-score adapter);
 *  - the four §13 consumer traits + Stabilność as Złoty Zakres 5-state TEXT
 *    readings with a qualitative golden mini-bar (landing visual language:
 *    neutral track, gold OPTIMUM segment, marker — never red–green–red);
 *  - the §13.3 machine/batch/structure checklist;
 *  - the §16 stepped preference controls (existing 3-step intent lever) and the
 *    REAL recalculation through Agent B's pipeline (`recalculateWithPi` →
 *    `realPiRecalculationRunner` → previewOptimization → canonical engine +
 *    solver) on the CURRENT `recipeInput`. Nothing is saved; the corrected
 *    snapshot is local-only.
 *
 * ENGINE DATA PROTECTION (§22, §13.2): the §13 view model carries NO numeric
 * metric/band data by construction; exact grams appear ONLY in the proposed
 * adjustments for personas with the exact-grams capability (Demo payload
 * carries none). The engine is consumed via the public `@/engine` entry point
 * (`calculateRecipe`) — presentation only, nothing persisted.
 */
import { useMemo, useState } from 'react';
import { calculateRecipe, type RecipeResult, type RecipeInput } from '@/engine';
import {
  MONITOR_HOME_STEP_LABELS,
  MONITOR_HOME_TRAIT_AXIS,
  MONITOR_HOME_TRAIT_ORDER,
  buildMonitorHomeView,
  evaluateRecalcGate,
  isMonitorTuningApproved,
  NEUTRAL_AXIS_INTENTS,
  piBaseIntentFromRecipe,
  realPiRecalculationRunner,
  recalculateWithPi,
  TUNING_NOT_APPROVED_COPY,
  type AxisIntentStep,
  type IngredientResolutionSummary,
  type MonitorHomeCheckRow,
  type MonitorHomeMachineContext,
  type PiAxisIntents,
  type PiMonitorPersona,
  type PiRecalculationView,
} from '@/features/pi-monitor';
import { MATCH_SCORE_TOOLTIPS, type GoldenRangeReading } from '@/features/recipe-score';
import { SelectableCard, TouchButton, notice } from './ui';
import { customerShellCopy as copy } from './customerShellCopy';

const STEPS: readonly AxisIntentStep[] = ['decrease', 'keep', 'increase'];

/* ------------------------------------------------------------------ *
 * Złoty Zakres row visuals (§15.3 — text first, color never alone)    *
 * ------------------------------------------------------------------ */

/** State → readable TEXT tone on the light surface. Gold marks OPTIMUM only. */
const READING_TEXT_TONE: Record<GoldenRangeReading['state'], string> = {
  golden: 'text-gold font-medium',
  info: 'text-stone-600',
  amber: 'text-status-risky',
  red: 'text-status-error',
  neutral: 'text-stone-500',
};

/**
 * Qualitative marker position (% of track) from state + side ONLY — no metric
 * value is used, so nothing numeric can leak (§22). The gold segment spans
 * 34–66% (the landing GoldenRangeBar geometry).
 */
function markerPosition(reading: GoldenRangeReading): number | null {
  const { state, side } = reading;
  if (state === 'neutral') return null;
  if (state === 'golden') return 50;
  if (side === 'below') return state === 'red' ? 8 : state === 'amber' ? 24 : 32;
  if (side === 'above') return state === 'red' ? 92 : state === 'amber' ? 76 : 68;
  // in-band (info, near the band edge) — just inside the golden segment.
  return 62;
}

/**
 * Golden mini-bar (landing visual language): neutral track, gold OPTIMUM
 * segment, qualitative marker. Decorative — the row TEXT carries the meaning.
 */
function GoldenRangeMiniBar({ reading }: { reading: GoldenRangeReading }) {
  const at = markerPosition(reading);
  return (
    <span aria-hidden className="relative mt-2 block h-1 w-full rounded-full bg-stone-200">
      <span className="absolute inset-y-0 left-[34%] right-[34%] rounded-full bg-gold/50" />
      {at !== null ? (
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            reading.state === 'golden' ? 'bg-gold' : 'bg-ink/70'
          }`}
          style={{ left: `${at}%` }}
        />
      ) : null}
    </span>
  );
}

function TraitReadingRow({ label, reading }: { label: string; reading: GoldenRangeReading }) {
  return (
    <div className="border-t border-ink/10 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[14px] font-medium text-ink">{label}</span>
        <span className={`text-right text-[13px] ${READING_TEXT_TONE[reading.state]}`}>
          {reading.text}
        </span>
      </div>
      <GoldenRangeMiniBar reading={reading} />
    </div>
  );
}

/** §13.3 checklist row — calm check for 'ok', honest note for 'attention'. */
function CheckRow({ check }: { check: MonitorHomeCheckRow }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0">
        {check.tone === 'ok' ? (
          <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ink" />
        ) : (
          <path d="M8 3.5v6M8 12.4v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-status-risky" />
        )}
      </svg>
      <span className={`text-[13px] leading-relaxed ${check.tone === 'ok' ? 'text-stone-700' : 'text-status-risky'}`}>
        {check.text}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Section                                                             *
 * ------------------------------------------------------------------ */

/**
 * The read-only §13 Monitor readout — the SAME component renders the customer
 * result's monitor AND the public landing demo (owner Slice F decision: the
 * landing uses the REAL Monitor with a safe demo payload, never an imitation).
 * View-model in, presentation out; every number is stripped at the view-model
 * source (§22) except the sanctioned 1–10 score.
 */
export function MonitorHomeReadout({
  home,
}: {
  home: ReturnType<typeof buildMonitorHomeView>;
}) {
  return (
    <>
      {/* §15.1 „Dopasowanie receptury" — integer 1–10 + verdict; never /100,
          never a percent, never decimals. Tooltip: 10/10 ≠ laboratory claim. */}
      <div
        className="mt-2 flex items-baseline gap-3"
        aria-label={home.score.ariaText}
        title={MATCH_SCORE_TOOLTIPS[home.score.tooltipKey]}
      >
        <span className="font-mono text-[34px] font-medium leading-none tracking-tight tabular-nums text-ink">
          {home.score.display}
        </span>
        <span className="text-[15px] font-medium text-ink">{home.score.label}</span>
      </div>

      {/* §13 traits + Stabilność — Złoty Zakres 5-state TEXT rows (no numbers). */}
      <div className="mt-5 flex flex-col gap-3">
        {home.traits.map((trait) => (
          <TraitReadingRow key={trait.id} label={trait.label} reading={trait.reading} />
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-ink/10 pt-3">
          <span className="text-[14px] font-medium text-ink">{home.stability.label}</span>
          <span className={`text-right text-[13px] ${READING_TEXT_TONE[home.stability.reading.state]}`}>
            {home.stability.reading.text}
          </span>
        </div>
      </div>

      {/* §13.3 machine / amount / structure checklist. */}
      {home.checks.length > 0 ? (
        <ul className="mt-4 space-y-1.5 rounded-xl border border-ink/10 bg-paper px-4 py-3">
          {home.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function PiMonitorSection({
  summary,
  gramsVisible,
  recipeInput,
  persona,
  machineContext = null,
}: {
  summary: IngredientResolutionSummary;
  gramsVisible: boolean;
  recipeInput: RecipeInput | null;
  persona: PiMonitorPersona;
  /** §13.3 machine checklist context (saved Home machine), or null. */
  machineContext?: MonitorHomeMachineContext | null;
}) {
  const [intents, setIntents] = useState<PiAxisIntents>(NEUTRAL_AXIS_INTENTS);
  const [result, setResult] = useState<PiRecalculationView | null>(null);

  // The CURRENT recipe through the canonical engine (public entry point) —
  // presentation only; the §13 view model strips every number at source.
  const engineResult = useMemo<RecipeResult | null>(
    () => (recipeInput !== null ? calculateRecipe(recipeInput) : null),
    [recipeInput],
  );
  const home = useMemo(
    () => buildMonitorHomeView(engineResult, machineContext),
    [engineResult, machineContext],
  );

  const gate = evaluateRecalcGate(summary);
  // Interactive tuning is only offered where the canonical tuning path is
  // approved for the recipe's serving temperature (Track G honest availability).
  const tuningApproved =
    recipeInput === null ||
    isMonitorTuningApproved(recipeInput.category, recipeInput.target_temperature_c);
  const canRun = recipeInput !== null && gate.canRecalculate && tuningApproved;

  const recalc = () => {
    if (recipeInput === null) return;
    setResult(
      recalculateWithPi({
        baseIntent: piBaseIntentFromRecipe(recipeInput),
        recipeDraft: recipeInput,
        axisIntents: intents,
        resolution: summary,
        persona,
        tuningApproved,
        runner: realPiRecalculationRunner,
      }),
    );
  };

  return (
    <section className="mt-6 rounded-2xl border border-ink/10 bg-ink/[0.02] p-4">
      <p className="text-[12px] uppercase tracking-[0.14em] text-stone-500">{copy.monitor.label}</p>

      {/* The shared §13 readout (also mounted by the landing demo — Slice F). */}
      <MonitorHomeReadout home={home} />

      {/* §16 preference steering — stepped choices (never a numeric slider). */}
      <div className="mt-6">
        <p className="text-[17px] font-medium text-ink">{copy.monitor.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-500">{copy.monitor.lead}</p>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {MONITOR_HOME_TRAIT_ORDER.map((traitId) => {
          const axisId = MONITOR_HOME_TRAIT_AXIS[traitId];
          const labels = MONITOR_HOME_STEP_LABELS[traitId];
          const current = intents[axisId];
          return (
            <div key={traitId}>
              <p className="text-[14px] font-medium text-ink">
                {home.traits.find((t) => t.id === traitId)?.label}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {STEPS.map((step) => (
                  <SelectableCard
                    key={step}
                    title={labels[step]}
                    selected={current === step}
                    onSelect={() => {
                      setResult(null);
                      setIntents((prev) => ({ ...prev, [axisId]: step }));
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

      {/* Blocked by unresolved ingredients — status-risky tokens, readable text
          on the light surface (audit #26; never raw Tailwind ambers). */}
      {!gate.canRecalculate ? (
        <p className={`mt-3 rounded-xl px-4 py-3 text-[13px] leading-relaxed ${notice.risky} ${notice.text}`}>
          {gate.blockCopy}
        </p>
      ) : recipeInput !== null && !tuningApproved ? (
        /* Honest per-temperature availability (Track G): the recipe itself IS
           calculated — only the interactive tuning awaits approval. Calm note,
           never an error tone; the exact owner copy. */
        <p className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] leading-relaxed text-stone-600">
          {TUNING_NOT_APPROVED_COPY} Receptura nie została zmieniona.
        </p>
      ) : recipeInput === null ? (
        <p className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] leading-relaxed text-stone-600">
          {copy.monitor.needsCalculatedNote}
        </p>
      ) : result && result.ran ? (
        <div className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3">
          <p className="text-[14px] font-medium text-ink">{result.outcomeLabel}</p>
          {result.outcomeDetail ? (
            <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{result.outcomeDetail}</p>
          ) : null}
          {/* Exact gram adjustments — Home/Pro only (Demo payload carries none).
              Data readout, not decoration: primary ink + mono numerals. */}
          {gramsVisible && result.proposedAdjustments && result.proposedAdjustments.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12px] uppercase tracking-[0.12em] text-stone-500">{copy.monitor.adjustmentsTitle}</p>
              <ul className="mt-1 space-y-1">
                {result.proposedAdjustments.map((a, i) => (
                  <li key={`${a.ingredient}-${i}`} className="text-[13px] text-ink">
                    {a.ingredient}:{' '}
                    <span className="font-mono tabular-nums">
                      {a.grams > 0 ? '+' : ''}
                      {Math.round(a.grams)} {copy.device.unitGrams}
                    </span>
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
