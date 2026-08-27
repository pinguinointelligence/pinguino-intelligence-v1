import { useEffect, useState } from 'react';
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
import { FriendlyLabMessageMotion } from '@/components/shared/FriendlyLabMessageMotion';

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
  const [saveSuccessKey, setSaveSuccessKey] = useState(0);
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
        setSaveSuccessKey((key) => key + 1);
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
      setSaveSuccessKey((key) => key + 1);
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

  return (
    <section
      aria-label="Gellatti Pro — nazwa i zapis receptury"
      data-testid="pro-workbar"
      data-workbar-variant={variant}
      className={cn(
        variant === 'panel'
          ? 'rounded-[14px] border border-ink/10 bg-white p-2.5 shadow-pro-e0'
          : 'rounded-t-[22px] border border-ink/10 bg-white/97 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pro-e2 backdrop-blur-xl lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:shadow-none lg:backdrop-blur-none 2xl:!border-0 2xl:py-0 2xl:pt-px 2xl:!shadow-none',
      )}
    >
      <div
        className={cn(
          'grid min-w-0 gap-2',
          variant === 'panel'
            ? 'grid-cols-1'
            : 'xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)] xl:items-center xl:gap-[var(--pro-workbench-gap)]',
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center px-0.5',
            variant === 'panel'
              ? 'order-2 justify-start gap-2.5 sm:flex-nowrap'
              : 'justify-end gap-2 xl:flex-nowrap',
          )}
        >
          <button
            type="button"
            onClick={requestNewDraft}
            data-testid="pro-workbar-new-recipe"
            data-workbar-action-size="primary"
            data-workbar-action-width={variant === 'panel' ? 'equal' : 'content'}
            className={cn(
              'shrink-0 rounded-[14px] border border-ink/15 bg-white px-3 text-xs font-semibold text-ink shadow-pro-e0 transition-colors hover:border-ink/35 hover:bg-stone-50',
              variant === 'panel' ? 'h-9 w-[136px]' : 'h-11',
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
            data-workbar-action-width={variant === 'panel' ? 'equal' : 'content'}
            className={cn(
              'shrink-0 rounded-[14px] bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm transition-all hover:-translate-y-px hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-45',
              variant === 'panel' ? 'h-9 w-[136px]' : 'h-11',
              saveAttention && 'gellatti-next-action-attention',
            )}
          >
            {save.busy
              ? w.status.saving
              : variant === 'panel'
                ? 'ZAPISZ'
                : linked
                  ? 'Zapisz nową wersję'
                  : w.saveNew}
          </button>
          <details className="relative shrink-0" data-testid="pro-workbar-menu">
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
          <span
            className={cn(
              'min-w-0 truncate text-xs',
              variant === 'panel'
                ? 'max-w-[13rem] flex-none text-left'
                : 'ml-auto min-w-[7rem] flex-1 text-right xl:max-w-48',
              statusKey === 'error'
                ? 'text-status-error'
                : statusKey === 'dirty' || statusKey === 'newUnsaved'
                  ? 'text-status-risky'
                  : 'text-stone-500',
            )}
            data-testid="pro-workbar-status"
            data-workbar-status-placement={
              variant === 'panel' ? 'inline-after-menu' : 'right-aligned'
            }
          >
            <span aria-hidden>● </span>
            {w.status[statusKey]}
          </span>
          <span className="sr-only" data-testid="pro-workbar-profile-summary">
            {context}
          </span>
        </div>
        <div className={cn('flex min-w-0 items-center gap-3', variant === 'panel' && 'order-1')}>
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
                variant === 'panel' ? 'h-10' : 'h-11',
              )}
            />
          </label>
          <span
            className={cn(
              'max-w-56 shrink-0 truncate text-xs text-stone-600',
              variant === 'panel' ? 'sr-only' : 'hidden xl:block',
            )}
            data-testid="pro-workbar-context"
          >
            {context}
          </span>
        </div>
      </div>

      {saveSuccessKey > 0 ? (
        <FriendlyLabMessageMotion
          key={saveSuccessKey}
          timing="informational"
          className="mt-2 rounded-[12px] border border-[#2f6f3c]/20 bg-[#2f6f3c]/[0.055] px-3 py-2 text-xs font-semibold text-[#2f6f3c]"
          testId="pro-workbar-save-success"
        >
          Gotowe. Receptura zapisana.
        </FriendlyLabMessageMotion>
      ) : null}

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
          className="mt-2 rounded-[12px] border border-attention/25 bg-pro-amber/35 px-3 py-2 text-xs leading-relaxed text-stone-700"
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
