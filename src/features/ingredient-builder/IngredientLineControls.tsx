import type { ReactNode } from 'react';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import { cn } from '@/lib/cn';
import { DialogShell } from '@/components/ui/DialogShell';
import { HoverPreview } from '@/components/ui/HoverPreview';
import { DirectNumberControl } from './DirectNumberControl';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import type { IngredientRowActions, IngredientRowLockView } from './IngredientRow';
import type { IngredientRowMeta } from './ingredientTableUx';
import { categoryLabelPl } from './ingredientPresentation';

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
}: {
  testId: string;
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
}) {
  const className =
    'inline-flex h-6 w-[57px] shrink-0 items-center justify-center rounded-lg border border-gold/22 bg-education-ivory px-2 text-[11px] font-semibold text-gold';
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
        "pro-focus-ring relative after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']",
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
}: {
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
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
      className="pro-focus-ring relative inline-flex h-6 w-[57px] shrink-0 items-center justify-center rounded-lg border border-gold/28 bg-white text-gold transition-colors after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] hover:border-gold/45 hover:bg-education-ivory disabled:cursor-not-allowed disabled:border-ink/12 disabled:bg-stone-50 disabled:text-stone-400"
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
        <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600">
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
        <span className="truncate text-[13px] font-semibold text-ink">{item.ingredient.name}</span>
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
  onClose,
  panelContent,
}: {
  item: EffectiveRecipeItem;
  percent: number | null;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  meta: IngredientRowMeta;
  gramsLocked: boolean;
  onClose: () => void;
  /** The SAME compact article panel the desktop ••• dialog renders. */
  panelContent: ReactNode;
}) {
  const rangeLocked = lock?.state === 'range';
  const missingAmount = meta.dose.provenance === 'UNKNOWN' && item.planned_grams <= 0;

  return (
    <DialogShell
      label={`${item.ingredient.name} — edycja składnika`}
      testId={`ingredient-mobile-sheet-${item.id}`}
      placement="bottom"
      onClose={onClose}
    >
      <div className="flex flex-col">
        {/* ── Identity — the same compact header language as desktop. ──────── */}
        <div className="sticky top-0 z-10 border-b border-ink/10 bg-white px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600">
                <IngredientCategoryIcon
                  symbol={ingredientCategorySymbolFor({ category: item.ingredient.category })}
                />
              </span>
              <div className="min-w-0">
                {/* The DETAIL view must be able to show the whole catalog name —
                  real Mapper names ("CREAM 30% · Mlekovita Cream · Chilled")
                  are longer than a phone line, so this header wraps instead of
                  truncating. The collapsed list row still keeps one line. */}
                <h2 className="text-base font-semibold break-words text-ink">
                  {item.ingredient.name}
                </h2>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {categoryLabelPl(item.ingredient.category)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij edycję składnika"
              className="pro-focus-ring grid size-11 shrink-0 place-items-center rounded-full border border-ink/12 text-lg text-ink"
            >
              ×
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
    </DialogShell>
  );
}
