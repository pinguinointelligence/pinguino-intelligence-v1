/**
 * §60 — `Przelicz i popraw` in HOME.
 *
 * This is a THIN control over the existing Recalculate → Preview → Apply workflow:
 * `runPiRecalculationWithTerminal` and `applyPreviewWithServerAuthority` are the exact
 * functions the Pro panel calls. HOME runs no optimizer of its own.
 *
 * §60 also says: do NOT auto-apply silently if PRO would not. So a staged preview is
 * always shown as an explicit choice here — HOME simplifies the WORDING, never the
 * consent. And "no verbose delta explanation" is why the panel shows the preview's own
 * `titlePl` and two buttons rather than a table of before/after numbers; the current
 * Score already sits at the top of the recipe.
 */
import { useState } from 'react';
import {
  applyPreviewWithServerAuthority,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homeCustomerNotice } from '../homeCustomerNotice';

export function HomeRecalculate() {
  const preview = useConstraintStudioStore((state) => state.preview);
  const previewIssue = useConstraintStudioStore((state) => state.previewIssue);
  const cancelPreview = useConstraintStudioStore((state) => state.cancelPreview);
  const [busy, setBusy] = useState(false);

  // Only some PreviewIssue variants carry a ready customer sentence. Narrowing on the
  // field rather than switching on every code keeps HOME from drifting out of step
  // when the pipeline gains a new refusal reason.
  // OWNER SERVED QA 2026-09-02: the pipeline's own sentence is written for the PRO
  // diagnosis view and can name ProductBehavior, the Mapper or a snapshot. HOME shows
  // it only when it is customer language; otherwise the calm sentence. The verdict is
  // untouched — a refusal is still a refusal.
  const issueMessage = homeCustomerNotice(
    previewIssue && 'messagePl' in previewIssue && typeof previewIssue.messagePl === 'string'
      ? previewIssue.messagePl
      : null,
  );

  const run = async () => {
    setBusy(true);
    try {
      await runPiRecalculationWithTerminal();
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      await applyPreviewWithServerAuthority();
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    return (
      <div
        className="mt-6 rounded-[12px] border p-4"
        data-testid="home-recalc-preview"
        style={{ borderColor: 'var(--g-line)', background: 'var(--g-attention-surface)' }}
      >
        {/* The preview's own title — HOME adds no second explanation of the change. */}
        <p className="text-[14px]" style={{ color: 'var(--g-attention-ink)' }}>
          {preview.titlePl}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy}
            data-testid="home-recalc-apply"
            className="min-h-[44px] flex-1 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ background: 'var(--g-ink)', color: '#ffffff' }}
          >
            {homeCreatorCopy.machine.done}
          </button>
          <button
            type="button"
            onClick={cancelPreview}
            disabled={busy}
            data-testid="home-recalc-cancel"
            className="min-h-[44px] rounded-full border px-4 text-[14px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
          >
            {homeCreatorCopy.draft.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6" data-testid="home-recalc">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        data-testid="home-recalc-run"
        className={cn(
          'min-h-[44px] w-full rounded-full border px-4 text-[14px]',
          'disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
        )}
        style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
      >
        {homeCreatorCopy.recipe.recalculate}
      </button>
      {/* An honest refusal from the existing pipeline is surfaced, not swallowed.
          HOME shows the issue's own Polish sentence where the pipeline provides one
          and otherwise stays silent about the DETAIL rather than inventing a reason —
          the full Pro diagnosis view is deliberately not reproduced here (§67: HOME
          users never see the technical dashboard). */}
      {issueMessage ? (
        <p
          className="mt-2 text-[12px]"
          data-testid="home-recalc-issue"
          style={{ color: 'var(--g-attention-ink)' }}
        >
          {issueMessage}
        </p>
      ) : null}
    </div>
  );
}
