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
import { useEffect, useMemo, useRef } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import {
  applyPreviewWithServerAuthority,
  cancelPiRecalculation,
  openDirectionFallbackPreviewWithServerAuthority,
  openStarterPackRescuePreviewWithServerAuthority,
  requestStarterPackRescueWithServerAuthority,
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
import { DirectionFallbackDecision } from '@/features/pro-core/ProRecalcPanel';
import { useRecipeStore } from '@/stores/recipeStore';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { customerInstructions } from '../homePriorityBootstrap';
import { runHomeRecalculation } from '../homeRecalculation';
import { homeCustomerNotice } from '../homeCustomerNotice';
import { homeRecalcRefusal } from '../homeRecalcRefusal';

const interactiveCopy = constraintStudioCopy.interactive;

const secondaryButton =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 text-[14px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';
const primaryButton =
  'inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full px-4 text-[14px] font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

/** What „continue” means in each context when CORE found nothing to change. */
const NO_CHANGE_CONTINUE: Readonly<
  Record<'make' | 'save' | 'share' | 'community' | 'initial' | 'auto', string>
> = {
  make: homeCreatorCopy.recipe.letsMakeIt,
  save: homeCreatorCopy.recipe.save,
  share: 'Udostępnij',
  community: 'Community',
  initial: homeCreatorCopy.recipe.doneAmount,
  auto: homeCreatorCopy.recipe.doneAmount,
};

export function HomeRecalculate({
  open,
  context,
  presentCurrent = false,
  onClose,
  onApplied,
  canSeeGrams = true,
  onGramsBlocked,
}: {
  open: boolean;
  /** Why the dialog is open. `initial` = the first build, `auto` = the automatic
   * recalculation after a change — both only ever open it for a CORE state the
   * customer has to decide; the rest are the final actions. */
  context: 'make' | 'save' | 'share' | 'community' | 'initial' | 'auto';
  /**
   * The shared PRZELICZ has ALREADY run for this recipe (the first build or the
   * automatic recalculation) and left a state for the customer. Present that state
   * instead of solving the same recipe a second time.
   */
  presentCurrent?: boolean;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
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
  const directionFallbackReport = useConstraintStudioStore(
    (state) => state.directionFallbackReport,
  );
  const starterPackRescueReport = useConstraintStudioStore(
    (state) => state.starterPackRescueReport,
  );
  const starterPackRescuePending = useConstraintStudioStore(
    (state) => state.starterPackRescuePending,
  );
  const terminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const blocked = useConstraintStudioStore((state) => state.blocked);
  const applyPending = useConstraintStudioStore((state) => state.applyPending);
  const postApplyNotice = useConstraintStudioStore((state) => state.postApplyNotice);
  const items = useRecipeStore((state) => state.items);
  const openedFor = useRef<string | null>(null);

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

  // OWNER BUGFIX 2026-09-11 (#287) — a refusal always explains itself. Served staging showed
  // a card with ONLY „Wróć": the solver's refusal (`no_proposal` on a safe recipe whose
  // Direction target cannot be improved) reached this component intact, but HOME read nothing
  // except `messagePl`, which that variant does not carry. `homeRecalcRefusal` reads the
  // canonical message sources through HOME's customer-language filter (OWNER SERVED QA
  // 2026-09-02: the pipeline's own sentence can name ProductBehavior, the Mapper or a
  // snapshot) and always adds the next step. The verdict is untouched — a refusal is still a
  // refusal.
  const lineNames = useMemo(
    () => new Map(items.map((item) => [item.id, item.ingredient.name])),
    [items],
  );
  const refusal = homeRecalcRefusal({ previewIssue, blocked, terminal, lineNames });

  const close = () => {
    if (useConstraintStudioStore.getState().recalculationTerminal?.state === 'WORKING') {
      cancelPiRecalculation();
    }
    // Nothing provisional survives: the recipe was never written.
    useConstraintStudioStore.getState().cancelPreview();
    openedFor.current = null;
    onClose();
  };

  // OWNER OD-1 (Package 2A): a 0 g HOME priority line is the solver's to size, so
  // every run hands it over as the Crown bootstrap on the provisional copy — through
  // HOME's ONE orchestration of the shared PRZELICZ (`homeRecalculation`).
  const runWith = (instructions: readonly PreviewLineInstruction[]) => {
    void runHomeRecalculation(instructions);
  };

  useEffect(() => {
    if (!open) {
      openedFor.current = null;
      return;
    }
    const key = `${context}:${useRecipeStore.getState().draftRevision}`;
    if (openedFor.current === key) return;
    openedFor.current = key;
    // The run that left this state already happened; solving again would only
    // replace the customer's question with an identical one.
    const staged = useConstraintStudioStore.getState().recalculationTerminal;
    // (A run still WORKING is presented too: its answer lands here.)
    if (presentCurrent && staged !== null && staged.state !== 'CANCELLED') return;
    runWith([]);
  }, [context, open, presentCurrent]);

  const recalculateInPreview = (instructions: PreviewLineInstruction[]) => {
    runWith(instructions);
  };

  const apply = () => {
    void (async () => {
      await applyPreviewWithServerAuthority();
      const after = useConstraintStudioStore.getState();
      if (after.preview === null && after.blocked === null && after.postApplyNotice === null) {
        await onApplied();
      }
    })();
  };

  const working = terminal?.state === 'WORKING';
  const previewOpen = !working && preview !== null && terminal?.state === 'PREVIEW_READY';
  const conflictOpen = !working && preview === null && lockConflict !== null;
  // CORE's Direction fallback ladder answered with an owner-approved adjacent/neutral
  // Direction („Ustaw 0”). The SAME decision surface and the SAME CORE actions as PRO
  // (`ProRecalcPanel`), so HOME and PRO customers are offered the identical choice —
  // and, exactly as in PRO, it takes precedence over the plain best-candidate consent.
  const fallbackOpen = !working && preview === null && directionFallbackReport !== null;
  const directionChoiceOpen =
    !working &&
    preview === null &&
    directionFallbackReport === null &&
    directionBestCandidate !== null &&
    terminal?.state === 'PREVIEW_READY';
  const noChange =
    !working &&
    preview === null &&
    pendingInstructionCommit === null &&
    terminal?.state === 'NO_CHANGE_NEEDED';
  const recoverable = terminal?.state === 'TIMEOUT' || terminal?.state === 'ERROR';
  // A committed Apply whose follow-up refresh did not finish keeps the dialog open. The
  // recipe DID change, so that is not a refusal: its own sentence is shown, never the
  // refusal wording.
  const appliedNotice =
    postApplyNotice !== null && previewIssue === null && blocked === null
      ? homeCustomerNotice(postApplyNotice.messagePl)
      : null;
  const refusalOpen =
    !working &&
    !previewOpen &&
    !conflictOpen &&
    !fallbackOpen &&
    !directionChoiceOpen &&
    !noChange &&
    pendingInstructionCommit === null &&
    !recoverable;

  return open ? (
    <div data-testid="home-final-review" data-context={context}>
        <DialogShell
          label={homeCreatorCopy.recipe.recalculate}
          testId="home-recalc-dialog"
          panelTestId="home-recalc-panel"
          panelState={terminal?.state ?? 'IDLE'}
          // DESIGN V3.0 XIII: a compact bottom layer on a phone and a portrait tablet (the
          // actions last, under the thumb), a light centred modal from 1024 px.
          placement="home-layer"
          size={previewOpen || conflictOpen ? 'wide' : 'default'}
          onClose={close}
          showCloseControl
          closeLabel={working ? homeCreatorCopy.draft.cancel : interactiveCopy.back}
          closeTestId="home-recalc-close"
          panelClassName="text-black [--color-charcoal:#191a1d] [--color-ivory:#202124] [--color-shell:#f5f3ee] [color-scheme:light]"
        >
          <h2
            className="shrink-0 pr-12 text-[18px] leading-[1.25] font-semibold text-[var(--g-ink)]"
            data-testid="home-recalc-title"
          >
            {homeCreatorCopy.recipe.recalculate}
          </h2>
          {/* Longer content scrolls inside; the layer stays at the bottom (XIII). */}
          <div className="-mx-1 mt-3 min-h-0 space-y-3 overflow-y-auto px-1 pb-1">
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
                    instructions: customerInstructions(preview.previewInstructions?.lines ?? []),
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

            {fallbackOpen && directionFallbackReport ? (
              <div data-testid="home-recalc-direction-fallback">
                <DirectionFallbackDecision
                  fallbackReport={directionFallbackReport}
                  alternativeReport={starterPackRescueReport}
                  alternativePending={starterPackRescuePending}
                  onUseFallback={() => {
                    void openDirectionFallbackPreviewWithServerAuthority();
                  }}
                  onTryAlternative={() => {
                    void requestStarterPackRescueWithServerAuthority();
                  }}
                  onOpenAlternative={() => {
                    void openStarterPackRescuePreviewWithServerAuthority();
                  }}
                  onBack={close}
                />
              </div>
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
                    data-testid="home-recalc-direction-best-open"
                    onClick={() =>
                      useConstraintStudioStore.getState().acceptBestDirectionCandidate()
                    }
                  >
                    {homeCreatorCopy.recipe.seeProposal}
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
                      void onApplied();
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
                  Receptura jest gotowa. Nie trzeba zmieniać ilości.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
                    onClick={close}
                  >
                    {interactiveCopy.back}
                  </button>
                  {/* Served 2026-09-18 („Zapisz recepturę”): nothing changes here, so the
                      button continues the action the customer asked for, in its own
                      words — never „Zastosuj zmiany”, and never a manual „Przelicz”:
                      HOME recalculates by itself. */}
                  <button
                    type="button"
                    data-testid="home-recalc-apply-no-change"
                    className={primaryButton}
                    style={{ background: 'var(--g-ink)', color: '#ffffff' }}
                    onClick={() => void onApplied()}
                  >
                    {NO_CHANGE_CONTINUE[context]}
                  </button>
                </div>
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
                    onClick={() => runWith([])}
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

            {refusalOpen && appliedNotice !== null ? (
              <div className="space-y-3" data-testid="home-recalc-applied">
                <p className="text-[14px] leading-relaxed" data-testid="home-recalc-applied-notice">
                  {appliedNotice}
                </p>
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

            {refusalOpen && appliedNotice === null ? (
              // An honest refusal from the existing pipeline is surfaced, not swallowed: the
              // reason, the rule it names when HOME can say it, and the next step — never a
              // card with only „Wróć". The full Pro diagnosis view is deliberately not
              // reproduced here (§67: HOME users never see the technical dashboard).
              <div className="space-y-3" data-testid="home-recalc-refusal">
                <p
                  className="text-[14px] leading-relaxed"
                  data-testid="home-recalc-issue"
                  style={{ color: 'var(--g-attention-ink)' }}
                >
                  {refusal.reason}
                </p>
                {refusal.detail !== null ? (
                  <p
                    className="text-[13px] leading-relaxed"
                    data-testid="home-recalc-issue-detail"
                    style={{ color: 'var(--g-text-secondary)' }}
                  >
                    {refusal.detail}
                  </p>
                ) : null}
                <p
                  className="text-[13px] leading-relaxed"
                  data-testid="home-recalc-next"
                  style={{ color: 'var(--g-text-secondary)' }}
                >
                  {refusal.next}
                </p>
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
    </div>
  ) : null;
}
