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
  MissingAmountHint,
  MobileIngredientLine,
  MobileIngredientSheet,
} from './IngredientLineControls';
import { productIdentityLines } from './productIdentityLines';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import { categoryLabelPl } from './ingredientPresentation';
import { ProductionActualControl } from '@/features/production-workspace/ProductionActualControl';
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
/**
 * GELLATTI V2.1 (approved preview, measured at 1440 px): the row is SIX tracks —
 * drag | identity | % | grams | price | menu — on a 7 px column gap inside a
 * fixed 54 px line. The drag handle becomes its OWN track instead of riding
 * inside the identity cell, which is what puts the product icon on the same x
 * on every row and gives the identity its full 383 px measure.
 */
export const ROW_GRID =
  'grid grid-cols-1 items-center gap-x-2 gap-y-3 md:min-h-[54px] md:grid-cols-[22px_minmax(300px,1fr)_142px_150px_98px_28px] md:gap-x-[7px] md:gap-y-0 2xl:grid-cols-[22px_minmax(400px,1fr)_142px_150px_98px_28px]';
export const COMPACT_ROW_GRID =
  'grid grid-cols-1 items-center gap-x-2 gap-y-3 md:min-h-[54px] md:grid-cols-[22px_minmax(300px,1fr)_142px_150px_98px_28px] md:gap-x-[7px] md:gap-y-0';
export const PRODUCTION_ROW_GRID =
  'grid grid-cols-1 items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(260px,1fr)_minmax(226px,300px)]';

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

type ArticleActionIconName = 'up' | 'down' | 'swap' | 'info' | 'availability' | 'standard';

function ArticleActionIcon({ name }: { name: ArticleActionIconName }) {
  const paths: Record<ArticleActionIconName, React.ReactNode> = {
    up: <path d="M8 13V3m0 0L4.25 6.75M8 3l3.75 3.75" />,
    down: <path d="M8 3v10m0 0 3.75-3.75M8 13 4.25 9.25" />,
    swap: (
      <path d="M2.75 5.25h8.5m0 0L9 3m2.25 2.25L9 7.5m4.25 3.25h-8.5m0 0L7 8.5m-2.25 2.25L7 13" />
    ),
    info: (
      <>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 7.25v3.25M8 5.1h.01" />
      </>
    ),
    availability: (
      <>
        <path d="M3 8s1.8-3 5-3 5 3 5 3-1.8 3-5 3-5-3-5-3Z" />
        <circle cx="8" cy="8" r="1.25" />
      </>
    ),
    standard: <path d="m3.5 8.25 3 3 6-6.5" />,
  };
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      data-icon-family="gellatti-line"
    >
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
}

function ArticleActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  selected,
}: {
  label: string;
  icon: ArticleActionIconName;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <HoverPreview text={label} align="start" maxWidthPx={220} className="flex min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        data-article-action="true"
        className={cn(
          'pro-focus-ring grid size-11 shrink-0 place-items-center rounded-full border bg-white/72 p-0 text-stone-600 transition-colors',
          'border-ink/10 hover:border-ink/25 hover:bg-[var(--g-ivory)] hover:text-ink disabled:cursor-not-allowed disabled:border-ink/[0.06] disabled:bg-[var(--g-ivory)]/70 disabled:text-stone-300',
          selected === true && '!border-gold/25 !bg-education-ivory !text-gold',
        )}
      >
        <ArticleActionIcon name={icon} />
      </button>
    </HoverPreview>
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
      placement="responsive"
      panelClassName="p-4 sm:p-5"
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

function IngredientDataView({ item, onBack }: { item: EffectiveRecipeItem; onBack: () => void }) {
  const estimated = !item.ingredient.is_verified || item.ingredient.confidence_score < 90;
  // Product information the manufacturer supplied. It is shown because it is
  // useful to know, and for no other reason: neither line decides anything
  // about this recipe (owner decision, 2026-08-23).
  const behavior = useRecipeStore((state) => state.productBehaviorSnapshots[item.id]);
  const rows = [
    [t.data.status, estimated ? t.data.estimated : t.data.verified],
    [t.data.confidence, `${item.ingredient.confidence_score}%`],
    [t.data.process, productProcessPl(behavior)],
    [t.data.recommendedDosage, productRecommendedDosagePl(behavior)],
    [t.data.id, item.ingredient.canonical_ingredient_id ?? item.ingredient.id],
  ];
  return (
    <div
      className="min-h-full p-4"
      data-testid="ingredient-data-view"
      data-ingredient-modal-view="data"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="pro-focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-ink/12 text-lg text-ink"
          aria-label="Wróć do opcji składnika"
        >
          <span aria-hidden>←</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pt-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600">
            <IngredientCategoryIcon
              symbol={ingredientCategorySymbolFor({ category: item.ingredient.category })}
            />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold break-words text-ink">{item.ingredient.name}</h2>
            <p className="mt-0.5 text-[11px] text-stone-500">{t.data.heading}</p>
          </div>
        </div>
      </div>
      <dl
        className="mt-3 grid gap-px overflow-hidden rounded-lg border border-ink/10 bg-ink/10"
        data-testid="ingredient-data-compact-list"
      >
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 bg-white px-3 py-2 text-[11px]"
          >
            <dt className="text-stone-500">{label}</dt>
            <dd className="break-words text-right font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
  processReminder,
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  /** V2.1 §17: the heat acknowledgement lives INSIDE the line it belongs to. */
  processReminder?: { onConfirm: () => void; disabled?: boolean };
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
  /** Presentation-only §8 marker: changed by the latest Recalculate result. */
  changed: boolean;
}) {
  const unit = 'g' as const;
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [ingredientModalView, setIngredientModalView] = useState<'actions' | 'data'>('actions');
  const [dialog, setDialog] = useState<'substitute' | 'required' | 'required-confirm' | null>(null);
  const closeLineMenus = () => {
    setRowMenuOpen(false);
    setMobileSheetOpen(false);
    setIngredientModalView('actions');
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
  const missingAmount = meta.dose.provenance === 'UNKNOWN' && item.planned_grams <= 0;
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

  // ONE presentation model. Desktop and mobile render this exact compact panel;
  // every callback below remains the existing Recipe-row authority.
  const articlePanelContent = (
    <div className="text-ink" data-testid="article-panel-content">
      <div
        /* OWNER FROZEN PRO VISUAL: the quick actions are a FRAMELESS panel —
           the icons sit straight on the sheet ground in two groups, not in a
           bordered ivory card. Every button is the authority's 44 px pill,
           which also lifts the role-info control off its old 23 x 36 box: on a
           phone that was under the 44 px touch minimum. Same actions, same
           order, same handlers — geometry only. */
        className="flex max-w-[384px] flex-wrap items-center justify-between gap-3 bg-transparent"
        data-testid="article-panel-quick-actions"
        data-control-height="44"
      >
        <span className="flex min-w-0 items-center gap-2.5">
        <ArticleActionButton
          label="Przesuń wyżej"
          icon="up"
          disabled={!canMoveUp}
          onClick={() => actions.moveUp?.(item.id)}
        />
        <ArticleActionButton
          label="Przesuń niżej"
          icon="down"
          disabled={!canMoveDown}
          onClick={() => actions.moveDown?.(item.id)}
        />
        <div
          /* The paired control has to be sized, not just capped: in a flex row
             `min-w-0` let the crown collapse to 14 px — a real target squeezed
             out by its own sibling. 92 px gives the crown 64 px beside the
             28 px role-info segment, both at the 44 px touch height. */
          className="grid h-11 w-[92px] shrink-0 grid-cols-[minmax(0,1fr)_28px] overflow-hidden rounded-full border border-gold/22 bg-white"
          data-testid="article-panel-role-control"
          data-control-height="44"
        >
          <HoverPreview
            text={isMain ? 'Usuń rolę główną' : mainUnavailableReason || 'Ustaw jako główny'}
            maxWidthPx={240}
            className="flex min-w-0"
          >
            {isMain ? (
              <MainRoleBadge
                testId={`article-panel-main-${item.id}`}
                ariaLabel="Usuń rolę główną"
                title="Usuń rolę główną"
                variant="article"
                onClick={() => setRole('standard')}
              />
            ) : (
              <MainRoleTrigger
                testId={`article-panel-main-${item.id}`}
                ariaLabel="Ustaw jako główny"
                title={mainUnavailableReason || 'Ustaw jako główny'}
                variant="article"
                disabled={Boolean(mainUnavailableReason)}
                onClick={() => setRole('main')}
              />
            )}
          </HoverPreview>
          <HoverPreview
            text="Rola składnika. Możesz oznaczyć składnik jako główny."
            maxWidthPx={260}
            className="grid h-11 shrink-0 place-items-center border-l border-gold/16 bg-education-ivory/35 text-[9px] font-semibold text-stone-500 transition-colors hover:bg-education-ivory/70"
          >
            <button
              type="button"
              aria-label="Informacja o roli składnika"
              onClick={() => setIngredientModalView('data')}
              className="pro-focus-ring grid h-full w-full place-items-center"
            >
              <span
                aria-hidden
                className="grid size-3.5 place-items-center rounded-full border border-ink/12 bg-white"
              >
                ?
              </span>
            </button>
          </HoverPreview>
        </div>
        </span>
        <span className="flex min-w-0 items-center gap-2.5">
        <ArticleActionButton
          label={meta.unavailable ? 'Oznacz jako dostępny' : 'Oznacz jako niedostępny'}
          icon="availability"
          selected={meta.unavailable}
          onClick={() => actions.setIngredientUnavailable?.(item.id, !meta.unavailable)}
        />
        <ArticleActionButton label="Znajdź zamiennik" icon="swap" onClick={openSubstitute} />
        <ArticleActionButton
          label="Dane składnika"
          icon="info"
          onClick={() => setIngredientModalView('data')}
        />
        </span>
      </div>

      {role === 'addition' ? (
        <div className="mt-1.5 flex justify-end">
          <ArticleActionButton
            label="Ustaw jako Standardowy"
            icon="standard"
            onClick={() => setRole('standard')}
          />
        </div>
      ) : null}

      <div className="mt-2.5">
        <CustomerPriceEditor
          view={priceView}
          lineId={item.id}
          variant="article"
          footerAction={
            <button
              type="button"
              aria-label={t.remove.action}
              onClick={requestRemove}
              className="pro-focus-ring h-9 shrink-0 rounded-[8px] border border-status-error/35 bg-status-error/[0.06] px-3 text-[10px] font-semibold text-status-error transition-colors hover:border-status-error/50 hover:bg-status-error/[0.1]"
            >
              {t.remove.action}
            </button>
          }
        />
      </div>
    </div>
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
          missingAmount={missingAmount}
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
          {/* The drag handle is its own grid track (V2.1): every product icon
              therefore starts on the same x, on every row. */}
          <span
            aria-hidden
            draggable
            onDragStart={() => onDragStart?.(item.id)}
            className="inline-grid size-11 shrink-0 cursor-grab select-none place-items-center text-[12px] leading-none text-[var(--g-drag)] active:cursor-grabbing md:size-[22px]"
            title="Przeciągnij, aby zmienić kolejność"
          >
            ⠿
          </span>

          <div className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-[var(--g-ivory-deep)] text-stone-600 md:size-7">
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
                  assistive technology, and the hover preview serves the mouse.
                  V2.1 splits the catalog label into its two approved lines:
                  the product NAME above, its own qualifier below. The split is
                  presentation only — the canonical name is never rewritten. */}
              <span className="min-w-0 flex-1">
                <HoverPreview
                  text={item.ingredient.name}
                  className="block min-w-0 truncate text-[12px] font-bold leading-[15px] text-[var(--g-ink)] uppercase"
                >
                  {productIdentityLines(item.ingredient.name).name}
                </HoverPreview>
                <span className="mt-0.5 block truncate text-[9px] leading-[11px] text-[var(--g-text-muted)]">
                  {productIdentityLines(item.ingredient.name).qualifier ??
                    categoryLabelPl(item.ingredient.category)}
                </span>
              </span>
              {missingAmount ? (
                <MissingAmountHint testId={`row-dose-missing-hint-${item.id}`} />
              ) : null}
              {role === 'addition' ? (
                <span
                  aria-label="Dawny Dodatek — wymaga decyzji"
                  title="Historyczna rola nie potwierdza, że produkt był dodawany po produkcji. Wybierz Główny lub Standardowy"
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
              {processReminder ? (
                <span
                  className="hidden min-w-0 flex-1 items-center gap-2 xl:flex"
                  data-testid="production-inline-process-reminder"
                >
                  <span className="min-w-0">
                    <strong className="block text-[10px] leading-[12px] font-black text-[var(--g-attention-ink)]">
                      Pamiętaj o obróbce
                    </strong>
                    <span className="mt-0.5 block text-[8px] leading-[10px] font-bold text-[var(--g-text-muted)]">
                      Dla poniższych składników wskazana jest obróbka na ciepło:
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={processReminder.onConfirm}
                    disabled={processReminder.disabled}
                    aria-label="Potwierdź informację o obróbce"
                    className="gellatti-next-action-attention pro-focus-ring grid h-8 w-9 shrink-0 place-items-center rounded-[9px] bg-[var(--g-graphite)] text-[10px] font-extrabold text-white disabled:cursor-wait disabled:opacity-60"
                    data-testid="acknowledge-production-heat-information-inline"
                  >
                    OK
                  </button>
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
                        ? 'Główny (Twoja decyzja) — Gellatti nie zmienia jego gramatury bez Twojej zgody. ' +
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
                softDanger={missingAmount}
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
                softDanger={missingAmount}
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
              onClick={() => {
                setIngredientModalView('actions');
                setRowMenuOpen(true);
              }}
              className={iconButtonClasses('xs')}
            >
              •••
            </button>
            {rowMenuOpen ? (
              <DialogShell
                label={
                  ingredientModalView === 'data'
                    ? `${t.data.open}: ${item.ingredient.name}`
                    : `Opcje składnika ${item.ingredient.name}`
                }
                testId={`row-menu-${item.id}`}
                placement="responsive"
                panelClassName="sm:!min-h-[290px] sm:!w-[min(500px,calc(100vw-32px))] sm:!rounded-[14px] sm:!p-0"
                onClose={() => closeLineMenus()}
              >
                <div id={`row-menu-dialog-${item.id}`} data-ingredient-modal-shell="true">
                  {ingredientModalView === 'data' ? (
                    <IngredientDataView
                      item={item}
                      onBack={() => setIngredientModalView('actions')}
                    />
                  ) : (
                    <div data-ingredient-modal-view="actions">
                      <div
                        className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink/[0.08] bg-white/95 px-4 py-3 backdrop-blur-sm"
                        data-testid="article-panel-header"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-stone-100 text-stone-600">
                            <IngredientCategoryIcon
                              symbol={ingredientCategorySymbolFor({
                                category: item.ingredient.category,
                              })}
                            />
                          </span>
                          <div className="min-w-0">
                            <h2 className="text-[13px] font-semibold leading-[1.2] break-words text-ink">
                              {item.ingredient.name}
                            </h2>
                            <p className="mt-1 text-[10px] leading-none font-medium text-stone-500">
                              {categoryLabelPl(item.ingredient.category)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeLineMenus()}
                          className={iconButtonClasses('sm')}
                          aria-label="Zamknij opcje składnika"
                        >
                          <span aria-hidden className="text-base leading-none">
                            ×
                          </span>
                        </button>
                      </div>
                      <div className="px-4 pt-3 pb-3">{articlePanelContent}</div>
                    </div>
                  )}
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
          gramsLocked={gramsLocked}
          view={ingredientModalView}
          onClose={() => closeLineMenus()}
          panelContent={articlePanelContent}
          dataContent={
            <IngredientDataView item={item} onBack={() => setIngredientModalView('actions')} />
          }
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
    </>
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
  const showPhysicalStatus =
    correctionMode || line.confirmed || line.physicalAddedGrams > 0 || line.draftActualEdited;
  const showDeviationContext = !exact || activeTopUp;
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
          {showPhysicalStatus ? (
            <span
              className={cn(
                'mt-1 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] leading-tight font-semibold tracking-[0.03em]',
                correctionMode
                  ? 'border-attention/30 bg-pro-amber text-attention'
                  : physicalStatus === 'DODANO'
                    ? 'border-status-ideal/25 bg-pro-sage text-status-ideal'
                    : 'border-ink/10 bg-[var(--g-ivory)] text-stone-600',
              )}
              data-testid={`production-mode-${line.lineId}`}
              role="status"
              aria-live="polite"
            >
              {physicalStatus}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 md:justify-self-end" data-production-cell="actual">
          <span className="sr-only" data-production-cell="planned">
            Planowo {formatProductionMassG(line.targetGrams)} gramów
          </span>
          <span
            className="sr-only"
            data-production-cell="deviation"
            data-production-difference={exact ? 'exact' : difference > 0 ? 'over' : 'under'}
          >
            Planowo {formatProductionMassG(line.targetGrams)} gramów; faktycznie{' '}
            {formatProductionMassG(effectiveCumulativeValue)} gramów
          </span>
          <ProductionActualControl
            lineId={line.lineId}
            ingredientName={item.ingredient.name}
            value={value}
            minimum={minimum}
            step={step}
            confirmed={line.confirmed}
            correctionMode={correctionMode}
            topUpMode={activeTopUp}
            settled={actions.settled}
            disabled={actions.disabled}
            onChange={setValue}
            onConfirm={confirmActual}
            describedBy={
              correctionMode
                ? `production-correction-${line.lineId}`
                : showDeviationContext
                  ? `production-deviation-${line.lineId}`
                  : undefined
            }
          />
          {showDeviationContext ? (
            <div
              className="mt-1.5 flex w-full items-baseline justify-between gap-3 text-[11px] leading-snug text-stone-500"
              data-testid={`production-difference-${line.lineId}`}
              data-production-cell="deviation"
              id={`production-deviation-${line.lineId}`}
              role="status"
              aria-live="polite"
              aria-label={
                activeTopUp && exact
                  ? `Docelowo ${formatProductionMassG(line.targetGrams)} gramów`
                  : `Planowo ${formatProductionMassG(line.targetGrams)} gramów; ${formatProductionMassG(Math.abs(difference))} gramów ${difference > 0 ? 'więcej' : 'mniej'}`
              }
            >
              <span>
                {activeTopUp ? 'Docelowo' : 'Planowo'}: {formatProductionMassG(line.targetGrams)} g
              </span>
              {exact ? null : (
                <strong className="font-mono font-semibold tabular-nums text-attention">
                  {formatProductionMassG(Math.abs(difference))} g{' '}
                  {difference > 0 ? 'więcej' : 'mniej'}
                </strong>
              )}
            </div>
          ) : null}
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
  productionActive = false,
  productionProcessReminder,
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
  /** Presentation-only marker for the one next physical weighing action. */
  productionActive?: boolean;
  /** Desktop-only visual placement of the existing pre-start heat acknowledgement. */
  productionProcessReminder?: {
    disabled?: boolean;
    onConfirm: () => void;
  };
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDragStart?: (lineId: string) => void;
  onDrop?: (lineId: string) => void;
  mainUnavailableReason?: string | null;
  /** GLOBAL MAIN AUTHORITY §5/§6: a semantically valid Main with no approved
   * envelope. The owner may select it; PINGÜINO will not resize it by itself. */
  mainUserHeld?: boolean;
  /** §8 change marker — presentation only, from the latest Recalculate diff. */
  changed?: boolean;
}) {
  return (
    <div
      className={cn(
        mode === 'production'
          ? cn(
              'border-b border-ink/[0.075] px-[var(--pro-mobile-gutter)] py-2 lg:px-3 lg:py-1.5',
              productionActions?.settled
                ? 'bg-[var(--g-ivory)]/35'
                : 'transition-colors hover:bg-[var(--g-ivory)]',
            )
          : // V2.1: the row's own 54 px grid owns the height, so the shell adds no
            // vertical padding on desktop — that is what makes the served row
            // exactly 54 px instead of 54 + 12.
            // OWNER FROZEN PRO VISUAL, 2026-09-01: the ACTIVE row wears the same warm
            // surface as hover, so a row reached by keyboard or touch reads as active
            // too — `focus-within` is presentation only and introduces no state.
            'border-b border-ink/[0.075] px-[var(--pro-mobile-gutter)] py-1 transition-colors hover:bg-[var(--g-ivory)] focus-within:bg-[var(--g-ivory)] lg:px-3 lg:py-0 lg:pr-2.5',
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
        mode === 'production' && productionActive && 'production-line-active',
        productionProcessReminder &&
          'xl:min-h-[64px] xl:border-l-[3px] xl:border-l-[#f58a07] xl:bg-[var(--g-attention-surface)]',
      )}
      data-ingredient-mode={mode}
      data-production-row-family={mode === 'production' ? 'recipe-table' : undefined}
      data-production-active={mode === 'production' && productionActive ? 'true' : undefined}
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
          processReminder={productionProcessReminder}
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
