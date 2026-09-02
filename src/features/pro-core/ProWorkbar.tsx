import { useEffect, useRef, useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';
import { ReviewDecisionLabel } from '@/features/design-review/ReviewBadge';
import {
  hasUnsavedProRecipeChanges,
  startNewProRecipe,
} from '@/pages/destinations/startNewProRecipe';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { iconButtonClasses } from '@/components/ui/buttonStyles';
import { announceFriendlyLabMoment } from '@/components/shared/friendlyLabMoment';

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

/** One persistent recipe bar. It combines recipe identity, save, working context,
 * preview/undo state and owner-review entry without introducing a second workflow. */
export function ProWorkbar({
  variant = 'bar',
  onSaveAttentionChange,
}: {
  variant?: 'bar' | 'panel';
  onSaveAttentionChange?: (required: boolean) => void;
}) {
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
    <details className="relative shrink-0" data-testid="pro-workbar-menu">
      <summary
        className={cn(iconButtonClasses('xs'), 'cursor-pointer list-none')}
        aria-label={w.more}
        title={w.more}
        data-workbar-action-size="compact"
      >
        •••
      </summary>
      <div className="absolute top-9 right-0 z-40 w-72 rounded-[22px] border border-ink/15 bg-white p-4 shadow-pro-e3">
        <p className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">Receptura</p>
        <p className="mt-2 text-xs text-ink">{context}</p>
        <p className="mt-1 text-xs text-stone-600">
          {currentVersionNumber ? `v${currentVersionNumber}` : 'wersja robocza'} ·{' '}
          {w.status[statusKey]}
        </p>
        {/* In the SAVED state the tongue is gone by design, so the deliberate
            "save another version with no changes" path lives here rather than
            being lost. */}
        <button
          type="button"
          onClick={() => void doSave()}
          disabled={save.busy || save.blocked !== null || save.practicalBlocked}
          className="pro-focus-ring mt-3 block w-full border-t border-ink/10 pt-2 text-left text-xs font-semibold text-stone-600 disabled:text-[var(--g-lock)]"
        >
          {linked ? 'Zapisz nową wersję' : w.saveNew}
        </button>
        <a
          href="/pro/versions"
          className="mt-2 block border-t border-ink/10 pt-2 text-xs font-semibold text-stone-600"
        >
          Wersje
          <ReviewDecisionLabel />
        </a>
      </div>
    </details>
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
        {/* OWNER AUTHORITY 2026-09-03: the word "Receptura" is GONE from this
            band. The global header already names the section, so printing it a
            second time 40 px lower said nothing and cost a line of vertical
            room. The band itself stays — the rule, "+ Nowa receptura" and the
            overflow menu are unchanged; only the duplicated label is removed,
            so the rule now starts at the column's left edge. The section keeps
            its accessible name from `aria-label` on the element above. */}
        <div className="mb-[13px] flex items-center gap-2.5">
          <span aria-hidden className="h-px flex-1 bg-[var(--g-line)]" />
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
        </div>

        {/* The 34 px are reserved in EVERY state, so the tongue's arrival and
            departure move nothing below. */}
        <div className="relative pb-[34px]">
          {/* Rendered BEFORE the card so the DOM order stays Save → name (the
              canonical contract), while z-index — not source order — decides
              that the graphite occludes the tongue's top. */}
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
              'pro-focus-ring absolute right-[26px] bottom-0 z-0 inline-flex h-[58px] max-w-[calc(100%-52px)] items-end gap-2 rounded-b-[15px] px-[22px] pb-[9px] text-[15px] leading-4 font-bold tracking-[-0.02em] whitespace-nowrap',
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

          {/* ONE surface in every state, so it always occludes the tongue's
              top. The first attempt left the status line outside the painted
              area and the tongue showed through a transparent 24 px band —
              caught by measurement, not by reading the code. */}
          <div
            className={cn(
              'relative z-[1] min-w-0 rounded-2xl px-7 py-6',
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
          </div>
        </div>

        <span className="sr-only" data-testid="pro-workbar-context">
          {context}
        </span>
        <span className="sr-only" data-testid="pro-workbar-profile-summary">
          {context}
        </span>

        {nameError ? (
          <p role="alert" className="mt-1 text-xs text-status-error" data-testid="pro-workbar-name-error">
            {nameError}
          </p>
        ) : null}
        {dirty && appliedHistoryLength > 0 ? (
          <p
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
        ) : save.practicalBlockMessage ? (
          <p className="mt-1 text-xs text-attention" data-testid="pro-workbar-practical-block">
            {save.practicalBlockMessage}
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
          'grid min-w-0 gap-2',
          'xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)] xl:items-center xl:gap-[var(--pro-workbench-gap)]',
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center px-0.5',
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
          <details
            className="relative shrink-0"
            data-testid="pro-workbar-menu"
          >
            <summary
              className={cn(iconButtonClasses('xs'), 'cursor-pointer list-none')}
              aria-label={w.more}
              title={w.more}
              data-workbar-action-size="compact"
            >
              •••
            </summary>
            <div className="absolute bottom-10 left-0 z-40 w-72 rounded-[22px] border border-ink/15 bg-white p-4 shadow-pro-e3">
              <p className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
                Receptura
              </p>
              <p className="mt-2 text-xs text-ink">{context}</p>
              <p className="mt-1 text-xs text-stone-600">
                {currentVersionNumber ? `v${currentVersionNumber}` : 'wersja robocza'} ·{' '}
                {w.status[statusKey]}
              </p>
              <a
                href="/pro/versions"
                className="mt-3 block border-t border-ink/10 pt-2 text-xs font-semibold text-stone-600"
              >
                Wersje
                <ReviewDecisionLabel />
              </a>
            </div>
          </details>
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
              'max-w-56 shrink-0 truncate text-xs text-stone-600 hidden xl:block',
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
      ) : save.practicalBlockMessage ? (
        <p
          className="mt-1 text-xs text-attention 2xl:sr-only"
          data-testid="pro-workbar-practical-block"
        >
          {save.practicalBlockMessage}
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
