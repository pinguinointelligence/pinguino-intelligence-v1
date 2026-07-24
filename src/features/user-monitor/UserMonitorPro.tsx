/**
 * PINGÜINO User Monitor — Monitor Pro panel (SPEC §14, UIUX Slice D).
 *
 * The modular, configurable Pro monitor: six §14.1 summary cards, the §14.2
 * collapsible modules with §14.4 friendly names, and the §14.3 „Dostosuj widok"
 * layer backed by `UserMonitorLayout` (toggle modules, pin metrics to the
 * overview, reorder pins, reset; persisted per device — the per-user server
 * entity is launch-gated backend work).
 *
 * SCOPED CONTRAST PANEL (owner §21.1 decision): Monitor Pro MAY be a darker
 * panel inside the light app. This component is self-scoped — it renders on the
 * existing `CharcoalPanel` primitive with explicit ivory-tier classes, so it
 * stays the sanctioned dark contrast block regardless of the page theme (no
 * global dark styles, no `customerDarkVars` revival).
 *
 * Data honesty: everything shown is an already-computed `RecipeResult` field;
 * Złoty Zakres readings reuse the recipe-score `bandPosition` vocabulary
 * (§15.3 — every state carries TEXT). Values are display-rounded here only.
 * Calibration/fallback provenance is surfaced, never hidden (skill rule),
 * reusing the pi-panel `indicatorView` builders.
 */
import { useMemo, useState } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import type { RecipeResult, TargetMetric } from '@/engine';
import { formatTemperatureC } from '@/features/customer-shell/temperature';
import { buildFallbackNotes, buildWarnings } from '@/features/pi-panel/indicatorView';
import type { GoldenRangeReading } from '@/features/recipe-score';
import {
  deriveMonitorStatusLine,
  deriveRecipeDataConfidence,
  deriveRecipeReadiness,
} from './recipeIndicatorStatuses';
import {
  loadUserMonitorLayout,
  movePinned,
  pinMetric,
  resetUserMonitorLayout,
  saveUserMonitorLayout,
  toggleModule,
  unpinMetric,
  USER_MONITOR_MODULE_ORDER,
  type UserMonitorLayout,
  type UserMonitorModuleId,
} from './userMonitorLayout';
import {
  buildUserMonitorModules,
  buildUserMonitorSummaryCards,
  USER_MONITOR_MODULE_TITLES,
  type UserMonitorRow,
} from './userMonitorModules';

export const USER_MONITOR_TITLE = 'Monitor Pro';
export const CUSTOMIZE_VIEW_LABEL = 'Dostosuj widok';
export const PINNED_SECTION_LABEL = 'Przypięte';
export const RESET_LAYOUT_LABEL = 'Przywróć domyślny układ';

/* ------------------------------------------------------------------ *
 * Złoty Zakres text tones on the charcoal panel (§15.3 — text first)  *
 * ------------------------------------------------------------------ */

const READING_TONE: Record<GoldenRangeReading['state'], string> = {
  golden: 'text-gold-soft font-medium',
  info: 'text-ivory/70',
  amber: 'text-status-risky',
  red: 'text-status-error',
  neutral: 'text-ivory/60',
};

/** Display-only rounding (engine precision untouched). */
const formatValue = (value: number): string =>
  (Math.round(value * 10) / 10).toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

function RowLine({
  row,
  pinned,
  onPin,
  onUnpin,
  onMove,
}: {
  row: UserMonitorRow;
  pinned: boolean;
  onPin?: (metric: TargetMetric) => void;
  onUnpin?: (metric: TargetMetric) => void;
  onMove?: (metric: TargetMetric, direction: 'up' | 'down') => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-ivory/10 py-2 first:border-t-0">
      <span className="text-[13px] text-ivory/70" title={row.expertTerm ?? undefined}>
        {row.label}
      </span>
      <span className="flex items-center gap-2.5">
        {row.value === null ? (
          <span className="font-mono text-[13px] text-ivory/60">—</span>
        ) : (
          <span className="font-mono text-[13px] font-medium tabular-nums text-ivory">
            {formatValue(row.value)}
            {row.unit ? <span className="ml-0.5 font-normal text-ivory/65">{row.unit}</span> : null}
          </span>
        )}
        {row.reading ? (
          <span className={`text-[12px] ${READING_TONE[row.reading.state]}`}>{row.reading.text}</span>
        ) : null}
        {row.metric !== null && onPin && !pinned ? (
          <button
            type="button"
            onClick={() => onPin(row.metric as TargetMetric)}
            aria-label={`Przypnij: ${row.label}`}
            className="rounded border border-ivory/20 px-1.5 py-0.5 text-[11px] text-ivory/60 transition-colors hover:border-ivory/50 hover:text-ivory"
          >
            Przypnij
          </button>
        ) : null}
        {row.metric !== null && pinned && onUnpin && onMove ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(row.metric as TargetMetric, 'up')}
              aria-label={`Przesuń wyżej: ${row.label}`}
              className="rounded border border-ivory/20 px-1.5 py-0.5 text-[11px] text-ivory/60 transition-colors hover:border-ivory/50 hover:text-ivory"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove(row.metric as TargetMetric, 'down')}
              aria-label={`Przesuń niżej: ${row.label}`}
              className="rounded border border-ivory/20 px-1.5 py-0.5 text-[11px] text-ivory/60 transition-colors hover:border-ivory/50 hover:text-ivory"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => onUnpin(row.metric as TargetMetric)}
              aria-label={`Odepnij: ${row.label}`}
              className="rounded border border-ivory/20 px-1.5 py-0.5 text-[11px] text-ivory/60 transition-colors hover:border-ivory/50 hover:text-ivory"
            >
              Odepnij
            </button>
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function UserMonitorPro({
  result,
  servingTemperatureC,
}: {
  result: RecipeResult;
  servingTemperatureC: number;
}) {
  const [layout, setLayout] = useState<UserMonitorLayout>(() => loadUserMonitorLayout());
  const apply = (next: UserMonitorLayout) => {
    setLayout(next);
    saveUserMonitorLayout(next);
  };

  const modules = useMemo(
    () => buildUserMonitorModules(result, servingTemperatureC),
    [result, servingTemperatureC],
  );
  const cards = useMemo(() => buildUserMonitorSummaryCards(result), [result]);
  const confidence = useMemo(() => deriveRecipeDataConfidence(result), [result]);
  const readiness = useMemo(() => deriveRecipeReadiness(result), [result]);
  const statusLine = useMemo(() => deriveMonitorStatusLine(result), [result]);
  const fallbackNotes = useMemo(() => buildFallbackNotes(result), [result]);
  const warnings = useMemo(() => buildWarnings(result), [result]);

  // Pinned overview rows — first module occurrence of each pinned metric,
  // in the USER'S pin order (§14.3).
  const pinnedRows = useMemo(() => {
    const byMetric = new Map<TargetMetric, UserMonitorRow>();
    for (const module of modules) {
      for (const row of module.rows) {
        if (row.metric !== null && !byMetric.has(row.metric)) byMetric.set(row.metric, row);
      }
    }
    return layout.pinned
      .map((metric) => byMetric.get(metric))
      .filter((row): row is UserMonitorRow => row !== undefined);
  }, [modules, layout.pinned]);

  if (result.total_batch_g <= 0) {
    return (
      <CharcoalPanel padding="lg">
        <SectionLabel tone="ivory">{USER_MONITOR_TITLE}</SectionLabel>
        <p className="mt-4 text-sm leading-relaxed text-ivory-soft">
          Dodaj składniki, aby zobaczyć pełny Monitor receptury.
        </p>
      </CharcoalPanel>
    );
  }

  const onPin = (metric: TargetMetric) => apply(pinMetric(layout, metric));
  const onUnpin = (metric: TargetMetric) => apply(unpinMetric(layout, metric));
  const onMove = (metric: TargetMetric, direction: 'up' | 'down') =>
    apply(movePinned(layout, metric, direction));

  return (
    <CharcoalPanel padding="lg">
      <div className="flex items-center justify-between gap-4">
        <SectionLabel tone="ivory">{USER_MONITOR_TITLE}</SectionLabel>
        {/* §14.1 status: gotowa / wymaga korekty / test rekomendowany. */}
        <span className="rounded border border-ivory/25 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/70 uppercase">
          {statusLine.text}
        </span>
      </div>

      {/* Serving temperature (§14.1) — a label, never conflated with storage;
          the ONE temperature formatter (audit #27, typographic minus). */}
      <p className="mt-3 text-[12px] text-ivory/65">
        Temperatura serwowania:{' '}
        <span className="font-mono tabular-nums text-ivory">
          {formatTemperatureC(servingTemperatureC)}
        </span>
      </p>

      {/* §20.5 — three indicators, never conflated: the 1–10 Dopasowanie lives
          in the score card above; here the TWO TEXT statuses (no numbers). */}
      <div className="mt-4 space-y-1.5 border-t border-ivory/10 pt-4">
        <p className="text-[12px] leading-relaxed text-ivory/70">
          <span className="text-ivory/65">{confidence.name}:</span> {confidence.text}
        </p>
        <p className="text-[12px] leading-relaxed text-ivory/70">
          <span className="text-ivory/65">{readiness.name}:</span> {readiness.readiness.label} —{' '}
          {readiness.readiness.text}
        </p>
        <p className="text-[11px] leading-relaxed text-ivory/60">{confidence.disclaimer}</p>
      </div>

      {/* Pinned overview (§14.3). */}
      {pinnedRows.length > 0 ? (
        <div className="mt-5 border-t border-ivory/10 pt-4">
          <p className="text-[0.625rem] font-medium tracking-label text-ivory/65 uppercase">
            {PINNED_SECTION_LABEL}
          </p>
          <div className="mt-1">
            {pinnedRows.map((row) => (
              <RowLine key={row.key} row={row} pinned onUnpin={onUnpin} onMove={onMove} onPin={onPin} />
            ))}
          </div>
        </div>
      ) : null}

      {/* §14.1 — six summary cards, each expandable to its §14.4-named rows. */}
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-ivory/10 pt-4">
        {cards.map((card) => (
          <details key={card.id} className="rounded-md border border-ivory/10 bg-black/20 px-3 py-2.5">
            <summary className="cursor-pointer list-none">
              <span className="block text-[13px] text-ivory">{card.label}</span>
              <span className={`mt-0.5 block text-[11px] leading-snug ${READING_TONE[card.reading.state]}`}>
                {card.reading.text}
              </span>
            </summary>
            <div className="mt-2">
              {card.rows.map((row) => (
                <RowLine
                  key={row.key}
                  row={row}
                  pinned={row.metric !== null && layout.pinned.includes(row.metric)}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onMove={onMove}
                />
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* §14.2 — collapsible modules (visibility per UserMonitorLayout). */}
      <div className="mt-5 space-y-2 border-t border-ivory/10 pt-4">
        {modules
          .filter((module) => layout.enabled[module.id])
          .map((module) => (
            <details key={module.id} className="rounded-md border border-ivory/10 bg-black/20 px-3 py-2.5">
              <summary className="cursor-pointer list-none text-[13px] text-ivory">{module.title}</summary>
              <div className="mt-2">
                {module.rows.map((row) => (
                  <RowLine
                    key={row.key}
                    row={row}
                    pinned={row.metric !== null && layout.pinned.includes(row.metric)}
                    onPin={onPin}
                    onUnpin={onUnpin}
                    onMove={onMove}
                  />
                ))}
                {module.id === 'expert' ? (
                  <p className="mt-2 text-[11px] text-ivory/60">
                    Wersja silnika {result.engine_version} · konfiguracja {result.config_version}
                  </p>
                ) : null}
              </div>
            </details>
          ))}
      </div>

      {/* §14.3 — Dostosuj widok: module toggles + reset. */}
      <details className="mt-5 border-t border-ivory/10 pt-4">
        <summary className="cursor-pointer list-none text-[12px] font-medium tracking-[0.08em] text-ivory/60 uppercase">
          {CUSTOMIZE_VIEW_LABEL}
        </summary>
        <div className="mt-3 space-y-2">
          {USER_MONITOR_MODULE_ORDER.map((id: UserMonitorModuleId) => (
            <label key={id} className="flex items-center gap-2 text-[13px] text-ivory/70">
              <input
                type="checkbox"
                checked={layout.enabled[id]}
                onChange={() => apply(toggleModule(layout, id))}
                className="size-4 accent-ivory"
              />
              {USER_MONITOR_MODULE_TITLES[id]}
            </label>
          ))}
          <button
            type="button"
            onClick={() => apply(resetUserMonitorLayout())}
            className="mt-2 rounded-md border border-ivory/20 px-3 py-1.5 text-[12px] text-ivory/70 transition-colors hover:border-ivory/50 hover:text-ivory"
          >
            {RESET_LAYOUT_LABEL}
          </button>
          <p className="text-[11px] leading-relaxed text-ivory/60">
            Układ zapisuje się na tym urządzeniu.
          </p>
        </div>
      </details>

      {/* Calibration honesty + engine warnings (never hidden). */}
      {fallbackNotes.length > 0 ? (
        <div className="mt-4 rounded-md border border-ivory/15 bg-ivory/[0.06] px-3 py-2.5">
          {fallbackNotes.map((note) => (
            <p key={note} className="text-[11px] leading-relaxed text-ivory/60">
              {note}
            </p>
          ))}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning.code}
              className={`text-[11px] leading-relaxed ${
                warning.severity === 'critical'
                  ? 'text-status-error'
                  : warning.severity === 'warning'
                    ? 'text-status-risky'
                    : 'text-ivory/65'
              }`}
            >
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </CharcoalPanel>
  );
}
