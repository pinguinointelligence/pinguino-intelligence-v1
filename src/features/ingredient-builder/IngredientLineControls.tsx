import type { ReactNode } from 'react';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import { cn } from '@/lib/cn';
import { DialogShell } from '@/components/ui/DialogShell';
import { HoverPreview } from '@/components/ui/HoverPreview';
import { DirectNumberControl } from './DirectNumberControl';
import { productIdentityLines } from './productIdentityLines';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import type { IngredientRowActions, IngredientRowLockView } from './IngredientRow';
import type { IngredientRowMeta } from './ingredientTableUx';
import { categoryLabelPl } from './ingredientPresentation';
import { iconButtonClasses } from '@/components/ui/buttonStyles';

const b = copy.studio.builder;
const t = b.ingredientTable;

/** Compact replacement for the former multi-line missing-amount notice. */
export function MissingAmountHint({ testId }: { testId: string }) {
  return (
    <HoverPreview
      text={t.data.missingAmountHint}
      focusable
      maxWidthPx={288}
      ariaLabel={t.data.missingAmountHint}
      testId={testId}
      className="pointer-events-auto relative inline-grid size-4 shrink-0 place-items-center rounded-full border border-status-error/30 bg-status-error/[0.045] text-[10px] leading-none font-bold text-status-error transition-colors after:absolute after:-inset-[14px] after:content-[''] hover:bg-status-error/[0.08]"
    >
      <span aria-hidden>?</span>
    </HoverPreview>
  );
}

/** The one customer-facing Main presentation shared by every ingredient row. */
export function MainRoleBadge({
  testId,
  onClick,
  ariaLabel = 'Składnik główny',
  title = t.role.mainHint,
  variant = 'row',
}: {
  testId: string;
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
  variant?: 'row' | 'article';
}) {
  const className =
    variant === 'article'
      ? 'inline-flex h-9 w-full min-w-0 shrink-0 items-center justify-center rounded-none border-0 bg-education-ivory/75 px-1.5 text-[10px] font-semibold leading-none text-gold transition-colors hover:bg-education-ivory'
      : 'inline-flex h-6 w-[57px] shrink-0 items-center justify-center rounded-lg border border-gold/22 bg-education-ivory px-2 text-[11px] font-semibold text-gold';
  return onClick ? (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed="true"
      title={title}
      onClick={onClick}
      data-testid={testId}
      data-main-presentation="badge"
      className={cn(
        variant === 'row' &&
          "relative after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']",
        'pro-focus-ring',
        className,
      )}
    >
      Główny
    </button>
  ) : (
    <span
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
      data-main-presentation="badge"
      className={className}
    >
      Główny
    </span>
  );
}

/** The inactive Main action; it occupies the same fixed row slot as MainRoleBadge. */
export function MainRoleTrigger({
  testId,
  onClick,
  disabled = false,
  ariaLabel = 'Ustaw składnik jako Główny',
  title = 'Ustaw jako Główny',
  variant = 'row',
}: {
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  variant?: 'row' | 'article';
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed="false"
      title={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      data-main-presentation="trigger"
      className={cn(
        'pro-focus-ring inline-flex shrink-0 items-center justify-center text-gold transition-colors disabled:cursor-not-allowed disabled:text-stone-300',
        variant === 'article'
          ? 'h-9 w-full min-w-0 rounded-none border-0 bg-white hover:bg-education-ivory/70'
          : "relative h-6 w-[57px] rounded-lg border border-gold/28 bg-white after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] hover:border-gold/45 hover:bg-education-ivory disabled:border-ink/12 disabled:bg-stone-50 disabled:text-stone-400",
      )}
    >
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 5.5 5.3 8 8 3l2.7 5L14 5.5l-1 6H3l-1-6Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * The COLLAPSED mobile recipe line (owner mobile UX §7).
 *
 * Name · % · g and nothing else: the list has to stay scannable in one vertical
 * sweep. Every editing control lives one tap deeper, in `MobileIngredientSheet`.
 * A changed line carries the subtle ivory change marker (§8) — the same brand
 * ivory the desktop workbench already uses for the Main line, never a warning
 * colour.
 */
export function MobileIngredientLine({
  item,
  percent,
  isMain,
  required,
  unavailable,
  estimated,
  changed,
  missingAmount,
  mainUnavailableReason,
  onSetMain,
  onOpen,
}: {
  item: EffectiveRecipeItem;
  percent: number | null;
  isMain: boolean;
  required: boolean;
  unavailable: boolean;
  estimated: boolean;
  changed: boolean;
  missingAmount: boolean;
  mainUnavailableReason?: string | null;
  onSetMain: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      data-testid={`row-mobile-line-${item.id}`}
      data-changed={changed ? 'true' : undefined}
      className={cn(
        'relative grid min-h-14 w-full grid-cols-[minmax(0,1fr)_62px_62px_64px] items-center gap-x-2 text-left',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.ingredient.name} — otwórz edycję składnika`}
        className="pro-focus-ring absolute inset-0 z-0 rounded-lg transition-colors active:bg-stone-50"
      />
      <span className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
        <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-[var(--g-ivory-deep)] text-stone-600">
          <IngredientCategoryIcon
            symbol={ingredientCategorySymbolFor({ category: item.ingredient.category })}
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
        {/* The approved mobile line carries the product NAME only — its
            qualifier belongs to the one detail sheet (owner §19/§20). */}
        <span className="truncate text-[13px] font-bold text-[var(--g-ink)] uppercase">
          {productIdentityLines(item.ingredient.name).name}
        </span>
        {missingAmount ? (
          <MissingAmountHint testId={`row-mobile-dose-missing-hint-${item.id}`} />
        ) : null}
        {required ? (
          <span
            aria-label="Składnik wymagany"
            title={t.recipe.requiredHint}
            className="grid size-4 shrink-0 place-items-center rounded-full border border-ink/30 text-[10px] font-bold text-ink"
          >
            !
          </span>
        ) : null}
        {unavailable ? (
          <span className="shrink-0 text-xs font-semibold text-status-error">
            {t.recipe.unavailableStatus}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden={!isMain && mainUnavailableReason ? true : undefined}
        className="relative z-20 flex w-[62px] shrink-0 justify-end"
        data-testid={`row-mobile-main-slot-${item.id}`}
      >
        {isMain ? (
          <MainRoleBadge testId={`row-mobile-main-badge-${item.id}`} />
        ) : !mainUnavailableReason ? (
          <MainRoleTrigger testId={`row-mobile-main-trigger-${item.id}`} onClick={onSetMain} />
        ) : null}
      </span>
      <span
        className="pointer-events-none relative z-10 w-[62px] shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-ink"
        data-testid={`row-mobile-percent-${item.id}`}
      >
        {percent === null ? '—' : `${percent.toFixed(1)} %`}
      </span>
      <span
        className="pointer-events-none relative z-10 w-[64px] shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-ink"
        data-testid={`row-mobile-grams-${item.id}`}
      >
        {item.planned_grams.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
      </span>
    </div>
  );
}

function SheetSectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-xs font-semibold tracking-[0.05em] text-stone-600 uppercase">
      {children}
    </span>
  );
}

/**
 * The mobile ingredient editing view (owner mobile UX §9/§10).
 *
 * Hierarchy is deliberate: identity sits at the top, the shared compact
 * article actions occupy the middle, and the frequently used `%` / `g`
 * steppers stay at the bottom inside the thumb zone. They reuse the desktop
 * `DirectNumberControl`, so the meaning of −, +, value and lock never changes.
 */
export function MobileIngredientSheet({
  item,
  percent,
  actions,
  lock,
  meta,
  gramsLocked,
  view,
  onClose,
  panelContent,
  dataContent,
}: {
  item: EffectiveRecipeItem;
  percent: number | null;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  meta: IngredientRowMeta;
  gramsLocked: boolean;
  view: 'actions' | 'data';
  onClose: () => void;
  /** The SAME compact article panel the desktop ••• dialog renders. */
  panelContent: ReactNode;
  /** Ingredient facts rendered as the second view inside this same modal shell. */
  dataContent: ReactNode;
}) {
  const rangeLocked = lock?.state === 'range';
  const missingAmount = meta.dose.provenance === 'UNKNOWN' && item.planned_grams <= 0;

  return (
    <DialogShell
      label={
        view === 'data'
          ? `${t.data.open}: ${item.ingredient.name}`
          : `${item.ingredient.name} — edycja składnika`
      }
      testId={`ingredient-mobile-sheet-${item.id}`}
      placement="bottom"
      panelClassName="min-h-[min(560px,88dvh)]"
      onClose={onClose}
    >
      {view === 'data' ? (
        dataContent
      ) : (
        <div className="flex flex-col" data-ingredient-modal-view="actions">
          {/* ── Identity — the approved sheet header (Gellatti V2.1 §20/§26):
                 an explicit „← Wróć" that returns to the ingredient list, the
                 WHOLE catalog name, and the close control. One sheet, one level:
                 Back and Close both return to the list, which is exactly the
                 mobile architecture the owner locked. ─────────────────────── */}
          <div className="sticky top-0 z-10 border-b border-ink/[0.08] bg-white px-4 py-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="pro-focus-ring -ml-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-[var(--g-ink)]"
                data-testid={`ingredient-sheet-back-${item.id}`}
              >
                <span aria-hidden>←</span>
                <span>Wróć</span>
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--g-ivory-deep)] text-stone-600">
                  <IngredientCategoryIcon
                    symbol={ingredientCategorySymbolFor({ category: item.ingredient.category })}
                  />
                </span>
                <div className="min-w-0">
                  {/* The DETAIL view must be able to show the whole catalog name —
                  real Mapper names ("CREAM 30% · Mlekovita Cream · Chilled")
                  are longer than a phone line, so this header wraps instead of
                  truncating. The collapsed list row still keeps one line. */}
                  <h2 className="text-[13px] leading-[1.2] font-bold break-words text-[var(--g-ink)]">
                    {item.ingredient.name}
                  </h2>
                  {productIdentityLines(item.ingredient.name).qualifier === null ? (
                    <p className="mt-1 text-[10px] leading-none font-medium text-[var(--g-text-muted)]">
                      {categoryLabelPl(item.ingredient.category)}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij edycję składnika"
                className={iconButtonClasses('sm')}
              >
                <span aria-hidden className="text-base leading-none">
                  ×
                </span>
              </button>
            </div>
          </div>

          <div className="px-4 py-3">{panelContent}</div>

          {/* ── THUMB ZONE — the most frequent action sits lowest ──────────────── */}
          <div className="sticky bottom-0 border-t border-ink/10 bg-white px-4 pt-3 pb-4">
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <SheetSectionLabel>{t.columns.percent}</SheetSectionLabel>
                <DirectNumberControl
                  value={percent ?? 0}
                  step={0.1}
                  min={0}
                  max={100}
                  decimals={1}
                  suffix="%"
                  ariaLabel={`${item.ingredient.name} — udział w partii`}
                  disabled={
                    percent === null ||
                    !actions.setPlannedPercent ||
                    Boolean(lock?.plannedDisabled) ||
                    gramsLocked ||
                    Boolean(lock?.percentLocked)
                  }
                  onChange={(next) => actions.setPlannedPercent?.(item.id, next)}
                  testId={`row-mobile-percent-control-${item.id}`}
                  widthPreset="fluid"
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
                    testId: `row-mobile-lock-percent-${item.id}`,
                  }}
                />
              </label>
              <label className="grid gap-1.5">
                <SheetSectionLabel>{t.columns.quantity}</SheetSectionLabel>
                <DirectNumberControl
                  value={item.planned_grams}
                  step={1}
                  min={rangeLocked ? lock?.minGrams : 0}
                  max={rangeLocked ? lock?.maxGrams : undefined}
                  decimals={Number.isInteger(item.planned_grams) ? 0 : 1}
                  suffix="g"
                  ariaLabel={`${item.ingredient.name} — ilość w g`}
                  disabled={
                    Boolean(lock?.plannedDisabled) || gramsLocked || Boolean(lock?.percentLocked)
                  }
                  onChange={(next) => actions.setPlannedGrams(item.id, Math.max(0, next))}
                  testId={`row-mobile-grams-control-${item.id}`}
                  widthPreset="fluid"
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
                    testId: `row-mobile-lock-grams-${item.id}`,
                  }}
                />
              </label>
              <button
                type="button"
                onClick={onClose}
                data-testid={`row-mobile-done-${item.id}`}
                className="pro-focus-ring min-h-12 w-full rounded-xl bg-ink px-4 text-sm font-semibold text-white"
              >
                Gotowe
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  );
}
