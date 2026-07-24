import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import { useLineLockControls } from '@/features/constraint-studio/useLineLockControls';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientPicker } from './IngredientPicker';
import { ServerIngredientPicker } from './ServerIngredientPicker';
import { IngredientRow, ROW_GRID, type IngredientRowActions } from './IngredientRow';
import { useIngredientLibrary } from './useIngredientLibrary';

const b = copy.studio.builder;
const headCell = 'text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase';

/** Items come from the engine result (effective grams, difference, share);
 * edits go back to the store. The engine remains the source of truth. */
export function IngredientBuilder({
  items,
  totalBatchG,
  targetBatchG,
  demo,
  layout = 'card',
}: {
  items: EffectiveRecipeItem[];
  totalBatchG: number;
  targetBatchG: number;
  /** /demo route — keep the local catalog and never fetch the PI Base library. */
  demo: boolean;
  /** One-screen workbench (owner 2026-07-24): `workbench` renders the SAME editor as a
   * height-filling column whose ROWS region is the one internal scroll surface — the
   * header, batch total and add-ingredient picker stay visible without page movement.
   * Presentation only; identical store actions and testids. */
  layout?: 'card' | 'workbench';
}) {
  const addIngredient = useRecipeStore((state) => state.addIngredient);
  const library = useIngredientLibrary({ demo });
  // §17 padlock layer (constraint-studio): per-line lock views + action
  // wrappers that reconcile the constraint set on dropdown/remove changes.
  const { lockFor, wrapActions } = useLineLockControls();
  const actions: IngredientRowActions = wrapActions({
    setPlannedGrams: useRecipeStore((state) => state.setPlannedGrams),
    setActualGrams: useRecipeStore((state) => state.setActualGrams),
    setLockType: useRecipeStore((state) => state.setLockType),
    setMainIngredient: useRecipeStore((state) => state.setMainIngredient),
    removeItem: useRecipeStore((state) => state.removeItem),
  });

  const offTarget = Math.abs(totalBatchG - targetBatchG) > 0.1;

  // Owner P0 repair (Phase 10): drafts saved BEFORE the canonical-identity fix
  // may still carry duplicated solver rows. Detect plannable duplicates and
  // offer an explicit one-click merge — never automatic, never touches locks.
  const storeItems = useRecipeStore((state) => state.items);
  const mergeDuplicates = useRecipeStore((state) => state.mergeDuplicateIngredientLines);
  const duplicateCount = (() => {
    const seen = new Set<string>();
    let extras = 0;
    for (const item of storeItems) {
      if (item.lock_type !== 'unlocked' || item.actual_grams !== null) continue;
      if (seen.has(item.ingredient.id)) extras += 1;
      else seen.add(item.ingredient.id);
    }
    return extras;
  })();

  const duplicateNotice =
    duplicateCount > 0 ? (
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5"
        data-testid="builder-duplicate-repair"
      >
        <p className="text-xs leading-relaxed text-amber-200/90">{b.duplicateNotice(duplicateCount)}</p>
        <button
          type="button"
          className="rounded-md border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
          onClick={mergeDuplicates}
          data-testid="builder-merge-duplicates"
        >
          {b.mergeDuplicates}
        </button>
      </div>
    ) : null;

  const header = (
    <div className={`${ROW_GRID} pb-2`}>
      <span className={headCell}>&nbsp;</span>
      <span className={`${headCell} text-right`}>{b.planned}</span>
      <span className={`${headCell} text-right`}>{b.actual}</span>
      <span className={`${headCell} text-right`}>{b.share}</span>
      <span className={headCell}>{b.lock}</span>
      <span className={headCell}>&nbsp;</span>
    </div>
  );

  const rows = items.map((item) => (
    <IngredientRow
      key={item.id}
      item={item}
      totalBatchG={totalBatchG}
      actions={actions}
      lock={lockFor(item)}
      compact={layout === 'workbench'}
    />
  ));

  const totalLine = (
    <div className="mt-4 flex items-center justify-between border-t border-ivory/10 pt-4">
      <span className="text-xs tracking-label text-ivory/65 uppercase">{b.batchTotal}</span>
      <span className="flex items-baseline gap-3">
        {offTarget ? (
          <span className="font-mono text-xs text-ivory/60 tabular-nums">
            {b.target} {targetBatchG.toLocaleString('en-US')} {b.unit}
          </span>
        ) : null}
        <MetricValue value={totalBatchG} unit={b.unit} size="sm" />
      </span>
    </div>
  );

  const picker = library.serverSearch ? (
    // Owner P0: canonical Pro — LIVE per-query backend search (no snapshot).
    <ServerIngredientPicker library={library} onAdd={addIngredient} />
  ) : (
    // Demo / fallback: the local 12-ingredient preview catalog.
    <IngredientPicker library={library} onAdd={addIngredient} />
  );

  if (layout === 'workbench') {
    // One-screen workbench: the ROWS region is the ONE internal scroll surface of the
    // editor pane; header, batch total and Add stay visible (owner zero-scroll rule).
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="ingredient-editor-pane">
        <div className="shrink-0 px-4 pt-3">
          <SectionLabel>{b.title}</SectionLabel>
          {duplicateNotice}
        </div>
        {items.length === 0 ? (
          <p className="shrink-0 px-4 pt-4 text-sm leading-relaxed text-ivory/60">{b.empty}</p>
        ) : (
          <>
            <div className="shrink-0 px-4 pt-3">{header}</div>
            <div
              className="min-h-0 flex-1 overflow-y-auto px-4"
              data-testid="ingredient-rows-scroll"
            >
              <div className="divide-y divide-ivory/10">{rows}</div>
            </div>
            <div className="shrink-0 px-4">{totalLine}</div>
          </>
        )}
        <div className="shrink-0 px-4 pb-3 pt-3" data-testid="ingredient-add-slot">
          {picker}
        </div>
      </div>
    );
  }

  return (
    <Card padding="lg">
      <SectionLabel>{b.title}</SectionLabel>

      {duplicateNotice}

      {items.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-ivory/60">{b.empty}</p>
      ) : (
        <>
          <div className="mt-5 divide-y divide-ivory/10">
            {header}
            {rows}
          </div>
          {totalLine}
        </>
      )}

      <div className="mt-5">{picker}</div>
    </Card>
  );
}
