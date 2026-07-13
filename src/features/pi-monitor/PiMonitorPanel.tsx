/**
 * PINGÜINO PI Recipe Monitor — presentational panel.
 *
 * Pure presentational component (renderToStaticMarkup-safe): it renders the four
 * customer axes vs the golden range, the STEPPED per-axis choices, the
 * `Przelicz z PI` action, and the LOCAL Przed/Po preview with Zastosuj zmiany /
 * Cofnij / Dostosuj ponownie. It owns NO state and performs NO recalculation —
 * all data comes from the pure core via props, all actions via callbacks. Demo
 * personas receive no numeric detail in the data, so none can be rendered.
 */
import { axisStepLabels } from './piMonitorAxes';
import {
  PI_AXIS_ORDER,
  type AxisBandPosition,
  type AxisIntentStep,
  type PiAxisId,
  type PiAxisIntents,
  type PiAxisReading,
} from './piMonitorContracts';
import type { PiRecalcGate, PiRecalculationView } from './piMonitor';

const STEP_ORDER: readonly AxisIntentStep[] = ['decrease', 'keep', 'increase'];

const POSITION_TONE: Record<AxisBandPosition, string> = {
  w_zakresie: 'bg-emerald-500/15 text-emerald-300',
  ponizej_zakresu: 'bg-amber-500/15 text-amber-300',
  powyzej_zakresu: 'bg-amber-500/15 text-amber-300',
};

const OUTCOME_TONE: Record<string, string> = {
  poprawione: 'bg-emerald-500/15 text-emerald-300',
  juz_w_zakresie: 'bg-emerald-500/15 text-emerald-300',
  kompromis: 'bg-amber-500/15 text-amber-300',
  niemozliwe: 'bg-rose-500/15 text-rose-300',
  zablokowane: 'bg-rose-500/15 text-rose-300',
};

function DirectionPill({ reading }: { reading: PiAxisReading }) {
  const tone = reading.position ? POSITION_TONE[reading.position] : 'bg-ivory/10 text-ivory/60';
  const grams =
    reading.value !== undefined && reading.band
      ? ` · ${reading.value.toFixed(1)} (zakres ${reading.band[0]}–${reading.band[1]})`
      : '';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone}`}>
      {reading.directionCopy}
      {grams}
    </span>
  );
}

interface AxisControlRowProps {
  reading: PiAxisReading;
  step: AxisIntentStep;
  onIntentChange?: (axis: PiAxisId, step: AxisIntentStep) => void;
}

function AxisControlRow({ reading, step, onIntentChange }: AxisControlRowProps) {
  const labels = axisStepLabels(reading.id);
  return (
    <div className="rounded-lg border border-ivory/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ivory">{reading.label}</p>
        <DirectionPill reading={reading} />
      </div>
      {reading.applicable ? (
        <div className="mt-2 flex gap-2" role="group" aria-label={`Dostosuj: ${reading.label}`}>
          {STEP_ORDER.map((s) => {
            const active = s === step;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={onIntentChange ? () => onIntentChange(reading.id, s) : undefined}
                className={`rounded-full px-3 py-1 text-[12px] transition ${
                  active ? 'bg-ivory text-[#1a1a1a]' : 'bg-ivory/10 text-ivory/70 hover:bg-ivory/20'
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ivory/40">Ten wskaźnik nie dotyczy tego produktu.</p>
      )}
    </div>
  );
}

function PrzedPoRow({ before, after }: { before: PiAxisReading; after: PiAxisReading | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-ivory/10 py-2">
      <span className="text-[12px] text-ivory/60">{before.label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[11px] text-ivory/40">Przed:</span>
        <DirectionPill reading={before} />
        {after ? (
          <>
            <span className="text-ivory/30">→</span>
            <span className="text-[11px] text-ivory/40">Po zmianie:</span>
            <DirectionPill reading={after} />
          </>
        ) : null}
      </span>
    </div>
  );
}

export interface PiMonitorPanelProps {
  /** Current recipe mapped onto the four axes (persona-redacted). */
  monitor: PiAxisReading[];
  axisIntents: PiAxisIntents;
  gate: PiRecalcGate;
  /** The LOCAL recalculation preview, or null before `Przelicz z PI`. */
  result: PiRecalculationView | null;
  /** True once `Zastosuj zmiany` swapped the local draft. */
  applied?: boolean;
  onIntentChange?: (axis: PiAxisId, step: AxisIntentStep) => void;
  onRecalculate?: () => void;
  onApply?: () => void;
  onUndo?: () => void;
  onReadjust?: () => void;
}

export function PiMonitorPanel({
  monitor,
  axisIntents,
  gate,
  result,
  applied,
  onIntentChange,
  onRecalculate,
  onApply,
  onUndo,
  onReadjust,
}: PiMonitorPanelProps) {
  const byId = (list: PiAxisReading[] | null | undefined, id: PiAxisId) => list?.find((r) => r.id === id);

  return (
    <section className="rounded-2xl border border-ivory/10 bg-[#1a1a1a] p-5 text-ivory">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ivory/40">Monitor PI</p>
        <h2 className="mt-1 text-lg font-light">Gdzie jest Twoja receptura względem zakresu</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ivory/50">
          PI pokazuje kierunek receptury na czterech cechach. Wybierz, co chcesz zmienić, a potem naciśnij
          „Przelicz z PI”. Podgląd jest lokalny — nic nie zostaje zapisane.
        </p>
      </header>

      <div className="mt-4 space-y-2">
        {PI_AXIS_ORDER.map((id) => {
          const reading = byId(monitor, id);
          if (!reading) return null;
          return (
            <AxisControlRow
              key={id}
              reading={reading}
              step={axisIntents[id]}
              onIntentChange={onIntentChange}
            />
          );
        })}
      </div>

      {!gate.canRecalculate && gate.blockCopy ? (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          {gate.blockCopy}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          disabled={!gate.canRecalculate}
          onClick={gate.canRecalculate && onRecalculate ? onRecalculate : undefined}
          className={`rounded-full px-5 py-2 text-sm transition ${
            gate.canRecalculate
              ? 'bg-ivory text-[#1a1a1a] hover:bg-ivory/90'
              : 'cursor-not-allowed bg-ivory/10 text-ivory/40'
          }`}
        >
          Przelicz z PI
        </button>
      </div>

      {result && result.ran ? (
        <div className="mt-5 rounded-xl border border-ivory/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ivory">Podgląd zmiany</p>
            {result.outcome ? (
              <span className={`rounded px-2 py-0.5 text-[12px] ${OUTCOME_TONE[result.outcome] ?? 'bg-ivory/10 text-ivory/70'}`}>
                {result.outcomeLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ivory/60">{result.outcomeDetail}</p>

          <div className="mt-3">
            {PI_AXIS_ORDER.map((id) => {
              const before = byId(result.before, id);
              if (!before) return null;
              return <PrzedPoRow key={id} before={before} after={byId(result.after, id)} />;
            })}
          </div>

          {result.gramsVisible && result.proposedAdjustments && result.proposedAdjustments.length ? (
            <div className="mt-3 border-t border-ivory/10 pt-3 text-[12px] text-ivory/60">
              <p className="text-ivory/40">Zmiany dawek (dokładne gramy):</p>
              <ul className="mt-1 space-y-0.5">
                {result.proposedAdjustments.map((a, i) => (
                  <li key={i} className="font-mono text-[11px] text-sky-300/80">
                    {a.type} {a.ingredient} {a.grams.toFixed(1)} g
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {applied ? (
            <p className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-200">
              Zastosowano zmiany lokalnie. Nic nie zostało zapisane.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApply}
              disabled={!result.after}
              className={`rounded-full px-4 py-1.5 text-[13px] transition ${
                result.after ? 'bg-emerald-400/90 text-[#1a1a1a] hover:bg-emerald-400' : 'cursor-not-allowed bg-ivory/10 text-ivory/40'
              }`}
            >
              Zastosuj zmiany
            </button>
            <button
              type="button"
              onClick={onUndo}
              className="rounded-full bg-ivory/10 px-4 py-1.5 text-[13px] text-ivory/70 transition hover:bg-ivory/20"
            >
              Cofnij
            </button>
            <button
              type="button"
              onClick={onReadjust}
              className="rounded-full bg-ivory/10 px-4 py-1.5 text-[13px] text-ivory/70 transition hover:bg-ivory/20"
            >
              Dostosuj ponownie
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
