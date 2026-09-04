import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';
import { resolveSaveBlocker } from '@/features/recipes/saveBlocker';
import { ReviewDecisionLabel } from '@/features/design-review/ReviewBadge';
import {
  hasUnsavedProRecipeChanges,
  startNewProRecipe,
} from '@/pages/destinations/startNewProRecipe';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { iconButtonClasses } from '@/components/ui/buttonStyles';
import { withWorkbenchOrigin, workbenchOriginForSection } from '@/pages/pro/workbenchOrigin';
import { announceFriendlyLabMoment } from '@/components/shared/friendlyLabMoment';
import {
  applicationViewportGeometry,
  applicationViewportSize,
  currentApplicationScale,
} from '@/features/shell/applicationScaleAuthority';

const w = copy.proWorkbar;
const pm = copy.proMachine;

const TIER = { optimal: 'OPTIMAL', eco: 'ECO' } as const;
const SERVING_LABEL: Record<string, string> = {
  fresh: pm.serving.fresh,
  temp_minus_11: pm.serving.minus11,
  temp_minus_12: pm.serving.minus12,
  temp_minus_13: pm.serving.minus13,
  ninja_gelato: 'Ninja Gelato',
  ninja_swirl: 'Ninja Swirl',
};

export const WORKBAR_POPOVER_IDLE_MS = 4_500;
export const WORKBAR_POPOVER_FADE_MS = 180;
const WORKBAR_POPOVER_GUTTER_PX = 12;
const WORKBAR_POPOVER_GAP_PX = 8;
const WORKBAR_POPOVER_ESTIMATED_HEIGHT_PX = 210;

interface WorkbarPopoverPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

/**
 * A true viewport layer for the recipe overflow control.
 *
 * The recipe card lives inside two independent overflow containers. An
 * absolutely positioned `<details>` menu cannot out-rank or escape either of
 * them, regardless of its local z-index. This portal measures the trigger and
 * the recipe card, then paints a fixed panel directly under `<body>` so the
 * entire surface remains readable and inside the viewport.
 */
function RecipeOverflowPopover({
  variant,
  label,
  children,
}: {
  variant: 'bar' | 'panel';
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [autoDismissState, setAutoDismissState] = useState<'active' | 'fading'>('active');
  const [position, setPosition] = useState<WorkbarPopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const popoverId = useId();

  const clearAutoDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    dismissTimerRef.current = null;
    fadeTimerRef.current = null;
  }, []);

  const closeImmediately = useCallback(
    (restoreFocus = false) => {
      clearAutoDismiss();
      setOpen(false);
      setAutoDismissState('active');
      if (restoreFocus) triggerRef.current?.focus();
    },
    [clearAutoDismiss],
  );

  const startAutoDismiss = useCallback(() => {
    clearAutoDismiss();
    dismissTimerRef.current = window.setTimeout(() => {
      setAutoDismissState('fading');
      fadeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        setAutoDismissState('active');
        fadeTimerRef.current = null;
      }, WORKBAR_POPOVER_FADE_MS);
      dismissTimerRef.current = null;
    }, WORKBAR_POPOVER_IDLE_MS);
  }, [clearAutoDismiss]);

  const pauseAutoDismiss = useCallback(() => {
    clearAutoDismiss();
    setAutoDismissState('active');
  }, [clearAutoDismiss]);

  const measure = useCallback((): WorkbarPopoverPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const scale = currentApplicationScale();
    const triggerRect = applicationViewportGeometry(trigger.getBoundingClientRect(), scale);
    const rawWorkbarRect = trigger
      .closest<HTMLElement>('[data-testid="pro-workbar"]')
      ?.getBoundingClientRect();
    const workbarRect = rawWorkbarRect
      ? applicationViewportGeometry(rawWorkbarRect, scale)
      : undefined;
    const { width: viewportWidth, height: viewportHeight } = applicationViewportSize(scale);
    const maximumWidth = Math.max(0, viewportWidth - WORKBAR_POPOVER_GUTTER_PX * 2);
    const preferredWidth =
      variant === 'panel' && workbarRect ? workbarRect.width : Math.max(288, triggerRect.width);
    const width = Math.min(preferredWidth, maximumWidth);
    const preferredLeft =
      variant === 'panel' && workbarRect ? workbarRect.left : triggerRect.right - width;
    const left = clamp(
      preferredLeft,
      WORKBAR_POPOVER_GUTTER_PX,
      viewportWidth - width - WORKBAR_POPOVER_GUTTER_PX,
    );
    const measuredHeight = popoverRef.current
      ? applicationViewportGeometry(popoverRef.current.getBoundingClientRect(), scale).height
      : WORKBAR_POPOVER_ESTIMATED_HEIGHT_PX;
    const belowTop = triggerRect.bottom + WORKBAR_POPOVER_GAP_PX;
    const aboveTop = triggerRect.top - measuredHeight - WORKBAR_POPOVER_GAP_PX;
    const roomBelow = viewportHeight - belowTop - WORKBAR_POPOVER_GUTTER_PX;
    const roomAbove = triggerRect.top - WORKBAR_POPOVER_GAP_PX - WORKBAR_POPOVER_GUTTER_PX;
    const top =
      roomBelow >= measuredHeight || roomBelow >= roomAbove
        ? clamp(
            belowTop,
            WORKBAR_POPOVER_GUTTER_PX,
            viewportHeight - measuredHeight - WORKBAR_POPOVER_GUTTER_PX,
          )
        : clamp(
            aboveTop,
            WORKBAR_POPOVER_GUTTER_PX,
            viewportHeight - measuredHeight - WORKBAR_POPOVER_GUTTER_PX,
          );
    return {
      left,
      top,
      width,
      maxHeight: Math.max(120, viewportHeight - top - WORKBAR_POPOVER_GUTTER_PX),
    };
  }, [variant]);

  const openPopover = () => {
    if (open) {
      closeImmediately();
      return;
    }
    setPosition(measure());
    setAutoDismissState('active');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    startAutoDismiss();
    const updatePosition = () => setPosition(measure());
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      clearAutoDismiss();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [clearAutoDismiss, measure, open, startAutoDismiss]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      closeImmediately();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeImmediately(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeImmediately, open]);

  const layer =
    open && position ? (
      <section
        ref={popoverRef}
        id={popoverId}
        role="dialog"
        aria-label="Opcje receptury"
        data-testid="pro-workbar-popover"
        data-popover-layer="viewport-portal"
        data-auto-dismiss-state={autoDismissState}
        style={position}
        className={cn(
          'fixed z-[100] overflow-y-auto rounded-[14px] border border-ink/15 bg-white p-4 pr-12 text-ink shadow-pro-e3',
          'transition-opacity duration-150 ease-out motion-reduce:transition-none',
          autoDismissState === 'fading' ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        onPointerEnter={pauseAutoDismiss}
        onPointerMove={pauseAutoDismiss}
        onPointerLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) startAutoDismiss();
        }}
        onPointerDown={pauseAutoDismiss}
        onFocusCapture={pauseAutoDismiss}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) startAutoDismiss();
        }}
      >
        <button
          type="button"
          aria-label="Zamknij opcje receptury"
          title="Zamknij"
          onClick={() => closeImmediately(true)}
          data-testid="pro-workbar-popover-close"
          className={cn(
            iconButtonClasses('xs'),
            'pro-focus-ring absolute top-3 right-3 text-base leading-none',
          )}
        >
          ×
        </button>
        {children}
      </section>
    ) : null;

  return (
    <span className="relative shrink-0" data-testid="pro-workbar-menu">
      <button
        ref={triggerRef}
        type="button"
        className={cn(iconButtonClasses('xs'), 'cursor-pointer')}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        title={label}
        data-testid="pro-workbar-menu-trigger"
        data-workbar-action-size="compact"
        onClick={openPopover}
      >
        •••
      </button>
      {layer && typeof document !== 'undefined' ? createPortal(layer, document.body) : layer}
    </span>
  );
}

/** One persistent recipe bar. It combines recipe identity, save, working context,
 * preview/undo state and owner-review entry without introducing a second workflow. */
export function ProWorkbar({
  variant = 'bar',
  onSaveAttentionChange,
}: {
  variant?: 'bar' | 'panel';
  onSaveAttentionChange?: (required: boolean) => void;
}) {
  const { section } = useParams();
  // The menu is rendered inside the workbench, so the CURRENT section is the
  // origin. It is read from the route rather than hard-coded so opening
  // Wersje from Monitor or Production returns there, not to /pro/recipe.
  const versionsHref = withWorkbenchOrigin('/pro/versions', workbenchOriginForSection(section));
  const savedRecipeId = useRecipeStore((s) => s.savedRecipeId);
  const savedRecipeName = useRecipeStore((s) => s.savedRecipeName);
  const currentVersionNumber = useRecipeStore((s) => s.currentVersionNumber);
  const dirty = useRecipeStore((s) => s.dirty);
  const visibleProductType = useRecipeStore((s) => s.visibleProductType);
  const mode = useRecipeStore((s) => s.formulation_strategy);
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);
  const machineKind = useRecipeStore((s) => s.machineKind);
  const servingModeId = useRecipeStore((s) => s.servingModeId);
  const machineLabel = useRecipeStore((s) => s.machineLabel);
  const appliedHistoryLength = useConstraintStudioStore((s) => s.history.length);

  const save = useCanonicalRecipeSave();
  const linked = Boolean(savedRecipeId);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [newRecipeConfirmOpen, setNewRecipeConfirmOpen] = useState(false);
  const saveTransitionSequence = useRef(0);
  const name = nameDraft ?? savedRecipeName ?? '';

  const product = copy.studio.goal.productTypes[visibleProductType];
  const serving = servingModeId
    ? (SERVING_LABEL[servingModeId] ?? `${temperatureC}°C`)
    : `${temperatureC}°C`;
  const context =
    machineKind === 'home' && machineLabel
      ? `${machineLabel} · ${batchGrams} g`
      : `${product} · ${TIER[mode] ?? mode} · ${serving} · ${batchGrams} g`;

  const statusKey: keyof typeof w.status = save.error
    ? 'error'
    : save.busy
      ? 'saving'
      : !linked
        ? 'newUnsaved'
        : dirty || name.trim() !== (savedRecipeName ?? '')
          ? 'dirty'
          : 'clean';

  const announceSaveSuccess = () => {
    saveTransitionSequence.current += 1;
    announceFriendlyLabMoment(
      'save-complete',
      `save:${savedRecipeId ?? name.trim()}:${saveTransitionSequence.current}`,
    );
  };

  const doSave = async () => {
    const title = name.trim();
    if (!title) {
      setNameError(w.emptyNameError);
      return;
    }
    setNameError(null);
    if (!linked) {
      const created = await save.createNew(title);
      if (created) {
        setNameDraft(null);
        announceSaveSuccess();
      }
      return;
    }
    if (title !== (savedRecipeName ?? '')) {
      const renamed = await save.rename(title);
      if (!renamed) return;
    }
    const saved = await save.saveVersion();
    if (saved) {
      setNameDraft(null);
      announceSaveSuccess();
    }
  };

  const blockedMsg = save.blocked ? w.blocked[save.blocked] : null;
  const saveAttention =
    (statusKey === 'dirty' || statusKey === 'newUnsaved') &&
    !save.busy &&
    save.blocked === null &&
    !save.practicalBlocked;

  useEffect(() => {
    onSaveAttentionChange?.(saveAttention);
  }, [onSaveAttentionChange, saveAttention]);

  const createNewDraft = () => {
    startNewProRecipe(visibleProductType);
    setNameDraft(null);
    setNameError(null);
    setNewRecipeConfirmOpen(false);
  };

  const requestNewDraft = () => {
    const nameChanged = nameDraft !== null && nameDraft.trim() !== (savedRecipeName ?? '');
    if (hasUnsavedProRecipeChanges(nameChanged)) {
      setNewRecipeConfirmOpen(true);
      return;
    }
    createNewDraft();
  };

  /* OWNER AUTHORITY 2026-09-02 (approved desktop PDF, §3). RECEPTURA is the
     recipe's IDENTITY, so it opens the display column instead of closing it,
     and it has three states rather than one bar:

       unnamed  — a field to name it, save offered
       saved    — the graphite card, name and version, NO save tongue
       dirty    — the graphite card plus an orange tongue sliding out from
                  UNDER it

     The tongue is absolutely positioned and the wrapper reserves its 34 px in
     EVERY state, so appearing and disappearing moves neither kcal, nor cost,
     nor the left edge, nor anything below it — the owner's explicit condition.
     It sits at z-0 behind the card at z-1, so the graphite genuinely occludes
     its top rather than the tongue being painted over the card. */
  const identityState: 'unnamed' | 'saved' | 'dirty' = !linked
    ? 'unnamed'
    : statusKey === 'dirty'
      ? 'dirty'
      : 'saved';
  const tongueVisible = identityState !== 'saved';
  /** The card is graphite in every state but `unnamed`, and the message
   *  tones inside it have to follow that ground rather than the page's. */
  const onGraphite = identityState !== 'unnamed';

  /* Publish the typed preflight refusal so Settings can show the matching
     warning. It deliberately does not control disclosure state. Only the panel
     variant publishes: compact variants render where no Settings module exists
     to answer, and two publishers would race to own one slot. */
  const setPreflightBlocker = useRecipeProfileStore((s) => s.setPreflightBlocker);
  const settingsConfirmed = useRecipeProfileStore((s) => s.settingsConfirmed);
  /* ONE blocker, resolved in ONE place. The gate says what it refused on; Settings says
     whether its own values are confirmed; this picks the single thing to ask for. The
     mapping is pure and lives in `saveBlocker`, so it is testable without a browser and
     cannot quietly diverge from the copy the card prints. */
  const blocker = useMemo(
    () =>
      variant === 'panel'
        ? resolveSaveBlocker({ practical: save.practicalBlock, settingsConfirmed })
        : null,
    [save.practicalBlock, settingsConfirmed, variant],
  );
  useEffect(() => {
    setPreflightBlocker(blocker);
  }, [blocker, setPreflightBlocker]);
  useEffect(() => () => setPreflightBlocker(null), [setPreflightBlocker]);

  const statusNode = (
    <span
      className={cn(
        'min-w-0 truncate text-xs',
        variant === 'panel'
          ? 'mt-2.5 flex items-center gap-2 text-[13.5px] leading-[18px] font-semibold'
          : 'ml-auto min-w-[7rem] flex-1 text-right xl:max-w-48',
        variant === 'panel'
          ? /* Two grounds, two palettes. On the GRAPHITE card (#191a1d) the
               saved/dirty tones measure 8.2:1 and 10.2:1, where the light-ground
               tokens would be ~2.4:1 and unreadable. The unnamed state is a
               WHITE surface, so it keeps the light-ground tokens. Picking one
               palette for both would make one of the two states fail. */
            identityState === 'unnamed'
            ? statusKey === 'error'
              ? 'text-status-error'
              : 'text-[var(--g-attention-ink)]'
            : statusKey === 'error'
              ? 'text-[#ff9a8a]'
              : statusKey === 'dirty' || statusKey === 'newUnsaved'
                ? 'text-[#ffb45c]'
                : 'text-[#5cc47a]'
          : statusKey === 'error'
            ? 'text-status-error'
            : statusKey === 'dirty' || statusKey === 'newUnsaved'
              ? 'text-status-risky'
              : 'text-stone-500',
      )}
      data-testid="pro-workbar-status"
      data-workbar-status-placement={variant === 'panel' ? 'identity-card' : 'right-aligned'}
    >
      <span aria-hidden>● </span>
      {w.status[statusKey]}
      {variant === 'panel' && linked && currentVersionNumber ? ` · v${currentVersionNumber}` : ''}
    </span>
  );

  const overflowMenu = (
    <RecipeOverflowPopover variant={variant} label={w.more}>
      <div>
        <p className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
          Receptura
        </p>
        <p className="mt-2 text-xs text-ink">{context}</p>
        <p className="mt-1 text-xs text-stone-600">
          {currentVersionNumber ? `v${currentVersionNumber}` : 'wersja robocza'} ·{' '}
          {w.status[statusKey]}
        </p>
        {variant === 'panel' ? (
          /* In the SAVED state the tongue is gone by design, so the deliberate
             "save another version with no changes" path lives here rather than
             being lost. */
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={save.busy || save.blocked !== null || save.practicalBlocked}
            className="pro-focus-ring mt-3 block w-full border-t border-ink/10 pt-2 text-left text-xs font-semibold text-stone-600 disabled:text-[var(--g-lock)]"
          >
            {linked ? 'Zapisz nową wersję' : w.saveNew}
          </button>
        ) : null}
        <Link
          to={versionsHref}
          data-testid="pro-workbar-versions-link"
          className="mt-2 block border-t border-ink/10 pt-2 text-xs font-semibold text-stone-600"
        >
          Wersje
          <ReviewDecisionLabel />
        </Link>
      </div>
    </RecipeOverflowPopover>
  );

  if (variant === 'panel') {
    return (
      <section
        aria-label="Gellatti Pro — nazwa i zapis receptury"
        data-testid="pro-workbar"
        data-workbar-variant="panel"
        data-recipe-identity-state={identityState}
        className=""
      >
        {/* OWNER AUTHORITY 2026-09-03: the RECIPE leads the column. The card is
            the first thing in the panel and the actions sit underneath it, in
            the 34 px the tongue already reserved — one band doing two jobs
            instead of a row of controls standing above the thing they act on.

            The 34 px are reserved in EVERY state, so the tongue's arrival and
            departure still move nothing below.

            Three layers, and the order matters: the rule and the actions sit
            at the bottom (z-0), the tongue slides out over them (z-[1]) so the
            rule passes behind it, and the card occludes the tongue's top
            (z-[2]) so it still reads as sliding out from behind the card. */}
        <div className="relative pb-[34px]">
          {/* ONE surface in every state, so it always occludes the tongue's
              top. The first attempt left the status line outside the painted
              area and the tongue showed through a transparent 24 px band —
              caught by measurement, not by reading the code. */}
          <div
            className={cn(
              'relative z-[2] min-w-0 rounded-2xl px-7 py-6',
              identityState === 'unnamed'
                ? 'border-[1.5px] border-[#f58a07]/55 bg-white'
                : 'border-l-[6px] border-[#f58a07] bg-[var(--g-graphite)]',
            )}
            data-testid="pro-recipe-identity-card"
          >
            <label className="block">
              <span className="sr-only">{w.nameLabel}</span>
              {/* The title IS the name input in both states: renaming a saved
                  recipe stays exactly where it was, and there is never a second
                  field competing for the same value. */}
              <input
                value={name}
                placeholder={w.namePlaceholder}
                onChange={(event) => {
                  setNameDraft(event.currentTarget.value);
                  if (nameError) setNameError(null);
                }}
                data-testid="pro-workbar-name"
                className={cn(
                  'w-full min-w-0 truncate border-0 bg-transparent p-0 leading-[1.05] font-extrabold tracking-[-0.04em] focus:outline-none',
                  identityState === 'unnamed'
                    ? 'text-[22px] text-[var(--g-ink)] placeholder:font-semibold placeholder:text-[var(--g-text-muted)]'
                    : 'text-[28px] text-white placeholder:text-white/40',
                )}
              />
            </label>
            {statusNode}
            {/* OWNER AUTHORITY 2026-09-03: the blocking message lives INSIDE
                the card, under the status it qualifies. It used to print below
                the save control, which put the reason for the refusal further
                from the name it refuses to save than from the next section.

                The tones branch on the card's own ground: #8a5a2a and
                status-error are legible on the white unnamed card and would be
                near-invisible on graphite, where the light warm tones read at
                11:1 and above. */}
            {nameError ? (
              <p
                role="alert"
                className={cn(
                  'mt-1.5 text-xs',
                  onGraphite ? 'text-[#ffb3a7]' : 'text-status-error',
                )}
                data-testid="pro-workbar-name-error"
              >
                {nameError}
              </p>
            ) : null}
            {save.error ? (
              <p
                role="alert"
                className={cn(
                  'mt-1.5 text-xs',
                  onGraphite ? 'text-[#ffb3a7]' : 'text-status-error',
                )}
                data-testid="pro-workbar-error"
              >
                {save.error}
              </p>
            ) : blocker ? (
              <p
                className={cn('mt-1.5 text-xs', onGraphite ? 'text-[#f8c98a]' : 'text-attention')}
                data-testid="pro-workbar-practical-block"
              >
                {blocker.message}
              </p>
            ) : blockedMsg ? (
              <p className={cn('mt-1.5 text-xs', onGraphite ? 'text-white/70' : 'text-stone-600')}>
                {blockedMsg}
              </p>
            ) : null}
          </div>

          {/* The actions share the tongue's band. The rule runs the full width
              and the tongue paints over it, so a short segment stays visible to
              the right of ZAPISZ — the band reads as one line, not as a control
              parked beside a gap. */}
          <div className="absolute inset-x-0 bottom-0 z-0 flex h-[34px] items-center gap-2.5">
            <button
              type="button"
              onClick={requestNewDraft}
              data-testid="pro-workbar-new-recipe"
              data-workbar-action-size="primary"
              data-workbar-action-width="content"
              className="pro-focus-ring shrink-0 rounded-full border border-[var(--g-line)] bg-white px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-[var(--g-text-secondary)] transition-colors hover:border-ink/35 hover:text-ink"
            >
              + Nowa receptura
            </button>
            {overflowMenu}
            <span aria-hidden className="h-px flex-1 bg-[var(--g-line)]" />
          </div>

          {/* LAST in source, so tab order follows the eye: name, then the two
              actions on the left of the band, then Save on its right. It used
              to be rendered first, purely to satisfy a Save→name ordering
              contract, back when it sat directly under the card and nothing
              else shared its row. Now that the actions share the band, that
              source order sent a keyboard from the bottom-right control back up
              to the name and down again to the bottom-left.

              Painting is unaffected: the card occludes the tongue's top through
              z-index (card z-[2] over tongue z-[1]), never through source
              order, so the tongue still reads as sliding out from behind it. */}
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={save.busy || save.blocked !== null || save.practicalBlocked}
            data-attention={saveAttention ? 'required' : undefined}
            data-testid="pro-workbar-save"
            data-workbar-action-size="primary"
            data-workbar-action-width="content"
            data-workbar-save-shape="tongue"
            className={cn(
              'pro-focus-ring absolute right-[26px] bottom-0 z-[1] inline-flex h-[58px] max-w-[calc(100%-52px)] items-end gap-2 rounded-b-[15px] px-[22px] pb-[9px] text-[15px] leading-4 font-bold tracking-[-0.02em] whitespace-nowrap',
              /* Graphite ink on the accent is 7.5:1. White on the accent would
                 be 2.5:1 — the same mistake that was removed from Direction. */
              'bg-[#f58a07] text-[var(--g-graphite)] transition-[background-color,opacity] hover:bg-[#e07f06]',
              'disabled:cursor-not-allowed disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]',
              tongueVisible ? null : 'pointer-events-none opacity-0',
            )}
            aria-hidden={tongueVisible ? undefined : true}
            tabIndex={tongueVisible ? undefined : -1}
          >
            {save.busy ? w.status.saving : 'ZAPISZ'}
          </button>
        </div>

        <span className="sr-only" data-testid="pro-workbar-context">
          {context}
        </span>
        <span className="sr-only" data-testid="pro-workbar-profile-summary">
          {context}
        </span>

        {dirty && appliedHistoryLength > 0 ? (
          <p
            className="mt-2 border-t border-[var(--g-line)] pt-2 text-xs leading-relaxed text-[var(--g-text-secondary)]"
            data-testid="pro-workbar-applied-unsaved"
          >
            {w.recalcPanel.applied}
          </p>
        ) : null}

        <NewRecipeConfirmationDialog
          open={newRecipeConfirmOpen}
          onCancel={() => setNewRecipeConfirmOpen(false)}
          onConfirm={createNewDraft}
        />
      </section>
    );
  }

  return (
    <section
      aria-label="Gellatti Pro — nazwa i zapis receptury"
      data-testid="pro-workbar"
      data-workbar-variant={variant}
      className={cn(
        'rounded-t-[22px] border border-ink/10 bg-white/97 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pro-e2 backdrop-blur-xl lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:shadow-none lg:backdrop-blur-none 2xl:!border-0 2xl:py-0 2xl:pt-px 2xl:!shadow-none',
      )}
    >
      <div
        className={cn(
          'pro-workbar-layout grid min-w-0 gap-2',
          'xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)] xl:items-center xl:gap-[var(--pro-workbench-gap)]',
        )}
      >
        <div
          className={cn(
            'pro-workbar-actions flex min-w-0 flex-wrap items-center px-0.5',
            'justify-end gap-2 xl:flex-nowrap',
          )}
        >
          <button
            type="button"
            onClick={requestNewDraft}
            data-testid="pro-workbar-new-recipe"
            data-workbar-action-size="primary"
            data-workbar-action-width="content"
            className={cn(
              /* OWNER FROZEN PRO VISUAL: inside the display column the save row
                 is a row of 44 px pills, and the PRIMARY leads it. DOM order
                 stays New → Save → overflow for the docked bar; only the panel
                 reorders visually, so one contract still describes both. */
              'shrink-0 border border-ink/15 bg-white text-xs font-semibold text-ink transition-colors hover:border-ink/35 hover:bg-[var(--g-ivory)]',
              'h-11 rounded-[14px] px-3 shadow-pro-e0',
            )}
          >
            + Nowa receptura
          </button>
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={save.busy || save.blocked !== null || save.practicalBlocked}
            data-attention={saveAttention ? 'required' : undefined}
            data-testid="pro-workbar-save"
            data-workbar-action-size="primary"
            data-workbar-action-width="content"
            className={cn(
              /* A disabled action still has to be readable. `disabled:opacity-45`
                 washed the whole button to ink@45 % on white — a 2.88:1 label,
                 below AA. The product already settled this pattern for the
                 customer shell (§21.2, audit #17): a SOLID quiet fill with a
                 legible label, measured here at 5.03:1. */
              'shrink-0 bg-ink text-xs font-semibold text-white transition-all hover:-translate-y-px hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:bg-[var(--g-line-quiet)]',
              'h-11 rounded-[14px] px-3 shadow-pro-sm',
              saveAttention && 'gellatti-next-action-attention',
            )}
          >
            {save.busy ? w.status.saving : linked ? 'Zapisz nową wersję' : w.saveNew}
          </button>
          {overflowMenu}
          {statusNode}
          <span className="sr-only" data-testid="pro-workbar-profile-summary">
            {context}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <label className="min-w-28 flex-1">
            <span className="sr-only">{w.nameLabel}</span>
            <input
              value={name}
              placeholder={w.namePlaceholder}
              onChange={(event) => {
                setNameDraft(event.currentTarget.value);
                if (nameError) setNameError(null);
              }}
              data-testid="pro-workbar-name"
              className={cn(
                'w-full min-w-0 rounded-[10px] border border-ink/15 bg-white px-3 text-sm font-semibold text-ink shadow-pro-e0 placeholder:text-stone-500 focus:border-ink/45 focus:outline-none',
                'h-11',
              )}
            />
          </label>
          <span
            className={cn(
              'pro-workbar-context max-w-56 shrink-0 truncate text-xs text-stone-600 hidden xl:block',
            )}
            data-testid="pro-workbar-context"
          >
            {context}
          </span>
        </div>
      </div>

      {nameError ? (
        <p
          role="alert"
          className="mt-1 text-xs text-status-error"
          data-testid="pro-workbar-name-error"
        >
          {nameError}
        </p>
      ) : null}
      {dirty && appliedHistoryLength > 0 ? (
        <p
          /* OWNER FROZEN PRO VISUAL: unsaved is a STATUS, not a warning. The
             amber card claimed the weight of an error for a state the user
             created on purpose and can undo by saving. It is now a quiet note
             on a hairline — same words, same placement, no alarm. */
          className="mt-2 border-t border-[var(--g-line)] pt-2 text-xs leading-relaxed text-[var(--g-text-secondary)]"
          data-testid="pro-workbar-applied-unsaved"
        >
          {w.recalcPanel.applied}
        </p>
      ) : null}
      {save.error ? (
        <p role="alert" className="mt-1 text-xs text-status-error" data-testid="pro-workbar-error">
          {save.error}
        </p>
      ) : blocker ? (
        <p
          className="mt-1 text-xs text-attention 2xl:sr-only"
          data-testid="pro-workbar-practical-block"
        >
          {blocker.message}
        </p>
      ) : blockedMsg ? (
        <p className="mt-1 text-xs text-stone-600">{blockedMsg}</p>
      ) : null}

      <NewRecipeConfirmationDialog
        open={newRecipeConfirmOpen}
        onCancel={() => setNewRecipeConfirmOpen(false)}
        onConfirm={createNewDraft}
      />
    </section>
  );
}
