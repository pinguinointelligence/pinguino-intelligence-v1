/**
 * §52–§62 — the live HOME recipe.
 *
 * WHAT IS DELIBERATELY ABSENT (§52): percentages, PI-ING codes, product ids, POD/PAC/
 * NPAC, solids, kcal, cost, supplier and regulatory data. None of those values is read
 * by this component — they are not hidden with CSS, they never enter the render.
 *
 * §54, OWNER OVERRIDE 2026-09-02. The row is a READOUT, not a control panel:
 *
 *     ingredient | Crown (where Main is allowed) | 84 g | [ ⋯ ]
 *
 * The always-visible `[−] [g] [+] [lock]` editor is SUPERSEDED: six ingredients meant
 * six permanent editors. The SAME shared PRO `DirectNumberControl` still does every
 * amount change — it is simply summoned from „Zmień ilość" and dismissed again.
 *
 * A Demo line reads `••• g`. With no input, no spinbutton and no value attribute in the
 * default row, the masked state cannot leak a gram at all; when the editor opens masked,
 * the existing entitlement routing applies unchanged.
 *
 * HOME performs no arithmetic, and owns no Main rule: Crown reads the canonical
 * capability resolver and mutates through the canonical `setLockType`.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { EngineIngredient, RecipeItem } from '@/engine';
import type {
  RecipeToppingIngredient,
  RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { ProductPickerPopover } from '@/features/ingredient-builder/ProductPickerPopover';
import type { IngredientLibrary } from '@/features/ingredient-builder/ingredientLibrary';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import type { RecipeMatchScorePresentation } from '@/features/recipe-score';
import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import { resolveMainCapability } from '@/features/product-intelligence/mainCapability';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeBehaviorContext } from '../useHomeBehaviorContext';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homeCustomerNotice } from '../homeCustomerNotice';
import {
  HOME_SWEETNESS_ORDER,
  projectSweetnessForDisplay,
  type HomeSweetness,
} from '../homeSweetness';
import { HomeRecalculate } from './HomeRecalculate';
import { HomeSection } from './HomeSection';

const SWEETNESS_LABEL: Readonly<Record<HomeSweetness, string>> = {
  less: homeCreatorCopy.sweetness.less,
  balanced: homeCreatorCopy.sweetness.balanced,
  sweeter: homeCreatorCopy.sweetness.sweeter,
};

/**
 * OWNER OVERRIDE 2026-09-02 — the amount.
 *
 * The row used to carry the full four-segment editor at all times, so six ingredients
 * meant six permanent editors and the recipe read as a control panel. The DEFAULT state
 * is now a readout; the SAME shared `DirectNumberControl` appears in place only while
 * the customer is actually changing the amount, so nothing about lock, masking or
 * mutation semantics changes — only how long the control is on screen.
 */
function HomeRowAmount({
  lineId,
  name,
  grams,
  locked,
  canSeeGrams,
  onBlocked,
  editing,
  onDone,
}: {
  lineId: string;
  name: string;
  grams: number;
  locked: boolean;
  canSeeGrams: boolean;
  onBlocked: () => void;
  editing: boolean;
  onDone: () => void;
}) {
  // The amount as the customer last saw it when the editor opened. Any difference is
  // what "changed" means here, and it is the only thing the orange emphasis reacts to.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  if (editing && openedAt === null) setOpenedAt(grams);
  if (!editing && openedAt !== null) setOpenedAt(null);
  const changed = editing && openedAt !== null && openedAt !== grams;

  if (!editing) {
    return (
      <span
        className={cn(
          'shrink-0 font-mono text-[15px] tabular-nums',
          locked && 'underline decoration-dotted underline-offset-4',
        )}
        // The editor renders this number with `decimals={0}`; the readout has to agree,
        // or a line reads „87.10000000000001 g" the moment it is not being edited.
        data-testid={`home-amount-${lineId}`}
        data-locked={locked ? 'true' : undefined}
        style={{ color: 'var(--g-ink)' }}
        // A locked amount is worth knowing about, but not worth a second button.
        title={locked ? homeCreatorCopy.recipe.lockLabel : undefined}
      >
        {canSeeGrams ? Math.round(grams) : homeCreatorCopy.recipe.maskedGramsValue}{' '}
        {homeCreatorCopy.recipe.grams}
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span
        className={cn('rounded-2xl', changed && 'ring-2')}
        // Canonical orange, restrained: a ring on the control that changed, not an alert.
        style={changed ? { boxShadow: '0 0 0 2px var(--g-orange)' } : undefined}
        data-testid={`home-amount-editor-${lineId}`}
        data-changed={changed ? 'true' : undefined}
      >
        <DirectNumberControl
          value={grams}
          step={1}
          min={0}
          decimals={0}
          suffix={homeCreatorCopy.recipe.grams}
          ariaLabel={`${name} — ${homeCreatorCopy.recipe.gramsFieldLabel}`}
          testId={`home-grams-${lineId}`}
          widthPreset="grams"
          density="responsive"
          onChange={(next) => useRecipeStore.getState().setPlannedGrams(lineId, next)}
          {...(canSeeGrams
            ? {}
            : {
                maskedValue: homeCreatorCopy.recipe.maskedGramsValue,
                maskedLabel: homeCreatorCopy.recipe.maskedGramsLabel,
                onMaskedInteract: onBlocked,
              })}
          lockSegment={{
            pressed: locked,
            ariaLabel: `${name} — ${homeCreatorCopy.recipe.lockLabel}`,
            title: homeCreatorCopy.recipe.lockLabel,
            suffix: 'g',
            testId: `home-lock-${lineId}`,
            onToggle: () =>
              useRecipeStore.getState().setLockType(lineId, locked ? 'unlocked' : 'grams'),
          }}
        />
      </span>
      <button
        type="button"
        onClick={onDone}
        data-testid={`home-amount-done-${lineId}`}
        className="min-h-[44px] shrink-0 rounded-full px-3 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        style={{ color: 'var(--g-text-secondary)' }}
      >
        {homeCreatorCopy.recipe.doneAmount}
      </button>
    </span>
  );
}

/**
 * Crown is a primary HOME action, so it is a control rather than the passive badge it
 * used to be. It renders only where the CANONICAL authority allows Main interaction —
 * a line that already holds Main, or one the resolver says is selectable. An unresolved
 * product simply has no Crown to press, which is the existing fail-closed answer shown
 * rather than explained.
 */
function CrownControl({ lineId, isMain, name }: { lineId: string; isMain: boolean; name: string }) {
  return (
    <button
      type="button"
      aria-pressed={isMain}
      aria-label={`${name} — ${homeCreatorCopy.recipe.crown}`}
      data-testid={`home-crown-${lineId}`}
      onClick={() => useRecipeStore.getState().setLockType(lineId, isMain ? 'unlocked' : 'main')}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold tracking-[0.06em] transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
      )}
      style={
        isMain
          ? { background: 'var(--g-ink)', color: '#ffffff', borderColor: 'var(--g-ink)' }
          : {
              background: 'var(--g-ivory)',
              color: 'var(--g-text-secondary)',
              borderColor: 'var(--g-line)',
            }
      }
    >
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        <path
          d="M2 12.5h12M2.5 4l3 3L8 3l2.5 4 3-3-1 6.5h-9L2.5 4Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      {isMain ? homeCreatorCopy.recipe.crown : null}
    </button>
  );
}

/**
 * OWNER FROZEN 2026-09-02 — exactly three actions. `Znajdź zamiennik` was wired to a
 * no-op and is gone; `Nie mam tego składnika` moved out of HOME's menu (the store
 * function is untouched and PRO keeps it). No product data, no diagnostics: HOME is
 * not PRO.
 */
function RowMenu({
  lineId,
  locked,
  onChangeAmount,
  onToggleLock,
  onRemove,
}: {
  lineId: string;
  locked: boolean;
  onChangeAmount?: () => void;
  onToggleLock?: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const act = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={homeCreatorCopy.recipe.rowMenu}
        aria-expanded={open}
        data-testid="home-row-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        style={{ color: 'var(--g-menu-dots)' }}
      >
        <svg width="16" height="4" viewBox="0 0 16 4" aria-hidden="true">
          <circle cx="2" cy="2" r="1.6" fill="currentColor" />
          <circle cx="8" cy="2" r="1.6" fill="currentColor" />
          <circle cx="14" cy="2" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-11 z-20 min-w-[210px] overflow-hidden rounded-[10px] border shadow-sm"
          style={{ borderColor: 'var(--g-line)', background: '#ffffff' }}
          data-testid="home-row-menu-panel"
        >
          {onChangeAmount ? (
            <button
              type="button"
              onClick={act(onChangeAmount)}
              data-testid={`home-row-change-amount-${lineId}`}
              className="block w-full px-4 py-3 text-left text-[14px] hover:bg-black/[0.04]"
              style={{ color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.recipe.changeAmount}
            </button>
          ) : null}
          {onToggleLock ? (
            <button
              type="button"
              onClick={act(onToggleLock)}
              data-testid={`home-row-toggle-lock-${lineId}`}
              className="block w-full px-4 py-3 text-left text-[14px] hover:bg-black/[0.04]"
              style={{ color: 'var(--g-ink)' }}
            >
              {locked ? homeCreatorCopy.recipe.unlockLabel : homeCreatorCopy.recipe.lockLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={act(onRemove)}
            data-testid={`home-row-remove-${lineId}`}
            className="block w-full px-4 py-3 text-left text-[14px] hover:bg-black/[0.04]"
            style={{ color: 'var(--g-ink)' }}
          >
            {homeCreatorCopy.recipe.removeIngredient}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function HomeRecipeSection({
  name,
  onNameChange,
  score,
  machineLine,
  items,
  toppings,
  crownLineIds,
  canSeeGrams,
  sweetnessStored,
  onSweetness,
  onRemoveItem,
  library,
  onAddIngredient,
  onAddTopping,
  onGramsBlocked,
  onSave,
  onLetsMakeIt,
  onShare,
  canShare,
  onBack,
}: {
  name: string;
  onNameChange: (name: string) => void;
  score: RecipeMatchScorePresentation;
  machineLine: string;
  items: readonly RecipeItem[];
  toppings: readonly RecipeToppingItem[];
  crownLineIds: readonly string[];
  canSeeGrams: boolean;
  sweetnessStored: number;
  onSweetness: (choice: HomeSweetness) => void;
  onRemoveItem: (lineId: string) => void;
  /** §56: the SAME Pro picker, in a simpler HOME presentation. */
  library: IngredientLibrary;
  onAddIngredient: (ingredient: EngineIngredient, behavior?: ProductBehaviorSnapshot) => void;
  /** Entitlement route when a masked gram control is operated. */
  onGramsBlocked: () => void;
  onAddTopping: (ingredient: RecipeToppingIngredient, behavior?: ProductBehaviorSnapshot) => void;
  onSave: () => void;
  onLetsMakeIt: () => void;
  onShare: () => void;
  canShare: boolean;
  onBack?: (() => void) | null;
}) {
  const activeSweetness = projectSweetnessForDisplay(sweetnessStored as -2 | -1 | 0 | 1 | 2);

  const {
    accountId: behaviorAccountId,
    productProfile: behaviorProfile,
    temperatureC: behaviorTemperatureC,
    mode: behaviorMode,
  } = useHomeBehaviorContext();
  // Only one amount is ever being changed at a time; the rest of the recipe stays calm.
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  // CANONICAL authority, read straight from the store — HOME derives no Main rule of
  // its own. A line with no resolved snapshot is not selectable, which is the existing
  // fail-closed answer.
  const behaviorSnapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const mainSelectable = (lineId: string): boolean =>
    resolveMainCapability({ snapshot: behaviorSnapshots[lineId], snapshotRequired: true })
      .selectable;

  return (
    <HomeSection id="recipe" onBack={onBack} fill={false} data-testid="home-section-recipe">
      {/* §53: the proposed name is a plain editable field — no separate naming step. */}
      <input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        aria-label={homeCreatorCopy.recipe.nameLabel}
        placeholder={homeCreatorCopy.recipe.namePlaceholder}
        data-testid="home-recipe-name"
        className="w-full bg-transparent text-[24px] leading-tight font-semibold tracking-[-0.02em] outline-none sm:text-[28px]"
        style={{ color: 'var(--g-ink)' }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {/* §59: the existing 1–10 authority, never re-derived here. */}
        <span
          className="inline-flex items-center gap-1.5 text-[13px]"
          data-testid="home-recipe-score"
          aria-label={score.ariaText}
          style={{ color: score.score !== null ? 'var(--g-score-green)' : 'var(--g-text-muted)' }}
        >
          <span className="font-mono text-[15px] font-semibold">{score.display}</span>
          <span style={{ color: 'var(--g-text-muted)' }}>{score.label}</span>
        </span>
        <span
          className="text-[13px]"
          data-testid="home-recipe-machine-line"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {machineLine}
        </span>
      </div>

      {/* §54 the rows: name, grams, Crown, Topping marker. Nothing else. */}
      <ul
        className="mt-6 divide-y"
        style={{ borderColor: 'var(--g-line-quiet)' }}
        data-testid="home-recipe-lines"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 py-2.5"
            style={{ borderColor: 'var(--g-line-quiet)' }}
            data-testid="home-recipe-line"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: 'var(--g-ink)' }}>
              {item.ingredient.name}
            </span>
            {crownLineIds.includes(item.id) || mainSelectable(item.id) ? (
              <CrownControl
                lineId={item.id}
                name={item.ingredient.name}
                isMain={crownLineIds.includes(item.id)}
              />
            ) : null}
            <HomeRowAmount
              lineId={item.id}
              name={item.ingredient.name}
              grams={item.planned_grams}
              locked={item.lock_type === 'grams'}
              canSeeGrams={canSeeGrams}
              onBlocked={onGramsBlocked}
              editing={editingLineId === item.id}
              onDone={() => setEditingLineId(null)}
            />
            <RowMenu
              lineId={item.id}
              locked={item.lock_type === 'grams'}
              onChangeAmount={() => setEditingLineId(item.id)}
              onToggleLock={() =>
                useRecipeStore
                  .getState()
                  .setLockType(item.id, item.lock_type === 'grams' ? 'unlocked' : 'grams')
              }
              onRemove={() => onRemoveItem(item.id)}
            />
          </li>
        ))}
        {toppings.map((topping) => (
          <li
            key={topping.id}
            className="flex items-center gap-3 py-2.5"
            style={{ borderColor: 'var(--g-line-quiet)' }}
            data-testid="home-recipe-topping"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: 'var(--g-ink)' }}>
              {topping.ingredient.name}
              <span
                className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]"
                data-testid="home-topping-marker"
                style={{ background: 'var(--g-stepper-face)', color: 'var(--g-text-muted)' }}
              >
                {homeCreatorCopy.recipe.topping.toUpperCase()}
              </span>
            </span>
            <HomeRowAmount
              lineId={topping.id}
              name={topping.ingredient.name}
              grams={topping.planned_grams}
              locked={false}
              canSeeGrams={canSeeGrams}
              onBlocked={onGramsBlocked}
              editing={editingLineId === topping.id}
              onDone={() => setEditingLineId(null)}
            />
            <RowMenu
              lineId={topping.id}
              locked={false}
              onChangeAmount={() => setEditingLineId(topping.id)}
              onRemove={() => onRemoveItem(topping.id)}
            />
          </li>
        ))}
      </ul>

      {/* OWNER CORRECTION (HOME-UX-ADD-INGREDIENT, 2026-08-31): after the first
          ingredient it was not obvious how to add another. The add controls existed,
          but far below — past sweetness, past Przelicz, past a paragraph — so they read
          as unrelated to the list. They now sit immediately after the last row.

          ONE affordance for the section, not one per row, and it stays put at 1, 2 or
          3+ ingredients because it is a sibling of the list, not part of it. The button
          IS the canonical `ProductPickerPopover` trigger — HOME adds no selection logic.

          OWNER OVERRIDE 2026-09-02: the round icon variant produced two anonymous `+`
          buttons whose only label was hidden on mobile. They are now the canonical PILL
          trigger, so each one reads „Dodaj składnik" / „Dodaj topping" at every width.
          This does NOT reinstate the entry composer's removed refinement row — that
          screen has no recipe yet; this one does. */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2"
        data-testid="home-add-controls"
      >
        <span className="inline-flex items-center gap-2" data-testid="home-add-ingredient">
          <ProductPickerPopover
            library={library}
            scope="BASE_FORMULATION"
            triggerVariant="pill"
            behaviorContext={{
              accountId: behaviorAccountId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            sanitizeNotice={homeCustomerNotice}
            triggerLabel={homeCreatorCopy.recipe.addIngredient}
            onAdd={(ingredient, behavior) => onAddIngredient(ingredient, behavior)}
          />
        </span>
        {/* Toppings get the analogous affordance wherever toppings are offered. HOME has
            no toppings-availability gate today — the topping picker has always been
            rendered unconditionally — so this follows the SAME availability rather than
            inventing a new rule. Recorded as HOME-UX-TOPPING-GATE. */}
        <span className="inline-flex items-center gap-2" data-testid="home-add-topping">
          <ProductPickerPopover
            library={library}
            scope="POST_PROCESS_ADDON"
            triggerVariant="pill"
            behaviorContext={{
              accountId: behaviorAccountId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            sanitizeNotice={homeCustomerNotice}
            triggerLabel={homeCreatorCopy.recipe.addTopping}
            onAdd={(ingredient, behavior) => onAddTopping(ingredient, behavior)}
          />
        </span>
      </div>

      {/* §61/§62 sweetness — three choices over the existing Direction axis. */}
      <div className="mt-6" data-testid="home-sweetness">
        <p
          className="text-[11px] font-bold tracking-[0.12em] uppercase"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {homeCreatorCopy.sweetness.label}
        </p>
        <div
          role="radiogroup"
          aria-label={homeCreatorCopy.sweetness.label}
          className="mt-2 inline-flex overflow-hidden rounded-full border p-0.5"
          style={{ borderColor: 'var(--g-line)', background: 'var(--g-ivory)' }}
        >
          {HOME_SWEETNESS_ORDER.map((choice) => {
            const active = choice === activeSweetness;
            return (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`home-sweetness-${choice}`}
                onClick={() => onSweetness(choice)}
                className="min-h-[40px] rounded-full px-4 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                style={
                  active
                    ? { background: 'var(--g-ink)', color: '#ffffff' }
                    : { background: 'transparent', color: 'var(--g-ink)' }
                }
              >
                {SWEETNESS_LABEL[choice]}
              </button>
            );
          })}
        </div>
      </div>

      {/* §60: the existing Recalculate → Preview → Apply workflow, plainly worded. */}
      <HomeRecalculate />

      <div className="mt-10 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onLetsMakeIt}
          data-testid="home-lets-make-it"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ background: 'var(--g-ink)', color: '#ffffff' }}
        >
          {homeCreatorCopy.recipe.letsMakeIt}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onSave}
            data-testid="home-save-recipe"
            className={cn(
              'inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border px-5 text-[14px]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
            )}
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
          >
            {homeCreatorCopy.recipe.save}
          </button>
          {/* §52: Share appears only when the recipe is actually eligible. */}
          {canShare ? (
            <button
              type="button"
              onClick={onShare}
              data-testid="home-share-community"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border px-5 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.recipe.shareWithCommunity}
            </button>
          ) : null}
        </div>
      </div>
    </HomeSection>
  );
}
