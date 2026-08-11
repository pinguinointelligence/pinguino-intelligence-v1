import { useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';
import { WorkbenchActionBar } from '@/features/pro-workbench/WorkbenchActionBar';
import { ReviewDecisionLabel } from '@/features/design-review/ReviewBadge';

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
export function ProWorkbar({ onOpenPreview = () => {} }: { onOpenPreview?: () => void }) {
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

  const save = useCanonicalRecipeSave();
  const linked = Boolean(savedRecipeId);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
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
      if (created) setNameDraft(null);
      return;
    }
    if (title !== (savedRecipeName ?? '')) {
      const renamed = await save.rename(title);
      if (!renamed) return;
    }
    const saved = await save.saveVersion();
    if (saved) setNameDraft(null);
  };

  const blockedMsg = save.blocked ? w.blocked[save.blocked] : null;

  return (
    <section
      aria-label="PINGÜINO Pro — nazwa i zapis receptury"
      data-testid="pro-workbar"
      className="rounded-t-[22px] border border-ink/10 bg-white/97 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pro-e2 backdrop-blur-xl"
    >
      <div className="grid min-w-0 gap-2 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0 px-0.5">
          <p className="text-xs font-semibold text-ink">Bieżąca receptura</p>
          <p className="truncate text-xs text-stone-600" data-testid="pro-workbar-profile-summary">
            {context}
          </p>
          <p className="truncate text-xs text-stone-600">
            <span className="font-semibold text-ink">
              {currentVersionNumber ? `v${currentVersionNumber}` : 'wersja robocza'}
            </span>
            <span aria-hidden> · </span>
            {w.status[statusKey]}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={save.busy || save.blocked !== null || save.practicalBlocked}
            data-testid="pro-workbar-save"
            className="h-11 shrink-0 rounded-[14px] bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm transition-all hover:-translate-y-px hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-45"
          >
            {save.busy ? w.status.saving : linked ? 'Zapisz nową wersję' : w.saveNew}
          </button>

          <label className="min-w-28 flex-1 md:max-w-72">
            <span className="sr-only">{w.nameLabel}</span>
            <input
              value={name}
              placeholder={w.namePlaceholder}
              onChange={(event) => {
                setNameDraft(event.currentTarget.value);
                if (nameError) setNameError(null);
              }}
              data-testid="pro-workbar-name"
              className="h-11 w-full min-w-0 rounded-[14px] border border-ink/15 bg-white px-3 text-sm font-semibold text-ink shadow-pro-e0 placeholder:text-stone-600 focus:border-ink/45 focus:outline-none"
            />
          </label>

          <details className="relative shrink-0">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-[14px] border border-ink/10 text-sm text-stone-600">
              •••
            </summary>
            <div className="absolute bottom-12 left-0 z-40 w-72 rounded-[22px] border border-ink/15 bg-white p-4 shadow-pro-e3">
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
            className="hidden min-w-0 flex-1 truncate text-xs text-stone-600 lg:block"
            data-testid="pro-workbar-context"
          >
            {context}
          </span>
          <span
            className={cn(
              'hidden text-xs xl:block',
              statusKey === 'error'
                ? 'text-status-error'
                : statusKey === 'dirty'
                  ? 'text-attention'
                  : 'text-stone-500',
            )}
            data-testid="pro-workbar-status"
          >
            {w.status[statusKey]}
          </span>
          <WorkbenchActionBar onOpenPreview={onOpenPreview} />
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
    </section>
  );
}
