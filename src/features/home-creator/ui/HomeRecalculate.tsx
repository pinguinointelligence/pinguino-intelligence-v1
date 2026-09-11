/**
 * §60 — `Przelicz i popraw` in HOME.
 *
 * This is a THIN control over the existing Recalculate → Preview → Apply workflow:
 * `runPiRecalculationWithTerminal` and `applyPreviewWithServerAuthority` are the exact
 * functions the Pro panel calls. HOME runs no optimizer of its own.
 *
 * §60 also says: do NOT auto-apply silently if PRO would not. So a staged preview is
 * always shown as an explicit choice here — HOME simplifies the WORDING, never the
 * consent.
 *
 * OWNER 2026-09-11 (INTERACTIVE RECALCULATION PREVIEW + CONFLICT RESOLUTION, part C):
 * HOME gets the SAME interaction pattern as PRO, in ONE modal. The preview now shows
 * every change before anything is applied — including strong reductions of lines that
 * are not the Crown — and each proposed amount is the same grams control + padlock as
 * the recipe. Changing one turns „Zastosuj zmiany" into „Przelicz"; a lock conflict
 * gets the smallest proven correction („Użyj propozycji") in simpler words. The
 * recipe is written only by „Zastosuj zmiany", through the one Apply door; X / Wróć
 * discards everything provisional. HOME's own Crown rules are untouched: nothing here
 * crowns, uncrowns or seeds a line.
 */
import { useMemo, useState } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import {
  applyPreviewWithServerAuthority,
  cancelPiRecalculation,
  runInteractiveRecalculationWithTerminal,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import {
  isPreviewEditableLine,
  type PreviewLineInstruction,
} from '@/features/constraint-studio/previewInstructions';
import {
  ConstraintPreviewCard,
  type GramsMask,
} from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import { LockConflictPanel } from '@/features/constraint-studio/ui/LockConflictPanel';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homeCustomerNotice } from '../homeCustomerNotice';

const interactiveCopy = constraintStudioCopy.interactive;

const secondaryButton =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 text-[14px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';
const primaryButton =
  'inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full px-4 text-[14px] font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

export function HomeRecalculate({
  canSeeGrams = true,
  onGramsBlocked,
}: {
  /** Demo entitlement: HOME never reveals grams the customer may not see. */
  canSeeGrams?: boolean;
  onGramsBlocked?: () => void;
}) {
  const preview = useConstraintStudioStore((state) => state.preview);
  const previewIssue = useConstraintStudioStore((state) => state.previewIssue);
  const lockConflict = useConstraintStudioStore((state) => state.lockConflict);
  const pendingInstructionCommit = useConstraintStudioStore(
    (state) => state.pendingInstructionCommit,
  );
  const directionBestCandidate = useConstraintStudioStore((state) => state.directionBestCandidate);
  const terminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const blocked = useConstraintStudioStore((state) => state.blocked);
  const applyPending = useConstraintStudioStore((state) => state.applyPending);
  const items = useRecipeStore((state) => state.items);
  const [open, setOpen] = useState(false);

  const editableLineIds = useMemo(
    () => new Set(items.filter(isPreviewEditableLine).map((item) => item.id)),
    [items],
  );
  const gramsMask: GramsMask | undefined = canSeeGrams
    ? undefined
    : {
        text: homeCreatorCopy.recipe.maskedGrams,
        controlValue: homeCreatorCopy.recipe.maskedGramsValue,
        label: homeCreatorCopy.recipe.maskedGramsLabel,
        onInteract: () => onGramsBlocked?.(),
      };

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

  const close = () => {
    if (useConstraintStudioStore.getState().recalculationTerminal?.state === 'WORKING') {
      cancelPiRecalculation();
    }
    // Nothing provisional survives: the recipe was never written.
    useConstraintStudioStore.getState().cancelPreview();
    setOpen(false);
  };

  const run = () => {
    setOpen(true);
    void runPiRecalculationWithTerminal();
  };

  const recalculateInPreview = (instructions: PreviewLineInstruction[]) => {
    void runInteractiveRecalculationWithTerminal(instructions);
  };

  const apply = () => {
    void (async () => {
      await applyPreviewWithServerAuthority();
      const after = useConstraintStudioStore.getState();
      if (after.preview === null && after.blocked === null && after.postApplyNotice === null) {
        setOpen(false);
      }
    })();
  };

  const working = terminal?.state === 'WORKING';
  const previewOpen = !working && preview !== null && terminal?.state === 'PREVIEW_READY';
  const conflictOpen = !working && preview === null && lockConflict !== null;
  const directionChoiceOpen =
    !working &&
    preview === null &&
    directionBestCandidate !== null &&
    terminal?.state === 'PREVIEW_READY';
  const noChange =
    !working &&
    preview === null &&
    pendingInstructionCommit === null &&
    terminal?.state === 'NO_CHANGE_NEEDED';
  const recoverable = terminal?.state === 'TIMEOUT' || terminal?.state === 'ERROR';
  const blockedMessage = blocked ? homeCustomerNotice(blocked.messagePl) : null;
  const refusalOpen =
    !working &&
    !previewOpen &&
    !conflictOpen &&
    !directionChoiceOpen &&
    !noChange &&
    pendingInstructionCommit === null &&
    !recoverable;

  return (
    <div className="mt-6" data-testid="home-recalc">
      <button
        type="button"
        onClick={run}
        disabled={open && working}
        data-testid="home-recalc-run"
        className={cn(
          'min-h-[44px] w-full rounded-full border px-4 text-[14px]',
          'disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
        )}
        style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
      >
        {homeCreatorCopy.recipe.recalculate}
      </button>

      {open ? (
        <DialogShell
          label={homeCreatorCopy.recipe.recalculate}
          testId="home-recalc-dialog"
          panelTestId="home-recalc-panel"
          panelState={terminal?.state ?? 'IDLE'}
          placement="center"
          size={previewOpen || conflictOpen ? 'wide' : 'default'}
          onClose={close}
          showCloseControl
          closeLabel={working ? homeCreatorCopy.draft.cancel : interactiveCopy.back}
          closeTestId="home-recalc-close"
          panelClassName="max-h-[92dvh] px-3 py-3 text-black [--color-charcoal:#191a1d] [--color-ivory:#202124] [--color-shell:#f5f3ee] [color-scheme:light] sm:max-h-[88vh] sm:px-4 sm:py-4"
        >
          <div className="space-y-3 pt-8 sm:pt-6">
            {working ? (
              <p className="text-[14px] leading-relaxed" data-testid="home-recalc-working">
                {interactiveCopy.working}
              </p>
            ) : null}

            {previewOpen && preview ? (
              <div data-testid="home-recalc-preview">
                <ConstraintPreviewCard
                  preview={preview}
                  applyPending={applyPending}
                  gramsMask={gramsMask}
                  interactive={{
                    instructions: preview.previewInstructions?.lines ?? [],
                    editableLineIds,
                    onRecalculate: recalculateInPreview,
                  }}
                  onApply={apply}
                  onCancel={close}
                />
              </div>
            ) : null}

            {conflictOpen && lockConflict ? (
              <LockConflictPanel
                conflict={lockConflict}
                surface="home"
                gramsMask={gramsMask}
                onRecalculate={recalculateInPreview}
                onBack={close}
              />
            ) : null}

            {directionChoiceOpen ? (
              <div className="space-y-3" data-testid="home-recalc-direction-best">
                <p className="text-[14px] leading-relaxed">
                  {constraintStudioCopy.previewIssue.bestSafeResult}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryButton}
                    style={{ background: 'var(--g-ink)', color: '#ffffff' }}
                    onClick={() =>
                      useConstraintStudioStore.getState().acceptBestDirectionCandidate()
                    }
                  >
                    {constraintStudioCopy.preview.title}
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
                    onClick={close}
                  >
                    {interactiveCopy.back}
                  </button>
                </div>
              </div>
            ) : null}

            {!working && pendingInstructionCommit !== null && preview === null ? (
              <div className="space-y-3" data-testid="home-recalc-instructions-only">
                <p className="text-[14px] leading-relaxed">{interactiveCopy.instructionsOnly}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryButton}
                    style={{ background: 'var(--g-ink)', color: '#ffffff' }}
                    data-testid="home-recalc-commit-instructions"
                    onClick={() => {
                      useConstraintStudioStore.getState().commitPendingInstructions();
                      setOpen(false);
                    }}
                  >
                    {interactiveCopy.apply}
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
                    onClick={close}
                  >
                    {interactiveCopy.back}
                  </button>
                </div>
              </div>
            ) : null}

            {noChange ? (
              <div className="space-y-3" data-testid="home-recalc-no-change">
                <p className="text-[14px] leading-relaxed">
                  {constraintStudioCopy.previewIssue.alreadyClean}
                </p>
                <button
                  type="button"
                  className={secondaryButton}
                  style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
                  onClick={close}
                >
                  {interactiveCopy.back}
                </button>
              </div>
            ) : null}

            {!working && recoverable ? (
              <div className="space-y-3" data-testid="home-recalc-recoverable" role="alert">
                <p className="text-[14px] leading-relaxed">
                  {homeCustomerNotice(terminal.messagePl) ?? terminal.messagePl}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryButton}
                    style={{ background: 'var(--g-ink)', color: '#ffffff' }}
                    data-testid="home-recalc-retry"
                    onClick={() => void runPiRecalculationWithTerminal()}
                  >
                    {homeCreatorCopy.recipe.recalculate}
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
                    onClick={close}
                  >
                    {interactiveCopy.back}
                  </button>
                </div>
              </div>
            ) : null}

            {refusalOpen ? (
              // An honest refusal from the existing pipeline is surfaced, not swallowed.
              // HOME shows the issue's own Polish sentence where the pipeline provides one
              // and otherwise stays calm about the DETAIL rather than inventing a reason —
              // the full Pro diagnosis view is deliberately not reproduced here (§67:
              // HOME users never see the technical dashboard).
              <div className="space-y-3" data-testid="home-recalc-refusal">
                {blockedMessage || issueMessage ? (
                  <p
                    className="text-[14px] leading-relaxed"
                    data-testid="home-recalc-issue"
                    style={{ color: 'var(--g-attention-ink)' }}
                  >
                    {blockedMessage ?? issueMessage}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={secondaryButton}
                  style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
                  data-testid="home-recalc-back"
                  onClick={close}
                >
                  {interactiveCopy.back}
                </button>
              </div>
            ) : null}
          </div>
        </DialogShell>
      ) : null}
    </div>
  );
}
