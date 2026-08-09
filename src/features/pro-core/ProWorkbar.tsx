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
      className="bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void doSave()}
          disabled={save.busy || save.blocked !== null}
          data-testid="pro-workbar-save"
          className="h-9 shrink-0 rounded-sm bg-ink px-3 text-xs font-semibold text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-45"
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
            className="h-9 w-full min-w-0 rounded-sm border border-ink/15 bg-white px-3 text-sm font-semibold text-ink placeholder:text-stone-400 focus:border-ink/45 focus:outline-none"
          />
        </label>

        <details className="relative shrink-0">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-sm border border-ink/10 text-sm text-stone-600">
            •••
          </summary>
          <div className="absolute bottom-11 left-0 z-40 w-72 border border-ink/15 bg-white p-3 shadow-[0_8px_24px_rgba(16,17,19,0.1)]">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
              Receptura
            </p>
            <p className="mt-2 text-xs text-ink">{context}</p>
            <p className="mt-1 text-[10px] text-stone-500">
              {currentVersionNumber ? `v${currentVersionNumber}` : 'wersja robocza'} ·{' '}
              {w.status[statusKey]}
            </p>
            <a
              href="/pro/versions"
              className="mt-3 block border-t border-ink/10 pt-2 text-[10px] font-semibold text-stone-600"
            >
              Wersje
              <ReviewDecisionLabel />
            </a>
          </div>
        </details>

        <span
          className="hidden min-w-0 flex-1 truncate text-[10px] text-stone-500 lg:block"
          data-testid="pro-workbar-context"
        >
          {context}
        </span>
        <span
          className={cn(
            'hidden text-[10px] xl:block',
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

      {nameError ? (
        <p
          role="alert"
          className="mt-1 text-[10px] text-status-error"
          data-testid="pro-workbar-name-error"
        >
          {nameError}
        </p>
      ) : null}
      {save.error ? (
        <p
          role="alert"
          className="mt-1 text-[10px] text-status-error"
          data-testid="pro-workbar-error"
        >
          {save.error}
        </p>
      ) : blockedMsg ? (
        <p className="mt-1 text-[10px] text-stone-500">{blockedMsg}</p>
      ) : null}
    </section>
  );
}
