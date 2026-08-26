import { useState } from 'react';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem, LockType } from '@/engine';
import { cn } from '@/lib/cn';
import { iconButtonClasses } from '@/components/ui/buttonStyles';
import { effectiveCostForIngredient } from '@/features/pro-core/effectiveRecipePricing';
import { effectiveLineCost } from '@/features/pro-core/costing';
import {
  CustomerPriceEditor,
  IngredientPriceCell,
  type IngredientPriceView,
} from './IngredientPriceControl';
import {
  productionStepForGrams,
  productionTopUpGrams,
  type ProductionLineState,
} from '@/features/production-workspace/productionSession';
import {
  DEFAULT_INGREDIENT_ROW_META,
  customerRoleFor,
  requiredRemovalRoute,
  type IngredientCustomerRole,
  type IngredientRowMeta,
  type SubstituteCandidate,
} from './ingredientTableUx';
import { DialogShell } from '@/components/ui/DialogShell';
import { HoverPreview } from '@/components/ui/HoverPreview';
import { DirectNumberControl } from './DirectNumberControl';
import {
  MainRoleBadge,
  MainRoleTrigger,
  MobileIngredientLine,
  MobileIngredientSheet,
} from './IngredientLineControls';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import {
  ProductionActualControl,
  ProductionConfirmationAction,
} from '@/features/production-workspace/ProductionActualControl';
import { productProcessPl, productRecommendedDosagePl } from '@/features/product-intelligence';
import { useRecipeStore } from '@/stores/recipeStore';

const b = copy.studio.builder;
const t = b.ingredientTable;

export type IngredientTableMode = 'recipe' | 'production';

/**
 * Recipe mode only: Ingredient | % + lock | quantity + lock/unit | price | menu.
 *
 * DENSITY (owner 2026-08-24): the controls used to own 512 px of every row
 * (192 + 204 + 72 + 44), which left real catalog names — "CREAM 30% · Mlekovita
 * Cream · Chilled" — truncated after a few words. The compact stepper density
 * and a tighter price cell give that space back to the NAME, which is the row's
 * primary identity: the name column's floor roughly doubles (164 → 300 px, and
 * 260 → 400 px at 2xl) without removing any information.
 */
export const ROW_GRID =
  'grid grid-cols-1 items-center gap-x-2 gap-y-3 md:grid-cols-[minmax(300px,1fr)_142px_150px_96px_28px] 2xl:grid-cols-[minmax(400px,1fr)_142px_150px_96px_28px]';
export const COMPACT_ROW_GRID =
  'grid grid-cols-1 items-center gap-x-2 gap-y-3 md:grid-cols-[minmax(300px,1fr)_142px_150px_96px_28px]';
export const PRODUCTION_ROW_GRID = ROW_GRID;

export interface IngredientRowActions {
  setPlannedGrams: (lineId: string, grams: number) => void;
  setPlannedPercent?: (lineId: string, percent: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  setMainIngredient: (lineId: string) => void;
  setStandardIngredient?: (lineId: string) => void;
  setMainRatioWeight?: (lineId: string, weight: number | null) => void;
  removeItem: (lineId: string) => void;
  setCustomerRole?: (lineId: string, role: 'main' | IngredientCustomerRole) => void;
  toggleRequired?: (lineId: string) => void;
  setIngredientUnavailable?: (lineId: string, unavailable: boolean) => void;
  removeRequiredIngredient?: (lineId: string, name: string) => void;
  requestSubstitutes?: (lineId: string) => Promise<readonly SubstituteCandidate[]>;
  selectSubstitute?: (
    lineId: string,
    candidate: SubstituteCandidate,
    mainIdentityConfirmed: boolean,
  ) => void | Promise<void>;
  /** Retained store capability; Recipe mode intentionally no longer calls it. */
  markIngredientUnavailable?: (lineId: string) => void;
  moveUp?: (lineId: string) => void;
  moveDown?: (lineId: string) => void;
}

export function MainRatioEditor({
  item,
  actions,
}: {
  item: EffectiveRecipeItem;
  actions: IngredientRowActions;
}) {
  return (
    <label className="block px-2 pb-2 text-xs text-stone-600">
      Waga proporcji
      <input
        type="number"
        min="0.1"
        step="0.1"
        inputMode="decimal"
        value={item.main_ratio_weight ?? 1}
        aria-label={`${item.ingredient.name} — waga proporcji Main`}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          if (Number.isFinite(value) && value > 0) {
            actions.setMainRatioWeight?.(item.id, value);
          }
        }}
        className="pro-focus-ring mt-1 h-11 w-full rounded-lg border border-ink/12 bg-white px-3 font-mono text-sm text-ink"
      />
      <span className="mt-1 block leading-relaxed text-stone-500">
        Waga odzwierciedla bieżącą proporcję gramów. Możesz ją też ustawić ręcznie.
      </span>
    </label>
  );
}

export interface ProductionRowActions {
  setDraftActual: (lineId: string, grams: number) => void;
  confirmLine: (lineId: string) => void;
  reopenRecord: (lineId: string) => void;
  /** §12/§20 — the operator physically added the missing grams. */
  topUpLine?: (lineId: string, totalGrams: number) => void;
  disabled?: boolean;
  /** A completed run is an immutable visual record, not an editing surface. */
  settled?: boolean;
}

export interface IngredientRowLockView {
  state: 'ai' | 'locked' | 'percent' | 'range';
  lockedGramsLabel: string | null;
  ariaLabel: string;
  title: string;
  badge: string | null;
  plannedDisabled: boolean;
  toggleDisabled: boolean;
  onToggle: () => void;
  percentLocked?: boolean;
  percentLabel?: string;
  percentToggleDisabled?: boolean;
  onTogglePercent?: () => void;
  /** Canonical gram bounds while a §17 range remains editable. */
  minGrams?: number;
  maxGrams?: number;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase md:hidden">
      {children}
    </span>
  );
}

/** The shared modal primitive, re-exported so existing line dialogs keep one import. */
export { DialogShell };

export function SubstituteDialog({
  ingredientName,
  candidates,
  loading = false,
  onUse,
  onClose,
}: {
  ingredientName: string;
  candidates: readonly SubstituteCandidate[];
  loading?: boolean;
  onUse?: (candidate: SubstituteCandidate, mainIdentityConfirmed: boolean) => void;
  onClose: () => void;
}) {
  const [mainIdentityConfirmed, setMainIdentityConfirmed] = useState(false);
  const hasMainCandidate = candidates.some((candidate) => candidate.requiresMainConfirmation);
  return (
    <DialogShell
      label={t.substituteDialog.title(ingredientName)}
      testId="ingredient-substitute-dialog"
      onClose={onClose}
    >
      {loading ? (
        <p className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
          {t.substituteDialog.pending}
        </p>
      ) : null}
      <h2 className="mt-2 text-lg font-semibold">{t.substituteDialog.title(ingredientName)}</h2>
      {loading ? (
        <p className="mt-4 text-sm text-stone-600">Sprawdzam zweryfikowane źródła…</p>
      ) : candidates.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-stone-600">{t.substituteDialog.intro}</p>
          {hasMainCandidate ? (
            <label className="mt-4 flex items-start gap-2 border border-nonprod/30 bg-nonprod/[0.045] p-3 text-xs leading-relaxed text-ink">
              <input
                type="checkbox"
                checked={mainIdentityConfirmed}
                onChange={(event) => setMainIdentityConfirmed(event.currentTarget.checked)}
                className="mt-0.5"
              />
              <span>{t.substituteDialog.mainConfirmation}</span>
            </label>
          ) : null}
          <ol className="mt-4 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="border border-ink/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">{candidate.name}</strong>
                    <p className="mt-1 text-xs font-semibold text-stone-600">
                      {candidate.fit === 'direct'
                        ? t.substituteDialog.direct
                        : t.substituteDialog.reformulation}
                    </p>
                    <p className="mt-2 text-xs text-stone-600">{candidate.expectedImpact}</p>
                    <p className="mt-1 text-xs text-stone-600">{candidate.compatibility}</p>
                  </div>
                  <button
                    type="button"
                    disabled={candidate.requiresMainConfirmation && !mainIdentityConfirmed}
                    onClick={() => onUse?.(candidate, mainIdentityConfirmed)}
                    className="min-h-11 shrink-0 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {t.substituteDialog.use}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="mt-4 border border-nonprod/30 bg-nonprod/[0.045] p-3">
          <p className="text-sm leading-relaxed text-nonprod">{t.substituteDialog.pendingBody}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-5 min-h-11 rounded-lg border border-ink/20 px-4 py-2 text-xs font-semibold"
      >
        {t.substituteDialog.cancel}
      </button>
    </DialogShell>
  );
}

export function RequiredRemovalDialog({
  ingredientName,
  candidates,
  confirmDestructive = false,
  onFindSubstitute,
  onRequestDestructive,
  onConfirmDestructive,
  onClose,
}: {
  ingredientName: string;
  candidates: readonly SubstituteCandidate[];
  confirmDestructive?: boolean;
  onFindSubstitute: () => void;
  onRequestDestructive: () => void;
  onConfirmDestructive: () => void;
  onClose: () => void;
}) {
  const route = requiredRemovalRoute(true, candidates);
  if (confirmDestructive) {
    return (
      <DialogShell
        label={t.requiredDialog.confirmTitle}
        testId="required-removal-confirm-dialog"
        onClose={onClose}
      >
        <h2 className="text-lg font-semibold">{t.requiredDialog.confirmTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          {t.requiredDialog.confirmBody}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-ink/20 px-4 py-2 text-xs font-semibold"
          >
            {t.requiredDialog.keep}
          </button>
          <button
            type="button"
            onClick={onConfirmDestructive}
            className="min-h-11 rounded-lg border border-status-error/45 bg-status-error px-4 py-2 text-xs font-semibold text-white"
          >
            {t.requiredDialog.confirm}
          </button>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell label={t.requiredDialog.title} testId="required-removal-dialog" onClose={onClose}>
      <p className="text-xs font-semibold tracking-[0.04em] text-status-error uppercase">
        {ingredientName}
      </p>
      <h2 className="mt-2 text-lg font-semibold">{t.requiredDialog.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{t.requiredDialog.body}</p>
      {route === 'offer-substitute' ? (
        <div className="mt-4 border border-ink/10 p-3">
          <p className="text-sm font-semibold">{t.requiredDialog.substituteAvailable}</p>
          <button
            type="button"
            onClick={onFindSubstitute}
            className="mt-3 min-h-11 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white"
          >
            {t.recipe.findSubstitute}
          </button>
        </div>
      ) : (
        <div className="mt-4 border border-status-error/25 bg-status-error/[0.045] p-3">
          <p className="text-sm font-semibold text-status-error">{t.requiredDialog.noSubstitute}</p>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            {t.requiredDialog.noSubstituteBody}
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-ink/20 px-4 py-2 text-xs font-semibold"
        >
          {route === 'offer-substitute' ? t.substituteDialog.cancel : t.requiredDialog.keep}
        </button>
        {route === 'no-substitute' ? (
          <button
            type="button"
            onClick={onRequestDestructive}
            className="min-h-11 rounded-lg border border-status-error/45 px-4 py-2 text-xs font-semibold text-status-error"
          >
            {t.requiredDialog.removeInfeasible}
          </button>
        ) : null}
      </div>
    </DialogShell>
  );
}

function IngredientDataDialog({
  item,
  onClose,
}: {
  item: EffectiveRecipeItem;
  onClose: () => void;
}) {
  const estimated = !item.ingredient.is_verified || item.ingredient.confidence_score < 90;
  // Product information the manufacturer supplied. It is shown because it is
  // useful to know, and for no other reason: neither line decides anything
  // about this recipe (owner decision, 2026-08-23).
  const behavior = useRecipeStore((state) => state.productBehaviorSnapshots[item.id]);
  const rows = [
    [t.data.source, item.ingredient.source_type || 'Baza PINGÜINO'],
    [t.data.status, estimated ? t.data.estimated : t.data.verified],
    [t.data.confidence, `${item.ingredient.confidence_score}%`],
    [t.data.process, productProcessPl(behavior)],
    [t.data.recommendedDosage, productRecommendedDosagePl(behavior)],
    [t.data.id, item.ingredient.canonical_ingredient_id ?? item.ingredient.id],
  ];
  return (
    <DialogShell
      label={`${t.data.open}: ${item.ingredient.name}`}
      testId="ingredient-data-dialog"
      onClose={onClose}
    >
      <h2 className="text-lg font-semibold">{item.ingredient.name}</h2>
      <dl className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_1fr] gap-3 py-2 text-xs">
            <dt className="text-stone-500">{label}</dt>
            <dd className="break-all font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 min-h-11 rounded-lg border border-ink/20 px-4 py-2 text-xs font-semibold"
      >
        {t.substituteDialog.cancel}
      </button>
    </DialogShell>
  );
}

function RecipeRow({
  item,
  totalBatchG,
  actions,
  lock,
  meta,
  substituteCandidates,
  priceView,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDrop,
  mainUnavailableReason,
  mainUserHeld = false,
  compact,
  changed,
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  meta: IngredientRowMeta;
  substituteCandidates: readonly SubstituteCandidate[];
  priceView?: IngredientPriceView;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart?: (lineId: string) => void;
  onDrop?: (lineId: string) => void;
  mainUnavailableReason?: string | null;
  /** GLOBAL MAIN AUTHORITY §5/§6: a semantically valid Main with no approved
   * envelope. The owner may select it; PINGÜINO will not resize it by itself. */
  mainUserHeld?: boolean;
  compact: boolean;
  /** Presentation-only §8 marker: this line differs from the last clean state. */
  changed: boolean;
}) {
  const unit = 'g' as const;
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<
    'substitute' | 'required' | 'required-confirm' | 'data' | null
  >(null);
  const closeLineMenus = () => {
    setRowMenuOpen(false);
    setMobileSheetOpen(false);
  };
  const [loadedSubstitutes, setLoadedSubstitutes] =
    useState<readonly SubstituteCandidate[]>(substituteCandidates);
  const [substitutesLoading, setSubstitutesLoading] = useState(false);
  const share = totalBatchG > 0 ? (item.effective_grams / totalBatchG) * 100 : null;
  const role = customerRoleFor(item.lock_type, meta);
  const isMain = role === 'main';
  const required = meta.required || item.lock_type === 'required';
  const rangeLocked = lock?.state === 'range' || item.range_constraint !== undefined;
  const gramsLocked = !rangeLocked && (lock?.state === 'locked' || item.lock_type === 'grams');
  const estimated = !item.ingredient.is_verified || item.ingredient.confidence_score < 90;
  const displayQuantity = item.planned_grams;
  const baseCost = priceView?.cost ?? effectiveCostForIngredient(item.ingredient, {});
  const resolvedPriceView =
    priceView ??
    ({
      cost: baseCost,
      lineCost: effectiveLineCost(item.effective_grams, baseCost),
      canEdit: false,
    } satisfies IngredientPriceView);

  const setRole = (nextRole: 'main' | IngredientCustomerRole) => {
    if (actions.setCustomerRole) actions.setCustomerRole(item.id, nextRole);
    else if (nextRole === 'main') actions.setMainIngredient(item.id);
    else if (isMain) {
      if (actions.setStandardIngredient) actions.setStandardIngredient(item.id);
      else actions.setLockType(item.id, 'unlocked');
    }
  };

  const requestRemove = () => {
    closeLineMenus();
    if (requiredRemovalRoute(required, substituteCandidates) === 'normal-remove') {
      actions.removeItem(item.id);
      return;
    }
    setDialog('required');
  };

  const openSubstitute = () => {
    closeLineMenus();
    setDialog('substitute');
    if (!actions.requestSubstitutes) return;
    setSubstitutesLoading(true);
    void actions
      .requestSubstitutes(item.id)
      .then(setLoadedSubstitutes)
      .catch(() => setLoadedSubstitutes([]))
      .finally(() => setSubstitutesLoading(false));
  };

  // ONE options model. The desktop ••• dialog and the mobile ingredient sheet
  // render exactly this list — never two divergent menus (owner §16).
  const optionsList = (
    <>
      <MenuHeading>{t.role.heading}</MenuHeading>
      <MenuButton
        selected={role === 'main'}
        disabled={Boolean(mainUnavailableReason)}
        onClick={() => {
          setRole('main');
          closeLineMenus();
        }}
      >
        {t.role.main}
      </MenuButton>
      {mainUnavailableReason ? (
        <p className="px-3 pb-2 text-xs leading-relaxed text-status-error" role="status">
          {mainUnavailableReason}
        </p>
      ) : null}
      <MenuButton
        selected={role === 'standard'}
        onClick={() => {
          setRole('standard');
          closeLineMenus();
        }}
      >
        {t.role.standard}
      </MenuButton>

      {isMain ? (
        <>
          <MenuDivider />
          <MenuHeading>Proporcja grupy Głównej</MenuHeading>
          <MainRatioEditor item={item} actions={actions} />
        </>
      ) : null}

      <MenuDivider />
      <MenuHeading>Kolejność</MenuHeading>
      <MenuButton
        disabled={!canMoveUp}
        onClick={() => {
          actions.moveUp?.(item.id);
          closeLineMenus();
        }}
      >
        Przesuń wyżej
      </MenuButton>
      <MenuButton
        disabled={!canMoveDown}
        onClick={() => {
          actions.moveDown?.(item.id);
          closeLineMenus();
        }}
      >
        Przesuń niżej
      </MenuButton>

      <MenuDivider />
      <MenuHeading>{t.recipe.heading}</MenuHeading>
      <MenuButton
        selected={required}
        onClick={() => {
          actions.toggleRequired?.(item.id);
          closeLineMenus();
        }}
      >
        {required ? t.recipe.requiredOn : t.recipe.requiredOff}
      </MenuButton>
      <MenuButton
        selected={meta.unavailable}
        onClick={() => actions.setIngredientUnavailable?.(item.id, !meta.unavailable)}
      >
        {meta.unavailable ? t.recipe.available : t.recipe.unavailable}
      </MenuButton>
      <button
        type="button"
        onClick={openSubstitute}
        className="min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-ink hover:bg-stone-50"
      >
        {t.recipe.findSubstitute}
      </button>

      <MenuDivider />
      <MenuHeading>{t.data.heading}</MenuHeading>
      <MenuButton
        onClick={() => {
          closeLineMenus();
          setDialog('data');
        }}
      >
        {t.data.open}
      </MenuButton>
      <CustomerPriceEditor view={priceView} lineId={item.id} />

      <MenuDivider />
      <MenuHeading>{t.remove.heading}</MenuHeading>
      <button
        type="button"
        onClick={requestRemove}
        className="min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-status-error hover:bg-status-error/[0.05]"
      >
        {t.remove.action}
      </button>
    </>
  );

  return (
    <>
      {/* PHONE + TABLET (< lg) — the COLLAPSED line: name · % · g. Everything
          else is one tap away in the ingredient sheet, so the recipe stays
          scannable (§7). The breakpoint is `lg`, not `md`: between 768 and
          1024 px the five-column table can only fit by truncating ingredient
          names, which is exactly the squeeze §5 forbids. */}
      <div className="lg:hidden">
        <MobileIngredientLine
          item={item}
          percent={share}
          isMain={isMain}
          required={required}
          unavailable={meta.unavailable}
          estimated={estimated}
          changed={changed}
          mainUnavailableReason={mainUnavailableReason}
          onSetMain={() => setRole('main')}
          onOpen={() => setMobileSheetOpen(true)}
        />
      </div>

      {/* WIDE (lg+) — the accepted Production table row, unchanged. */}
      <div className="hidden lg:block">
        <div
          className={compact ? COMPACT_ROW_GRID : ROW_GRID}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onDrop?.(item.id);
          }}
          data-scope="BASE_FORMULATION"
        >
          <div className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                draggable
                onDragStart={() => onDragStart?.(item.id)}
                className="inline-grid size-11 shrink-0 cursor-grab select-none place-items-center text-base leading-none text-stone-400 active:cursor-grabbing md:size-5 2xl:size-4"
                title="Przeciągnij, aby zmienić kolejność"
              >
                ⠿
              </span>
              <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600 md:size-6 2xl:size-6">
                <IngredientCategoryIcon
                  symbol={ingredientCategorySymbolFor({
                    category: item.ingredient.category,
                  })}
                />
                {estimated ? (
                  <span
                    aria-label={t.data.estimatedHint}
                    title={t.data.estimatedHint}
                    className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-white bg-status-risky"
                    data-testid={`row-estimated-${item.id}`}
                  />
                ) : null}
              </span>
              {/* Truncation is visual only — the full name stays in the DOM for
                  assistive technology, and the hover preview serves the mouse. */}
              <HoverPreview
                text={item.ingredient.name}
                className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink"
              >
                {item.ingredient.name}
              </HoverPreview>
              {role === 'addition' ? (
                <span
                  aria-label="Dawny Dodatek — wymaga decyzji"
                  title="Historyczna rola nie potwierdza, że produkt był dodawany po produkcji. Wybierz Główny lub Standardowy."
                  className="shrink-0 rounded-lg border border-attention/30 bg-attention/[0.08] px-2 py-1 text-xs font-semibold text-attention"
                >
                  Dawny Dodatek · decyzja
                </span>
              ) : null}
              {required ? (
                <span
                  aria-label="Składnik wymagany"
                  title={t.recipe.requiredHint}
                  className="grid size-4 place-items-center rounded-full border border-ink/30 text-[10px] font-bold text-ink"
                >
                  !
                </span>
              ) : null}
              <span
                aria-hidden={!isMain && mainUnavailableReason ? true : undefined}
                data-testid={`row-main-slot-${item.id}`}
                className="flex w-[62px] shrink-0 justify-end"
              >
                {isMain ? (
                  <MainRoleBadge
                    testId={`row-main-badge-${item.id}`}
                    ariaLabel="Składnik Główny"
                    title={
                      mainUserHeld
                        ? 'Główny (Twoja decyzja) — PI nie zmienia jego gramatury samo z siebie. ' +
                          'Kliknij, aby ustawić Standardowy.'
                        : 'Główny'
                    }
                    onClick={() => setRole('standard')}
                  />
                ) : !mainUnavailableReason ? (
                  <MainRoleTrigger
                    testId={`row-main-trigger-${item.id}`}
                    onClick={() => setRole('main')}
                  />
                ) : null}
              </span>
            </span>
            {meta.unavailable ? (
              <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-status-error">
                {t.recipe.unavailableStatus}
                <button
                  type="button"
                  onClick={openSubstitute}
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-ink underline decoration-ink/25 underline-offset-2"
                >
                  {t.recipe.findSubstitute}
                </button>
              </span>
            ) : null}
            {lock && lock.state !== 'ai' ? (
              <span
                className={cn(
                  'mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tracking-[0.03em] uppercase',
                  lock.state === 'percent'
                    ? 'bg-education-ivory text-gold'
                    : lock.state === 'range'
                      ? 'bg-pro-amber text-attention'
                      : 'bg-pro-sage text-ink',
                )}
                data-testid={`row-lock-state-${item.id}`}
              >
                {lock.state === 'percent'
                  ? `% partii · ${lock.lockedGramsLabel ?? ''}`
                  : lock.state === 'range'
                    ? `Zakres · ${lock.lockedGramsLabel ?? ''}`
                    : `Gramy · ${lock.lockedGramsLabel ?? ''}`}
              </span>
            ) : null}
            {meta.dose.provenance === 'UNKNOWN' && item.planned_grams < 1 ? (
              <span
                className="mt-1 block text-xs leading-relaxed text-attention"
                data-testid={`row-dose-missing-${item.id}`}
              >
                <strong className="block font-semibold">Brak zweryfikowanej ilości.</strong>
                Ustaw ilość odpowiednią dla swojej receptury.
              </span>
            ) : null}
          </div>

          <div>
            <FieldLabel>{t.columns.percent}</FieldLabel>
            <div className="flex items-center justify-start">
              <DirectNumberControl
                value={share ?? 0}
                step={0.1}
                min={0}
                max={100}
                decimals={1}
                suffix="%"
                ariaLabel={`${item.ingredient.name} — udział w partii`}
                disabled={
                  share === null ||
                  !actions.setPlannedPercent ||
                  Boolean(lock?.plannedDisabled) ||
                  gramsLocked ||
                  Boolean(lock?.percentLocked)
                }
                onChange={(percent) => actions.setPlannedPercent?.(item.id, percent)}
                testId={`row-percent-control-${item.id}`}
                widthPreset="percent"
                density="compact"
                lockSegment={{
                  pressed: lock?.percentLocked ?? false,
                  disabled: lock?.percentToggleDisabled ?? true,
                  ariaLabel: `${item.ingredient.name} — ${lock?.percentLocked ? '% partii zablokowany. Odblokuj' : 'Zablokuj % partii'}`,
                  title: lock?.percentLocked
                    ? `Udział zablokowany: ${lock.percentLabel ?? ''}`
                    : 'Zablokuj procent finalnej partii',
                  suffix: '%',
                  onToggle: lock?.onTogglePercent ?? (() => undefined),
                  testId: `row-lock-percent-${item.id}`,
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel>{t.columns.quantity}</FieldLabel>
            <div className="flex items-center">
              <DirectNumberControl
                value={displayQuantity}
                step={1}
                min={lock?.state === 'range' ? lock.minGrams : 0}
                max={lock?.state === 'range' ? lock.maxGrams : undefined}
                decimals={Number.isInteger(displayQuantity) ? 0 : 1}
                suffix={unit}
                ariaLabel={`${item.ingredient.name} — ilość w ${unit}`}
                disabled={
                  Boolean(lock?.plannedDisabled) || gramsLocked || Boolean(lock?.percentLocked)
                }
                onChange={(next) => actions.setPlannedGrams(item.id, Math.max(0, next))}
                testId={`row-grams-control-${item.id}`}
                widthPreset="grams"
                density="compact"
                lockSegment={{
                  pressed: gramsLocked,
                  disabled: lock?.toggleDisabled,
                  ariaLabel: `${item.ingredient.name} — ${gramsLocked ? 'Gramatura zablokowana. Odblokuj' : 'Zablokuj gramy'}`,
                  title: lock?.title ?? b.lockTypes.grams,
                  suffix: 'g',
                  onToggle: () => {
                    if (lock) {
                      lock.onToggle();
                      return;
                    }
                    actions.setLockType(item.id, gramsLocked ? 'unlocked' : 'grams');
                  },
                  testId: `row-lock-grams-${item.id}`,
                }}
              />
            </div>
          </div>

          <IngredientPriceCell view={resolvedPriceView} />

          <div className="relative justify-self-end">
            <button
              type="button"
              aria-label={`Opcje składnika ${item.ingredient.name}`}
              aria-haspopup="dialog"
              aria-expanded={rowMenuOpen}
              aria-controls={`row-menu-dialog-${item.id}`}
              onClick={() => setRowMenuOpen(true)}
              className={iconButtonClasses('xs')}
            >
              •••
            </button>
            {rowMenuOpen ? (
              <DialogShell
                label={`Opcje składnika ${item.ingredient.name}`}
                testId={`row-menu-${item.id}`}
                onClose={() => closeLineMenus()}
              >
                <div id={`row-menu-dialog-${item.id}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <strong className="text-sm text-ink">{item.ingredient.name}</strong>
                    <button
                      type="button"
                      onClick={() => closeLineMenus()}
                      className="grid size-11 place-items-center rounded-full border border-ink/12 text-lg text-ink"
                      aria-label="Zamknij opcje składnika"
                    >
                      ×
                    </button>
                  </div>
                  {optionsList}
                </div>
              </DialogShell>
            ) : null}
          </div>
        </div>
      </div>

      {mobileSheetOpen ? (
        <MobileIngredientSheet
          item={item}
          percent={share}
          actions={actions}
          lock={lock}
          meta={meta}
          isMain={isMain}
          gramsLocked={gramsLocked}
          mainUnavailableReason={mainUnavailableReason}
          mainUserHeld={mainUserHeld}
          priceView={resolvedPriceView}
          onSetRole={setRole}
          onOpenData={() => {
            setMobileSheetOpen(false);
            setDialog('data');
          }}
          onClose={() => setMobileSheetOpen(false)}
          menu={optionsList}
        />
      ) : null}

      {dialog === 'substitute' ? (
        <SubstituteDialog
          ingredientName={item.ingredient.name}
          candidates={loadedSubstitutes}
          loading={substitutesLoading}
          onUse={(candidate, mainIdentityConfirmed) => {
            actions.selectSubstitute?.(item.id, candidate, mainIdentityConfirmed);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'required' || dialog === 'required-confirm' ? (
        <RequiredRemovalDialog
          ingredientName={item.ingredient.name}
          candidates={substituteCandidates}
          confirmDestructive={dialog === 'required-confirm'}
          onFindSubstitute={openSubstitute}
          onRequestDestructive={() => setDialog('required-confirm')}
          onConfirmDestructive={() => {
            actions.removeRequiredIngredient?.(item.id, item.ingredient.name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'data' ? (
        <IngredientDataDialog item={item} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}
function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-1 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
      {children}
    </p>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-ink/10" />;
}

function MenuButton({
  children,
  onClick,
  selected = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-ink hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35',
        selected && 'bg-stone-100 font-semibold',
      )}
    >
      {children}
    </button>
  );
}

const formatProductionMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

function ProductionRow({
  item,
  line,
  actions,
}: {
  item: EffectiveRecipeItem;
  line: ProductionLineState;
  actions: ProductionRowActions;
}) {
  const [recordCorrectionDialogOpen, setRecordCorrectionDialogOpen] = useState(false);
  // §10/§12/§19/§20 — material is already in the vessel but the current plan
  // asks for more of this line. Production is a live plan, not a frozen list of
  // checkboxes, so the row says exactly what is still owed.
  const topUpGrams = productionTopUpGrams(line);
  const owesTopUp = topUpGrams > 0.05;
  const correctionMode = !line.confirmed && line.recordCorrectionCount > 0;
  const activeTopUp =
    !line.confirmed && !correctionMode && line.physicalAddedGrams > 0 && owesTopUp;
  const cumulativeValue = line.confirmed ? line.physicalAddedGrams : line.draftActualGrams;
  const value = activeTopUp
    ? Math.max(0, cumulativeValue - line.physicalAddedGrams)
    : cumulativeValue;
  const effectiveCumulativeValue = activeTopUp ? line.physicalAddedGrams + value : value;
  const difference = effectiveCumulativeValue - line.targetGrams;
  const exact = Math.abs(difference) <= 0.05;
  const step = productionStepForGrams(activeTopUp ? topUpGrams : line.targetGrams);
  const minimum = correctionMode || activeTopUp ? 0 : line.physicalAddedGrams;
  const setValue = (next: number) =>
    actions.setDraftActual(
      line.lineId,
      activeTopUp ? line.physicalAddedGrams + Math.max(0, next) : Math.max(minimum, next),
    );

  const physicalStatus = correctionMode
    ? 'DO POTWIERDZENIA'
    : line.confirmed || line.physicalAddedGrams > 0
      ? 'DODANO'
      : line.draftActualEdited
        ? 'DO POTWIERDZENIA'
        : 'DO DODANIA';
  const confirmActual = () => {
    if (line.confirmed) {
      actions.reopenRecord(line.lineId);
      return;
    }
    if (correctionMode && value !== line.physicalAddedGrams) {
      setRecordCorrectionDialogOpen(true);
      return;
    }
    actions.confirmLine(line.lineId);
  };

  return (
    <>
      <div
        className={PRODUCTION_ROW_GRID}
        data-production-confirmed={line.confirmed ? 'true' : 'false'}
        data-production-mode={correctionMode ? 'correction' : activeTopUp ? 'top-up' : 'addition'}
      >
        <div className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600"
            >
              <IngredientCategoryIcon
                symbol={ingredientCategorySymbolFor({ category: item.ingredient.category })}
              />
            </span>
            <HoverPreview
              text={item.ingredient.name}
              className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink"
            >
              {item.ingredient.name}
            </HoverPreview>
            <CarbonationBubbles status={item.ingredient.carbonation_status} />
          </span>
          {line.physicalAddedGrams > 0 && (!line.confirmed || owesTopUp) ? (
            <span className="mt-0.5 block text-xs leading-snug text-stone-600">
              <span className="block">
                W naczyniu: {formatProductionMassG(line.physicalAddedGrams)} g
              </span>
              {activeTopUp ? (
                <strong
                  className="block font-mono font-semibold tabular-nums text-attention"
                  data-testid={`production-required-top-up-${line.lineId}`}
                >
                  Dodaj teraz +{formatProductionMassG(topUpGrams)} g
                </strong>
              ) : null}
            </span>
          ) : null}
          <span
            className={cn(
              'mt-1 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] leading-tight font-semibold tracking-[0.03em]',
              correctionMode
                ? 'border-attention/30 bg-pro-amber text-attention'
                : physicalStatus === 'DODANO'
                  ? 'border-status-ideal/25 bg-pro-sage text-status-ideal'
                  : 'border-ink/10 bg-stone-50 text-stone-600',
            )}
            data-testid={`production-mode-${line.lineId}`}
            role="status"
            aria-live="polite"
          >
            {physicalStatus}
          </span>
        </div>
        <div className="min-w-0 px-1 text-left md:text-right" data-production-cell="planned">
          <span className="block text-[10px] font-semibold text-stone-600 md:block">
            {activeTopUp ? 'Docelowo' : 'Plan'}
          </span>
          <strong className="block font-mono text-sm font-semibold tabular-nums text-ink">
            {formatProductionMassG(line.targetGrams)} g
          </strong>
        </div>
        <div>
          <FieldLabel>{activeTopUp ? 'Dodaj teraz' : 'Faktycznie'}</FieldLabel>
          <ProductionActualControl
            lineId={line.lineId}
            ingredientName={item.ingredient.name}
            value={value}
            minimum={minimum}
            step={step}
            confirmed={line.confirmed}
            correctionMode={correctionMode}
            topUpMode={activeTopUp}
            disabled={actions.disabled}
            onChange={setValue}
            onConfirm={confirmActual}
            describedBy={correctionMode ? `production-correction-${line.lineId}` : undefined}
            separateAction
          />
          {correctionMode ? (
            <p
              className="mt-1 text-xs leading-snug text-attention"
              data-testid={`production-record-correction-${line.lineId}`}
              id={`production-correction-${line.lineId}`}
              role="status"
              aria-live="polite"
            >
              Poprawiasz zapis faktycznej ilości — tylko jeśli poprzednia wartość była wpisana
              błędnie.
            </p>
          ) : null}
        </div>
        <div
          className={cn('min-w-0 px-1 md:text-right', exact ? 'text-stone-600' : 'text-attention')}
          data-testid={`production-difference-${line.lineId}`}
          data-production-cell="deviation"
          data-production-difference={exact ? 'exact' : difference > 0 ? 'over' : 'under'}
          role="status"
          aria-live="polite"
          aria-label={`Różnica względem planu: ${difference > 0 ? 'plus ' : difference < 0 ? 'minus ' : ''}${formatProductionMassG(Math.abs(difference))} gramów${exact ? ', zgodnie z planem' : difference > 0 ? ', powyżej planu' : ', poniżej planu'}`}
        >
          <FieldLabel>Odchylenie</FieldLabel>
          <strong className="block font-mono text-sm tabular-nums">
            {difference > 0 ? '+' : ''}
            {formatProductionMassG(difference)} g
            {!exact ? ` ${difference > 0 ? 'ponad plan' : 'poniżej planu'}` : ''}
          </strong>
        </div>
        <div className="flex justify-start md:justify-end" data-production-cell="action">
          <ProductionConfirmationAction
            ingredientName={item.ingredient.name}
            confirmed={line.confirmed}
            correctionMode={correctionMode}
            topUpMode={activeTopUp}
            disabled={actions.disabled}
            settled={actions.settled}
            onConfirm={confirmActual}
            describedBy={correctionMode ? `production-correction-${line.lineId}` : undefined}
          />
        </div>
      </div>

      {recordCorrectionDialogOpen ? (
        <DialogShell
          label="Poprawiasz wcześniejszy wpis"
          testId="production-record-correction-dialog"
          placement="responsive"
          onClose={() => setRecordCorrectionDialogOpen(false)}
        >
          <div className="p-5 sm:p-0">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-attention uppercase">
              Korekta zapisu
            </p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Poprawiasz wcześniejszy wpis</h2>
            <dl className="mt-4 grid gap-3 border-y border-ink/10 py-4 text-sm">
              <div>
                <dt className="text-xs text-stone-500">Wcześniej potwierdzono</dt>
                <dd className="mt-1 font-semibold text-ink">
                  {item.ingredient.name} —{' '}
                  <span className="font-mono tabular-nums">
                    {formatProductionMassG(line.physicalAddedGrams)} g
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Nowa wartość</dt>
                <dd className="mt-1 font-mono font-semibold tabular-nums text-ink">
                  {formatProductionMassG(value)} g
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-stone-700">
              Zmień wartość tylko wtedy, gdy poprzedni wpis był błędny. Fizycznie dodanego składnika
              nie można usunąć z naczynia.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRecordCorrectionDialogOpen(false)}
                className="pro-focus-ring min-h-11 rounded-[10px] border border-ink/15 bg-white px-4 text-xs font-semibold text-ink"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecordCorrectionDialogOpen(false);
                  actions.confirmLine(line.lineId);
                }}
                className="pro-focus-ring min-h-11 rounded-[10px] bg-ink px-4 text-xs font-semibold text-white"
              >
                Popraw błędny wpis
              </button>
            </div>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}

export function IngredientRow({
  item,
  totalBatchG,
  actions,
  lock,
  mode = 'recipe',
  meta = DEFAULT_INGREDIENT_ROW_META,
  substituteCandidates = [],
  priceView,
  productionLine,
  productionActions,
  canMoveUp = false,
  canMoveDown = false,
  onDragStart,
  onDrop,
  mainUnavailableReason,
  mainUserHeld = false,
  compact = false,
  changed = false,
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  compact?: boolean;
  mode?: IngredientTableMode;
  meta?: IngredientRowMeta;
  substituteCandidates?: readonly SubstituteCandidate[];
  priceView?: IngredientPriceView;
  productionLine?: ProductionLineState;
  productionActions?: ProductionRowActions;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDragStart?: (lineId: string) => void;
  onDrop?: (lineId: string) => void;
  mainUnavailableReason?: string | null;
  /** GLOBAL MAIN AUTHORITY §5/§6: a semantically valid Main with no approved
   * envelope. The owner may select it; PINGÜINO will not resize it by itself. */
  mainUserHeld?: boolean;
  /** §8 change marker — presentation only, computed from the clean-state baseline. */
  changed?: boolean;
}) {
  return (
    <div
      className={cn(
        mode === 'production'
          ? cn(
              'border-b border-ink/[0.075] px-[var(--pro-mobile-gutter)] py-2 lg:px-3 lg:py-1.5',
              productionActions?.settled ? 'bg-stone-50/35' : 'transition-colors hover:bg-stone-50',
            )
          : 'border-b border-ink/[0.075] px-[var(--pro-mobile-gutter)] py-1 transition-colors hover:bg-stone-50 lg:px-3 lg:py-1.5',
        mode === 'recipe' &&
          customerRoleFor(item.lock_type, meta) === 'main' &&
          'border-gold/20 bg-education-ivory/55 hover:bg-education-ivory/75',
        mode === 'recipe' &&
          customerRoleFor(item.lock_type, meta) === 'addition' &&
          'bg-pro-sage/35 hover:bg-pro-sage/55',
        mode === 'recipe' &&
          meta.unavailable &&
          'border-status-error/20 bg-status-error/[0.045] hover:bg-status-error/[0.06]',
        mode === 'recipe' && changed && 'ingredient-line-changed',
      )}
      data-ingredient-mode={mode}
      data-production-row-family={mode === 'production' ? 'recipe-table' : undefined}
      data-changed={mode === 'recipe' && changed ? 'true' : undefined}
      data-unavailable={mode === 'recipe' && meta.unavailable ? 'true' : undefined}
      data-line-id={item.id}
      data-customer-role={mode === 'recipe' ? customerRoleFor(item.lock_type, meta) : undefined}
      tabIndex={-1}
    >
      {mode === 'production' ? (
        productionLine && productionActions ? (
          <ProductionRow item={item} line={productionLine} actions={productionActions} />
        ) : null
      ) : (
        <RecipeRow
          item={item}
          totalBatchG={totalBatchG}
          actions={actions}
          lock={lock}
          meta={meta}
          substituteCandidates={substituteCandidates}
          priceView={priceView}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onDragStart={onDragStart}
          onDrop={onDrop}
          mainUnavailableReason={mainUnavailableReason}
          mainUserHeld={mainUserHeld}
          compact={compact}
          changed={changed}
        />
      )}
    </div>
  );
}
