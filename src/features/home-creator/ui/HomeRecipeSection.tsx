/**
 * §52–§62 — the live HOME recipe, as DESIGN V3.0 draws it (corrections IV, VI, XI, XII,
 * XIII): „‹ Wróć” and a light „Reset”, the name as the title, the shared score ring with
 * its fit words and the machine line, the rows, „+ Składnik” · „+ Topping” · the
 * sweetness icon, and the actions at the bottom under the thumb.
 *
 * WHAT IS DELIBERATELY ABSENT (§52): percentages, PI-ING codes, product ids, POD/PAC/
 * NPAC, solids, kcal, cost, supplier and regulatory data. None of those values is read
 * by this component — they are not hidden with CSS, they never enter the render.
 *
 * THE ROW (IV-B) is a button: the whole row opens the ingredient panel. It shows only the
 * name, „Główny” or „Topping” as information, the grams and a padlock when the amount is
 * locked. The „•••” menu, its sheet, the separate „Zmień ilość” dialog and the row's Crown
 * button are gone — every one of those actions lives in the panel (`HomeIngredientPanel`,
 * the SAME editor PRO uses), with the same doors behind it.
 *
 * A Demo line reads `••• g`. The masked state carries no input, no spinbutton and no value
 * attribute in the row, so it cannot leak a gram; the panel's amount opens masked and
 * routes to the existing entitlement behaviour.
 *
 * HOME performs no arithmetic, and owns no Main rule: the Crown reads the canonical
 * capability resolver and mutates through the canonical `setLockType`.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { EngineIngredient, RecipeItem } from '@/engine';
import { SweetnessIcon } from '@/components/icons/PinguinoIcons';
import type {
  RecipeToppingIngredient,
  RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import {
  ProductPickerPopover,
  type ProductPickerReplaceInvocation,
} from '@/features/ingredient-builder/ProductPickerPopover';
import type { IngredientLibrary } from '@/features/ingredient-builder/ingredientLibrary';
import { canonicalReplaceContext } from '@/features/ingredient-builder/canonicalProductDiscovery';
import { createReplacementSearchLineContext } from '@/features/ingredient-builder/replacementSearchContext';
import { productIdentityLines } from '@/features/ingredient-builder/productIdentityLines';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import type { TechnicalFitPresentation } from '@/features/recipe-score';
import { ScoreRing } from '@/features/pro-workbench/ScoreRing';
import { resolveMainCapability } from '@/features/product-intelligence/mainCapability';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeBehaviorContext } from '../useHomeBehaviorContext';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homeCustomerNotice } from '../homeCustomerNotice';
import { projectSweetnessForDisplay, type HomeSweetness } from '../homeSweetness';
import { HomeSection } from './HomeSection';
import { HomeIngredientPanel, type HomeIngredientPanelTarget } from './HomeIngredientPanel';
import { HomeSweetnessSheet } from './HomeSweetnessSheet';
import { HOME_SWEETNESS_STEP } from './homeSweetnessSteps';
import { HomeResetSheet } from './HomeResetSheet';
import { HomeNameSheet } from './HomeNameSheet';

const screen = homeCreatorCopy.recipeScreen;

/** Crown/Main is a role, while an exact-gram constraint is an independent padlock. */
const hasExactGramLock = (item: RecipeItem): boolean =>
  item.grams_constraint !== undefined || item.lock_type === 'grams';

/**
 * A product the customer picked that is still waiting for its amount (§B). It is NOT a
 * recipe line: the page keeps it in its amount queue and creates the line only with a
 * confirmed positive amount. The recipe shows it as „0 g · Wpisz ilość” (5B).
 */
export interface HomePendingAmount {
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly kind: 'ingredient' | 'topping';
  readonly initialGrams: number | null;
  readonly recommendedDose: string | null;
  readonly behavior: ProductBehaviorSnapshot | null;
}

type EditorTarget =
  | { readonly kind: 'line'; readonly id: string }
  | { readonly kind: 'pending'; readonly key: string };

/** The same numbers the editor renders (`decimals={0}`), so a readout never shows float noise. */
function HomeRowAmount({
  lineId,
  grams,
  locked,
  canSeeGrams,
  muted = false,
}: {
  lineId: string;
  grams: number;
  locked: boolean;
  canSeeGrams: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className="shrink-0 font-mono text-[15px] font-medium tabular-nums"
      data-testid={`home-amount-${lineId}`}
      data-locked={locked ? 'true' : undefined}
      style={{ color: muted ? '#a29d94' : 'var(--g-ink)' }}
    >
      {canSeeGrams ? Math.round(grams) : homeCreatorCopy.recipe.maskedGramsValue}{' '}
      {homeCreatorCopy.recipe.grams}
    </span>
  );
}

function LockGlyph() {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CrownGlyph() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 5.5 5.3 8 8 3l2.7 5L14 5.5l-1 6H3l-1-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One row. The whole row is the button (IV-B); „Główny” and „Topping” only inform, and
 * the padlock only says the amount is locked. Nothing in it is a control of its own.
 */
function HomeRecipeRow({
  lineId,
  name,
  grams,
  locked,
  canSeeGrams,
  chip,
  waiting = false,
  onOpen,
}: {
  lineId: string;
  name: string;
  grams: number;
  locked: boolean;
  canSeeGrams: boolean;
  chip?: 'main' | 'topping' | null;
  /** A product still waiting for its amount (5B). */
  waiting?: boolean;
  onOpen: () => void;
}) {
  const short = productIdentityLines(name).name;
  const described = [
    name,
    chip === 'main' ? homeCreatorCopy.recipe.crown : null,
    chip === 'topping' ? homeCreatorCopy.recipe.topping : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const amount = canSeeGrams
    ? `${Math.round(grams)} ${homeCreatorCopy.recipe.grams}`
    : homeCreatorCopy.recipe.maskedGrams;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`home-row-${lineId}`}
      aria-label={`${described}: ${waiting ? screen.enterAmount : amount}${
        locked ? `, ${screen.lockedAmount}` : ''
      } — ${screen.openRow}`}
      className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#efebe4] text-left transition-colors hover:bg-[#fafaf8] focus:outline-none focus-visible:bg-[#f6f5f2]"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-3">
        <span
          className="max-w-full min-w-0 truncate text-[15px] leading-[1.3] text-[var(--g-ink)]"
          title={name}
        >
          {short}
        </span>
        {chip === 'main' ? (
          <span
            className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-[#d9d5ce] px-2 text-[11.5px] leading-none font-semibold text-[#3b3833]"
            data-testid={`home-main-chip-${lineId}`}
          >
            <CrownGlyph />
            {homeCreatorCopy.recipe.crown}
          </span>
        ) : null}
        {chip === 'topping' ? (
          <span
            className="inline-flex h-[22px] shrink-0 items-center rounded-full border border-[#e4e0d9] px-2 text-[10.5px] leading-none font-bold tracking-[0.06em] text-[var(--g-text-muted)] uppercase"
            data-testid="home-topping-marker"
          >
            {homeCreatorCopy.recipe.topping}
          </span>
        ) : null}
        {waiting ? (
          <small
            className="basis-full text-[12.5px] leading-[1.2] font-medium text-[#3b3833]"
            data-testid={`home-enter-amount-${lineId}`}
          >
            {screen.enterAmount}
          </small>
        ) : null}
      </span>
      <span className="inline-flex items-center gap-1.5 py-3">
        <HomeRowAmount
          lineId={lineId}
          grams={grams}
          locked={locked}
          canSeeGrams={canSeeGrams || waiting}
          muted={waiting}
        />
        {locked ? (
          <span className="grid text-[#8a857d]" title={homeCreatorCopy.recipe.lockLabel}>
            <LockGlyph />
          </span>
        ) : null}
      </span>
    </button>
  );
}

const pillButton =
  'inline-flex h-11 min-w-0 items-center justify-center rounded-full border border-[var(--g-line)] bg-white px-2.5 text-[14px] font-semibold whitespace-nowrap text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';
const primaryButton =
  'inline-flex h-[52px] w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

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
  onRemoveTopping,
  library,
  onAddIngredient,
  onAddTopping,
  onGramsBlocked,
  onSave,
  saveNotice,
  onLetsMakeIt,
  onShare,
  onCommunity,
  onBack,
  onReset = null,
  productionActive = false,
  onResumeProduction,
  pendingAmounts = [],
  onConfirmPending,
  onRemovePending,
  onEditorOpenChange,
}: {
  name: string;
  onNameChange: (name: string) => void;
  /** The existing HOME score (`useHomeRecipeResult`) — rendered, never re-derived. */
  score: Pick<TechnicalFitPresentation, 'score' | 'label' | 'ariaText'>;
  machineLine: string;
  items: readonly RecipeItem[];
  toppings: readonly RecipeToppingItem[];
  crownLineIds: readonly string[];
  canSeeGrams: boolean;
  sweetnessStored: number;
  onSweetness: (choice: HomeSweetness) => void;
  onRemoveItem: (lineId: string) => void;
  /** A topping lives outside the Base, so it has its own store door (`removeTopping`). */
  onRemoveTopping: (lineId: string) => void;
  /** §56: the SAME Pro picker, in a simpler HOME presentation. */
  library: IngredientLibrary;
  onAddIngredient: (ingredient: EngineIngredient, behavior?: ProductBehaviorSnapshot) => void;
  /** Entitlement route when a masked gram control is operated. */
  onGramsBlocked: () => void;
  onAddTopping: (ingredient: RecipeToppingIngredient, behavior?: ProductBehaviorSnapshot) => void;
  onSave: () => void;
  /**
   * Why a save did not happen. The canonical handler already produces a customer
   * sentence; HOME simply has to show it. Without this the button looked enabled,
   * did nothing, and said nothing.
   */
  saveNotice?: string | null;
  onLetsMakeIt: () => void;
  onShare: () => void;
  onCommunity: () => void;
  onBack?: (() => void) | null;
  /** DESIGN VI: „Reset” back to an empty start. Hidden while a batch is in production. */
  onReset?: (() => void) | null;
  /** A batch of this recipe is in production (IV „Przerwanie w HOME”). */
  productionActive?: boolean;
  onResumeProduction?: () => void;
  /** Products picked but still waiting for their amount (§B, shown as 5B rows). */
  pendingAmounts?: readonly HomePendingAmount[];
  onConfirmPending?: (key: string, grams: number) => void;
  onRemovePending?: (key: string) => void;
  /** The panel is a question being answered: the page holds its automatic PRZELICZ. */
  onEditorOpenChange?: (open: boolean) => void;
}) {
  const activeSweetness = projectSweetnessForDisplay(sweetnessStored as -2 | -1 | 0 | 1 | 2);

  const {
    accountId: behaviorAccountId,
    productProfile: behaviorProfile,
    temperatureC: behaviorTemperatureC,
    mode: behaviorMode,
  } = useHomeBehaviorContext();
  // One panel at a time: the rest of the recipe stays calm under it.
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [sheet, setSheet] = useState<'sweetness' | 'reset' | 'name' | null>(null);
  const [productionNotice, setProductionNotice] = useState(false);
  const [replaceRequest, setReplaceRequest] = useState<{
    scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
    lineId: string;
    invocation: ProductPickerReplaceInvocation;
  } | null>(null);
  const replaceRequestKey = useRef(0);

  // CANONICAL authority, read straight from the store — HOME derives no Main rule of
  // its own. A line with no resolved snapshot is not selectable, which is the existing
  // fail-closed answer.
  const behaviorSnapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const mainSelectable = (lineId: string): boolean =>
    resolveMainCapability({ snapshot: behaviorSnapshots[lineId], snapshotRequired: true })
      .selectable;

  /* IV-C: a product just picked opens the panel at once, instead of „Ile chcesz dodać?”.
     Each waiting product opens once; closing it without an amount leaves its 5B row and
     the black „Ilość” to come back to it. */
  const firstPendingKey = pendingAmounts[0]?.key ?? null;
  const openedPending = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (firstPendingKey === null || openedPending.current.has(firstPendingKey)) return;
    openedPending.current.add(firstPendingKey);
    setEditor({ kind: 'pending', key: firstPendingKey });
  }, [firstPendingKey]);

  const editorOpen = editor !== null;
  useEffect(() => {
    onEditorOpenChange?.(editorOpen);
  }, [editorOpen, onEditorOpenChange]);
  useEffect(() => () => onEditorOpenChange?.(false), [onEditorOpenChange]);

  const requestBaseReplacement = (item: RecipeItem) => {
    const filters = canonicalReplaceContext({
      displayName: item.ingredient.name,
      category: item.ingredient.category,
      productForm: item.ingredient.source_subcategory,
    });
    replaceRequestKey.current += 1;
    setReplaceRequest({
      scope: 'BASE_FORMULATION',
      lineId: item.id,
      invocation: {
        key: replaceRequestKey.current,
        context: filters,
        currentLine: createReplacementSearchLineContext({
          usageMode: 'HOME_REPLACE',
          lineId: item.id,
          ingredient: item.ingredient,
          snapshot: behaviorSnapshots[item.id],
          recipeProfile: behaviorProfile,
          currentRole: crownLineIds.includes(item.id) ? 'MAIN' : 'STANDARD',
          processScope: 'BASE_FORMULATION',
          temperatureC: behaviorTemperatureC,
          formulationMode: behaviorMode,
          userFilters: filters,
          plannedGrams: item.planned_grams,
          actualGrams: item.actual_grams,
          lockType: item.lock_type,
        }),
      },
    });
  };

  const requestToppingReplacement = (topping: RecipeToppingItem) => {
    const filters = canonicalReplaceContext(
      isCatalogLabelToppingIngredient(topping.ingredient)
        ? { displayName: topping.ingredient.name, category: 'other', productForm: 'topping' }
        : {
            displayName: topping.ingredient.name,
            category: topping.ingredient.category,
            productForm: topping.ingredient.source_subcategory,
          },
    );
    replaceRequestKey.current += 1;
    setReplaceRequest({
      scope: 'POST_PROCESS_ADDON',
      lineId: topping.id,
      invocation: {
        key: replaceRequestKey.current,
        context: filters,
        currentLine: createReplacementSearchLineContext({
          usageMode: 'HOME_REPLACE',
          lineId: topping.id,
          ingredient: topping.ingredient,
          snapshot: behaviorSnapshots[topping.id],
          recipeProfile: behaviorProfile,
          currentRole: 'TOPPING',
          processScope: 'POST_PROCESS_ADDON',
          temperatureC: behaviorTemperatureC,
          formulationMode: behaviorMode,
          userFilters: filters,
          plannedGrams: topping.planned_grams,
          actualGrams: topping.actual_grams,
          lockType: null,
        }),
      },
    });
  };

  /**
   * What the open panel edits, resolved to the authority that owns its grams. A recipe
   * line and a topping live in DIFFERENT store collections with DIFFERENT actions, so the
   * descriptor carries the commit rather than the panel guessing (#207).
   */
  const panelTarget: HomeIngredientPanelTarget | null = (() => {
    if (editor === null) return null;
    if (editor.kind === 'pending') {
      const pending = pendingAmounts.find((entry) => entry.key === editor.key);
      if (!pending) return null;
      return {
        key: pending.key,
        name: pending.name,
        category: pending.category,
        kind: pending.kind,
        pending: true,
        // A topping's question starts at its canonical 5 % (`initialGrams`); a Base
        // product's question starts empty, exactly as the prompt did.
        grams: pending.initialGrams ?? 0,
        behavior: pending.behavior,
        recommendedDose: pending.recommendedDose,
        commit: (next: number) => onConfirmPending?.(pending.key, next),
        onRemove: () => onRemovePending?.(pending.key),
      };
    }
    const item = items.find((line) => line.id === editor.id);
    if (item) {
      const gramsLocked = hasExactGramLock(item);
      const isMain = crownLineIds.includes(item.id);
      return {
        key: item.id,
        name: item.ingredient.name,
        category: item.ingredient.category,
        kind: 'ingredient',
        pending: false,
        grams: item.planned_grams,
        locked: gramsLocked,
        onToggleLock: () =>
          // The padlock owns only the exact constraint. `setGramLock` keeps a
          // simultaneous Crown/Main role intact in both directions.
          useRecipeStore.getState().setGramLock(item.id, gramsLocked ? null : item.planned_grams),
        // Only where Main is currently held or canonically selectable.
        crown:
          crownLineIds.includes(item.id) || mainSelectable(item.id)
            ? {
                isMain,
                onToggle: () => {
                  const lineId = item.id;
                  /* HOME surface: HOME's own Crown rules apply here and never reach PRO. */
                  useRecipeStore
                    .getState()
                    .setLockType(lineId, isMain ? 'unlocked' : 'main', 'home');
                },
              }
            : null,
        onReplace: () => {
          setEditor(null);
          requestBaseReplacement(item);
        },
        behavior: behaviorSnapshots[item.id] ?? null,
        commit: (next: number) => useRecipeStore.getState().setExactGrams(item.id, next),
        onRemove: () => onRemoveItem(item.id),
      };
    }
    const topping = toppings.find((line) => line.id === editor.id);
    if (topping) {
      // A topping has no padlock and no Crown — rendering dead controls would be worse
      // than omitting them.
      return {
        key: topping.id,
        name: topping.ingredient.name,
        // A catalogue label topping carries no category — the same `other` the Replace
        // context uses for it.
        category: isCatalogLabelToppingIngredient(topping.ingredient)
          ? 'other'
          : topping.ingredient.category,
        kind: 'topping',
        pending: false,
        grams: topping.planned_grams,
        locked: false,
        onToggleLock: undefined,
        crown: null,
        onReplace: () => {
          setEditor(null);
          requestToppingReplacement(topping);
        },
        behavior: behaviorSnapshots[topping.id] ?? null,
        commit: (next: number) => useRecipeStore.getState().setToppingGrams(topping.id, next),
        onRemove: () => onRemoveTopping(topping.id),
      };
    }
    return null;
  })();

  /** IV „Przerwanie w HOME”: during production a row explains instead of opening. */
  const openLine = (id: string) => {
    if (productionActive) {
      setProductionNotice(true);
      return;
    }
    setEditor({ kind: 'line', id });
  };

  const basePending = pendingAmounts.filter((entry) => entry.kind === 'ingredient');
  const toppingPending = pendingAmounts.filter((entry) => entry.kind === 'topping');
  const firstPending = pendingAmounts[0] ?? null;
  const sweetnessStep = HOME_SWEETNESS_STEP[activeSweetness];

  return (
    <HomeSection
      id="recipe"
      fill={false}
      productPickerWidthAnchor
      data-testid="home-section-recipe"
    >
      {/* VI — „‹ Wróć” and a light „Reset” pill on one line; Reset is hidden in production. */}
      <div className="-mt-8 mb-1 flex min-h-11 items-center justify-between gap-3 lg:-mt-12">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            data-testid="home-back-recipe"
            className="-ml-2.5 inline-flex min-h-11 items-center gap-0.5 rounded-full py-0 pr-3 pl-1.5 text-[15px] font-semibold text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M10 3 5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {homeCreatorCopy.nav.back}
          </button>
        ) : (
          <span />
        )}
        {onReset && !productionActive ? (
          <button
            type="button"
            onClick={() => setSheet('reset')}
            data-testid="home-reset"
            aria-haspopup="dialog"
            className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold text-[#3b3833] shadow-[inset_0_0_0_1px_#e4e0d9] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            {screen.reset}
          </button>
        ) : null}
      </div>

      {/* §53 + DESIGN: the name is the title; a tap opens the bottom name panel. */}
      <button
        type="button"
        onClick={() => setSheet('name')}
        aria-label={screen.nameEdit}
        aria-haspopup="dialog"
        data-testid="home-recipe-name-open"
        className="flex w-full items-center gap-2 py-1 text-left text-[24px] leading-[1.2] tracking-[-0.02em] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        <span
          className={cn(
            'min-w-0 truncate',
            name ? 'font-semibold text-[var(--g-ink)]' : 'font-medium text-[#8a857d]',
          )}
          data-testid="home-recipe-title"
        >
          {name || homeCreatorCopy.recipe.namePlaceholder}
        </span>
        <svg
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0 text-[#8a857d]"
        >
          <path
            d="m10.5 3 2.5 2.5L6 12.5 3 13l.5-3L10.5 3Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* §59 + DESIGN: the shared score ring and fit words — the existing authority,
          never re-derived here — with the machine line under them. */}
      <div
        className="mt-2.5 mb-3 flex items-center gap-3 rounded-2xl border border-[#ebe7e0] bg-white px-3.5 py-3"
        data-testid="home-recipe-score"
        aria-label={score.ariaText}
      >
        <ScoreRing score={score.score} testId="home-score-ring" />
        <div className="min-w-0">
          <b className="block text-[16px] leading-[1.25] font-semibold text-[var(--g-ink)]">
            {score.label}
          </b>
          <small
            className="mt-0.5 block text-[13.5px] leading-[1.3] text-[var(--g-text-muted)]"
            data-testid="home-recipe-machine-line"
          >
            {machineLine}
          </small>
        </div>
      </div>

      {/* §54 the rows: name, „Główny” / „Topping”, grams, padlock. Nothing else. */}
      <ul className="border-t border-[#efebe4]" data-testid="home-recipe-lines">
        {items.map((item) => (
          <li key={item.id} data-testid="home-recipe-line" data-line-id={item.id}>
            <HomeRecipeRow
              lineId={item.id}
              name={item.ingredient.name}
              grams={item.planned_grams}
              locked={hasExactGramLock(item)}
              canSeeGrams={canSeeGrams}
              chip={crownLineIds.includes(item.id) ? 'main' : null}
              onOpen={() => openLine(item.id)}
            />
          </li>
        ))}
        {basePending.map((pending) => (
          <li key={pending.key} data-testid="home-recipe-pending" data-line-id={pending.key}>
            <HomeRecipeRow
              lineId={pending.key}
              name={pending.name}
              grams={0}
              locked={false}
              canSeeGrams={canSeeGrams}
              waiting
              onOpen={() => setEditor({ kind: 'pending', key: pending.key })}
            />
          </li>
        ))}
        {toppings.map((topping) => (
          <li key={topping.id} data-testid="home-recipe-topping" data-line-id={topping.id}>
            <HomeRecipeRow
              lineId={topping.id}
              name={topping.ingredient.name}
              grams={topping.planned_grams}
              locked={false}
              canSeeGrams={canSeeGrams}
              chip="topping"
              onOpen={() => openLine(topping.id)}
            />
          </li>
        ))}
        {toppingPending.map((pending) => (
          <li key={pending.key} data-testid="home-recipe-pending" data-line-id={pending.key}>
            <HomeRecipeRow
              lineId={pending.key}
              name={pending.name}
              grams={0}
              locked={false}
              canSeeGrams={canSeeGrams}
              chip="topping"
              waiting
              onOpen={() => setEditor({ kind: 'pending', key: pending.key })}
            />
          </li>
        ))}
      </ul>

      {productionNotice && productionActive ? (
        <p
          className="mt-3 text-[13px] leading-snug text-[var(--g-text-secondary)]"
          role="status"
          aria-live="polite"
          data-testid="home-production-lock-notice"
        >
          {screen.inProduction}
        </p>
      ) : null}

      {/* The add actions sit right after the last row (HOME-UX-ADD-INGREDIENT) — ONE per
          section. Each IS the canonical `ProductPickerPopover` trigger; HOME adds no
          selection logic. XI: the sweetness icon stands beside them instead of a row. */}
      <div
        className="mt-3.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] items-center gap-2"
        data-testid="home-add-controls"
      >
        <span className="min-w-0" data-testid="home-add-ingredient">
          <ProductPickerPopover
            library={library}
            scope="BASE_FORMULATION"
            triggerVariant="pill"
            triggerAppearance="home"
            triggerText={screen.addIngredientShort}
            layout="home"
            sheetTitle={homeCreatorCopy.recipe.addIngredient}
            sheetSubtitle={screen.addIngredientSubtitle}
            className="w-full"
            behaviorContext={{
              accountId: behaviorAccountId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            sanitizeNotice={homeCustomerNotice}
            triggerLabel={homeCreatorCopy.recipe.addIngredient}
            replaceInvocation={
              replaceRequest?.scope === 'BASE_FORMULATION' ? replaceRequest.invocation : null
            }
            onClose={() => setReplaceRequest(null)}
            onAdd={(ingredient, behavior) => {
              if (replaceRequest?.scope !== 'BASE_FORMULATION') {
                onAddIngredient(ingredient, behavior);
                return;
              }
              const replaced = useRecipeStore
                .getState()
                .replaceIngredient(replaceRequest.lineId, ingredient, behavior);
              return replaced ? { focusLineId: replaceRequest.lineId } : undefined;
            }}
          />
        </span>
        {/* Toppings get the analogous affordance wherever toppings are offered. HOME has
            no toppings-availability gate today — the topping picker has always been
            rendered unconditionally — so this follows the SAME availability rather than
            inventing a new rule. Recorded as HOME-UX-TOPPING-GATE. */}
        <span className="min-w-0" data-testid="home-add-topping">
          <ProductPickerPopover
            library={library}
            scope="POST_PROCESS_ADDON"
            triggerVariant="pill"
            triggerAppearance="home"
            triggerText={screen.addToppingShort}
            layout="home"
            sheetTitle={homeCreatorCopy.recipe.addTopping}
            sheetSubtitle={screen.addToppingSubtitle}
            className="w-full"
            behaviorContext={{
              accountId: behaviorAccountId,
              productProfile: behaviorProfile,
              temperatureC: behaviorTemperatureC,
              mode: behaviorMode,
            }}
            sanitizeNotice={homeCustomerNotice}
            triggerLabel={homeCreatorCopy.recipe.addTopping}
            replaceInvocation={
              replaceRequest?.scope === 'POST_PROCESS_ADDON' ? replaceRequest.invocation : null
            }
            onClose={() => setReplaceRequest(null)}
            onAdd={(ingredient, behavior) => {
              if (replaceRequest?.scope !== 'POST_PROCESS_ADDON') {
                onAddTopping(ingredient, behavior);
                return;
              }
              useRecipeStore
                .getState()
                .replaceToppingIngredient(replaceRequest.lineId, ingredient, behavior);
              return { focusLineId: replaceRequest.lineId };
            }}
          />
        </span>
        {/* §61/§62 + XI — sweetness is an icon (the canonical `SweetnessIcon` in its
            family colour) that opens its own layer; a small black mark shows a choice
            other than „Optymalne”. */}
        <button
          type="button"
          onClick={() => setSheet('sweetness')}
          aria-haspopup="dialog"
          aria-label={`${homeCreatorCopy.sweetness.label}: ${sweetnessStep}`}
          title={homeCreatorCopy.sweetness.label}
          data-testid="home-sweetness-open"
          data-sweetness={activeSweetness}
          className="relative grid size-12 place-items-center rounded-full border border-[var(--g-line)] bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <SweetnessIcon className="size-5" />
          {activeSweetness !== 'balanced' ? (
            <span
              aria-hidden
              data-testid="home-sweetness-badge"
              className="absolute -top-1.5 -right-1.5 h-[18px] min-w-6 rounded-full bg-[var(--g-ink)] px-[5px] text-center text-[10.5px] leading-[18px] font-bold text-white shadow-[0_0_0_2px_#fff]"
            >
              {sweetnessStep}
            </span>
          ) : null}
        </button>
      </div>

      {/* Served: „Zapisz recepturę” could refuse and say nothing at all — the canonical
          handler already produced a customer sentence and HOME dropped it, so the
          button looked enabled, did nothing, and explained nothing. */}
      {saveNotice ? (
        <p
          className="mt-3 text-[13px] leading-snug"
          data-testid="home-save-notice"
          role="status"
          aria-live="polite"
          style={{ color: 'var(--g-attention-ink)' }}
        >
          {saveNotice}
        </p>
      ) : null}

      {/* The bottom actions (DESIGN IV + „HOME — zmiany”): Zapisz · Udostępnij · Community
          over ONE black action. Sticky at the bottom of the viewport while the recipe is
          on screen and part of the flow — it takes its own height, so it never covers the
          last row — and clear of the home indicator. */}
      <div
        className="sticky bottom-0 z-20 -mx-5 mt-6 -mb-10 grid gap-2.5 bg-white px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-1px_0_#efebe4] sm:-mx-6 sm:px-6 lg:-mb-16"
        data-testid="home-recipe-actions"
      >
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSave}
            data-testid="home-save-recipe"
            className={pillButton}
          >
            {screen.save}
          </button>
          <button
            type="button"
            onClick={onShare}
            data-testid="home-share-recipe"
            className={pillButton}
          >
            {screen.share}
          </button>
          <button
            type="button"
            onClick={onCommunity}
            data-testid="home-publish-community"
            className={pillButton}
          >
            {screen.community}
          </button>
        </div>
        {productionActive ? (
          <button
            type="button"
            onClick={onResumeProduction}
            data-testid="home-back-to-production"
            className={primaryButton}
            style={{ background: 'var(--g-ink)', color: '#ffffff' }}
          >
            {screen.backToProduction}
          </button>
        ) : firstPending ? (
          /* 5B — a product without an amount: the one black action is „Ilość”. */
          <button
            type="button"
            onClick={() => setEditor({ kind: 'pending', key: firstPending.key })}
            data-testid="home-enter-amount"
            className={primaryButton}
            style={{ background: 'var(--g-ink)', color: '#ffffff' }}
          >
            {screen.amountCta}
          </button>
        ) : (
          <button
            type="button"
            onClick={onLetsMakeIt}
            data-testid="home-lets-make-it"
            className={primaryButton}
            style={{ background: 'var(--g-ink)', color: '#ffffff' }}
          >
            {homeCreatorCopy.recipe.letsMakeIt}
          </button>
        )}
      </div>

      {panelTarget ? (
        <HomeIngredientPanel
          key={panelTarget.key}
          target={panelTarget}
          canSeeGrams={canSeeGrams}
          onBlocked={onGramsBlocked}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {sheet === 'sweetness' ? (
        <HomeSweetnessSheet
          stored={sweetnessStored}
          onChoose={onSweetness}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'reset' && onReset ? (
        <HomeResetSheet
          onCancel={() => setSheet(null)}
          onReset={() => {
            setSheet(null);
            onReset();
          }}
        />
      ) : null}

      {sheet === 'name' ? (
        <HomeNameSheet
          name={name}
          onCancel={() => setSheet(null)}
          onDone={(next) => {
            onNameChange(next);
            setSheet(null);
          }}
        />
      ) : null}
    </HomeSection>
  );
}
