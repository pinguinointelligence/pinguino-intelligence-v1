/**
 * StarterDraftPreview — presentational starter-recipe preview (PL-first).
 *
 * Receives ONLY the tier-safe `StarterDraftDisplay` object (see
 * `redactStarterDraftForDisplay`): in Demo/Free the object physically lacks
 * gram amounts and any apply payload, so this component cannot leak either.
 * The "Zastosuj w Studio" action renders ONLY when the display carries an
 * apply payload (paid tier + `ready` status). Applying/undo is handled by the
 * parent shell — this component is stateless.
 */
import { STUDIO_FLOW_COPY } from './studioFlowCopy';
import type { StarterDraftDisplay } from './starterDraftDisplay';
import type { IntentRecipeDraftWarning } from './intentRecipeDraft';

const A = STUDIO_FLOW_COPY.pl.assistant;

const buttonCls =
  'inline-flex items-center justify-center rounded-md border border-ivory/20 px-3 py-1.5 text-[11px] font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-not-allowed disabled:opacity-40';

const round1 = (grams: number) => Math.round(grams * 10) / 10;

export type StarterApplyStage = 'idle' | 'confirming' | 'applied';

export interface StarterAppliedTrace {
  source: 'locked_starter_template';
  templateId: string | null;
}

export interface StarterDraftPreviewProps {
  display: StarterDraftDisplay;
  applyStage: StarterApplyStage;
  /** Honest source trace shown after an apply (state-held, console-free). */
  appliedTrace: StarterAppliedTrace | null;
  canUndo: boolean;
  onApplyRequest: () => void;
  onApplyConfirm: () => void;
  onApplyCancel: () => void;
  onUndoApply: () => void;
}

export function StarterDraftPreview({
  display,
  applyStage,
  appliedTrace,
  canUndo,
  onApplyRequest,
  onApplyConfirm,
  onApplyCancel,
  onUndoApply,
}: StarterDraftPreviewProps) {
  if (display.variant === 'unavailable') {
    return (
      <div className="space-y-1.5 rounded border border-ivory/10 bg-black/20 p-2.5">
        {display.status === 'needs_more_information' ? (
          <p className="text-[11px] leading-relaxed text-ivory/65">{A.starter.needsInfo}</p>
        ) : null}
        {display.status === 'not_supported' ? (
          <p className="text-[11px] leading-relaxed text-ivory/65">{A.starter.notSupported}</p>
        ) : null}
        {display.status === 'blocked' ? (
          <p className="text-[11px] leading-relaxed text-ivory/65">{A.incomplete}</p>
        ) : null}
      </div>
    );
  }

  const hasWarning = (code: IntentRecipeDraftWarning['code']) => display.warningCodes.includes(code);

  return (
    <div className="space-y-1.5 rounded border border-ivory/10 bg-black/20 p-2.5">
      <p className="text-sm font-medium text-ivory/90">{A.starter.readyTitle}</p>
      <p className="text-[11px] leading-relaxed text-ivory/65">{A.starter.readyBody}</p>

      {/* Exact grams + numeric metrics are paid-tier; the redacted variant
          carries the ingredient STRUCTURE only (never exact grams). */}
      {display.variant === 'exact' ? (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 font-mono text-[11px] text-ivory/60">
            {display.lines.map((line) => (
              <div key={line.id} className="contents">
                <dt className="text-ivory/65">{line.name}</dt>
                <dd className="text-right">{round1(line.grams)} g</dd>
              </div>
            ))}
          </dl>
          {display.enginePreview ? (
            <p className="font-mono text-[10px] leading-relaxed text-ivory/60">
              {`silnik CONFIG ${display.enginePreview.configVersion} · npac ${
                display.enginePreview.npacPoints?.toFixed(1) ?? '—'
              } · pod ${display.enginePreview.podPoints?.toFixed(1) ?? '—'} · lód ${
                display.enginePreview.iceFractionPercent?.toFixed(1) ?? '—'
              }%`}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <ul className="font-mono text-[11px] text-ivory/65">
            {display.lines.map((line) => (
              <li key={line.id}>· {line.name}</li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-ivory/60">{A.demoGramsNote}</p>
        </>
      )}

      {/* Qualitative direction is safe in every tier. */}
      {display.inBand ? (
        <p className="text-[11px] leading-relaxed text-emerald-300/70">{A.starter.inBand}</p>
      ) : null}
      {hasWarning('optimization_recommended') ? (
        <p className="text-[11px] leading-relaxed text-ivory/65">{A.starter.optimizationRecommended}</p>
      ) : null}
      {hasWarning('flavor_manual_mapping_required') ? (
        <p className="text-[11px] leading-relaxed text-ivory/65">{A.starter.flavorManual}</p>
      ) : null}
      <p className="text-[10px] leading-relaxed text-ivory/60">{A.starter.notSavedNote}</p>

      {/* Local Apply to Studio — renders ONLY when the display carries the
          payload (paid tier, ready status). Explicit click; replacement asks
          for confirmation; ONE undo snapshot; nothing is ever saved. */}
      {display.applyPayload !== null ? (
        <div className="space-y-1.5 border-t border-ivory/10 pt-1.5">
          {applyStage === 'confirming' ? (
            <>
              <p className="text-xs font-medium text-ivory/80">{A.starter.apply.replaceWarningTitle}</p>
              <p className="text-[11px] leading-relaxed text-ivory/65">{A.starter.apply.replaceWarningBody}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={onApplyConfirm} className={buttonCls}>
                  {A.starter.apply.confirmCta}
                </button>
                <button type="button" onClick={onApplyCancel} className={buttonCls}>
                  {A.starter.apply.cancelCta}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] leading-relaxed text-ivory/60">{A.starter.apply.setsNote}</p>
              <button type="button" onClick={onApplyRequest} className={buttonCls}>
                {A.starter.apply.cta}
              </button>
            </>
          )}
          {applyStage === 'applied' ? (
            <>
              <p className="text-[11px] leading-relaxed text-emerald-300/70">{A.starter.apply.appliedNote}</p>
              {appliedTrace ? (
                <p className="font-mono text-[10px] leading-relaxed text-ivory/60">
                  {`${A.starter.apply.appliedSourceLabel}: ${appliedTrace.source} · ${appliedTrace.templateId ?? '—'}`}
                </p>
              ) : null}
              {canUndo ? (
                <button type="button" onClick={onUndoApply} className={buttonCls}>
                  {A.starter.apply.undoCta}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
