/**
 * §20 history + Undo + Explain. PURE view (props only).
 *
 *  - one entry per APPLIED change (§20.1: kind, time, mode/temperature
 *    context with U+2212, configVersion trace kept on the record);
 *  - Undo for the newest entry only, and only while the working state still
 *    equals that entry's outcome (§20.3 — undo never destroys newer edits);
 *  - Explain („Dlaczego?”) renders the domain-built §20.4 entries through the
 *    Polish renderer — grams only, no band internals (§22).
 */
import { useState } from 'react';
import { constraintStudioCopy as copy, formatTemperaturePl } from '../constraintStudioCopy';
import { renderConstraintExplanationPl } from '../explainPl';
import type { AppliedChangeRecord } from '../applyPipeline';

function HistoryEntry({
  record,
  isLast,
  undoAvailable,
  onUndo,
}: {
  record: AppliedChangeRecord;
  isLast: boolean;
  undoAvailable: boolean;
  onUndo: () => void;
}) {
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <li className="rounded-md border border-ivory/10 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ivory">{record.titlePl}</span>
        <span className="font-mono text-[0.7rem] text-ivory/60 tabular-nums">
          {record.at.slice(11, 16)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ivory/65">
        {copy.history.contextLine(formatTemperaturePl(record.temperatureC))}
      </p>
      <p className="mt-0.5 text-xs text-ivory/65">
        {copy.history.outOfBand(record.violationsBefore, record.violationsAfter)}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {record.explanation.length > 0 ? (
          <button
            type="button"
            aria-expanded={explainOpen}
            onClick={() => setExplainOpen((open) => !open)}
            className="text-xs text-ivory/60 underline decoration-ivory/25 underline-offset-4 transition-colors hover:text-ivory"
          >
            {copy.history.explain}
          </button>
        ) : null}
        {isLast ? (
          <button
            type="button"
            disabled={!undoAvailable}
            title={undoAvailable ? undefined : copy.history.undoUnavailable}
            onClick={onUndo}
            className="rounded-md border border-ivory/20 px-2.5 py-1 text-xs font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-not-allowed disabled:border-ivory/10 disabled:text-ivory/60"
          >
            {copy.history.undo}
          </button>
        ) : null}
      </div>

      {explainOpen ? (
        <ul className="mt-2 space-y-1 border-t border-ivory/10 pt-2 text-xs leading-relaxed text-ivory/70">
          {record.explanation.map((entry, index) => (
            <li key={index}>{renderConstraintExplanationPl(entry)}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ConstraintHistoryPanel({
  history,
  undoAvailable,
  onUndo,
}: {
  history: readonly AppliedChangeRecord[];
  undoAvailable: boolean;
  onUndo: () => void;
}) {
  return (
    <section aria-label={copy.history.title} className="border-t border-ivory/10 pt-4">
      <p className="text-xs font-medium tracking-label text-ivory/65 uppercase">
        {copy.history.title}
      </p>
      {history.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ivory/60">{copy.history.empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {[...history].reverse().map((record, reversedIndex) => (
            <HistoryEntry
              key={record.id}
              record={record}
              isLast={reversedIndex === 0}
              undoAvailable={undoAvailable}
              onUndo={onUndo}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
