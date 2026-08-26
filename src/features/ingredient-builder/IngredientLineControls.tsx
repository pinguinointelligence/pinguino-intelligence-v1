import { useState, type ReactNode } from 'react';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import { cn } from '@/lib/cn';
import { DialogShell } from '@/components/ui/DialogShell';
import { DirectNumberControl } from './DirectNumberControl';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import { CustomerPriceEditor, type IngredientPriceView } from './IngredientPriceControl';
import type { IngredientRowActions, IngredientRowLockView } from './IngredientRow';
import type { IngredientCustomerRole, IngredientRowMeta } from './ingredientTableUx';

const b = copy.studio.builder;
const t = b.ingredientTable;

const money = (value: number): string =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      className={cn('pro-focus-ring', className)}
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
export function MainRoleTrigger({ testId, onClick }: { testId: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Ustaw składnik jako Główny"
      aria-pressed="false"
      title="Ustaw jako Główny"
      onClick={onClick}
      data-testid={testId}
      data-main-presentation="trigger"
      className="pro-focus-ring inline-flex h-6 w-[57px] shrink-0 items-center justify-center rounded-lg border border-gold/28 bg-white text-gold transition-colors hover:border-gold/45 hover:bg-education-ivory"
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
 * Hierarchy is deliberate: identity, help and the rarely-changed metadata
 * (price, Main role, „Zmień/Zapisz") sit at the TOP; the frequently used
 * `%` / `g` steppers sit at the BOTTOM, inside the thumb zone, using exactly
 * the desktop control (`DirectNumberControl`) so the meaning of −, +, the
 * value and the lock never changes between form factors.
 */
export function MobileIngredientSheet({
  item,
  percent,
  actions,
  lock,
  meta,
  isMain,
  gramsLocked,
  mainUnavailableReason,
  mainUserHeld,
  priceView,
  onSetRole,
  onOpenData,
  onClose,
  menu,
}: {
  item: EffectiveRecipeItem;
  percent: number | null;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  meta: IngredientRowMeta;
  isMain: boolean;
  gramsLocked: boolean;
  mainUnavailableReason?: string | null;
  mainUserHeld: boolean;
  priceView?: IngredientPriceView;
  onSetRole: (role: 'main' | IngredientCustomerRole) => void;
  onOpenData: () => void;
  onClose: () => void;
  /** The SAME options list the desktop ••• menu renders — never a second model. */
  menu: ReactNode;
}) {
  const [priceOpen, setPriceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const cost = priceView?.cost;
  const rangeLocked = lock?.state === 'range';

  return (
    <DialogShell
      label={`${item.ingredient.name} — edycja składnika`}
      testId={`ingredient-mobile-sheet-${item.id}`}
      placement="bottom"
      onClose={onClose}
    >
      <div className="flex flex-col">
        {/* ── Identity + low-frequency controls (top) ───────────────────────── */}
        <div className="sticky top-0 z-10 border-b border-ink/10 bg-white px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {/* The DETAIL view must be able to show the whole catalog name —
                  real Mapper names ("CREAM 30% · Mlekovita Cream · Chilled")
                  are longer than a phone line, so this header wraps instead of
                  truncating. The collapsed list row still keeps one line. */}
              <h2 className="text-base font-semibold break-words text-ink">
                {item.ingredient.name}
              </h2>
              <button
                type="button"
                onClick={onOpenData}
                aria-label={`${t.data.open}: ${item.ingredient.name}`}
                title={t.data.open}
                data-testid={`row-mobile-help-${item.id}`}
                // 28 px ring, 44 px touch target — the compact mark must not
                // shrink the tap area below the app's minimum.
                className="pro-focus-ring relative grid size-7 shrink-0 place-items-center rounded-full border border-ink/15 text-xs font-semibold text-stone-600 after:absolute after:-inset-2 after:content-['']"
              >
                ?
              </button>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Main product — one badge presentation; role authority is unchanged. */}
            {isMain ? (
              <MainRoleBadge
                testId={`row-mobile-main-toggle-${item.id}`}
                ariaLabel="Składnik Główny"
                title={
                  mainUserHeld
                    ? 'Główny (Twoja decyzja) — PI nie zmienia jego gramatury samo z siebie.'
                    : 'Główny'
                }
                onClick={() => onSetRole('standard')}
              />
            ) : !mainUnavailableReason ? (
              <button
                type="button"
                aria-label="Ustaw składnik jako Główny"
                aria-pressed="false"
                onClick={() => onSetRole('main')}
                data-testid={`row-mobile-main-toggle-${item.id}`}
                title="Ustaw jako Główny"
                className="pro-focus-ring inline-flex min-h-11 shrink-0 items-center rounded-xl border border-ink/12 bg-white px-3 text-xs font-semibold text-ink"
              >
                Ustaw Główny
              </button>
            ) : null}

            {/* Price — compact, and only expands into the existing editor on demand. */}
            <button
              type="button"
              onClick={() => setPriceOpen((open) => !open)}
              aria-expanded={priceOpen}
              data-testid={`row-mobile-price-${item.id}`}
              className="pro-focus-ring inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-ink/12 bg-white px-3 text-xs font-semibold text-ink"
            >
              <span className="font-mono tabular-nums">
                {cost?.pricePerKg == null ? '—' : `${money(cost.pricePerKg)} ${cost.currency}/kg`}
              </span>
              {cost?.source === 'customer_override' ? (
                <span className="rounded-md bg-stone-200 px-1.5 py-px text-[10px] text-stone-700">
                  Moja
                </span>
              ) : null}
              <span aria-hidden className="text-stone-500">
                {priceOpen ? 'Zamknij' : 'Zmień'}
              </span>
            </button>
          </div>

          {mainUnavailableReason && !isMain ? (
            <p className="mt-2 text-xs leading-relaxed text-status-error" role="status">
              {mainUnavailableReason}
            </p>
          ) : null}

          {priceOpen ? (
            <div className="mt-2">
              <CustomerPriceEditor view={priceView} lineId={item.id} />
            </div>
          ) : null}
        </div>

        {/* ── Context that must not be hidden, but is not a control ──────────── */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-stone-50 px-3 py-2">
            <SheetSectionLabel>Koszt linii</SheetSectionLabel>
            <span className="font-mono text-xs font-semibold tabular-nums text-ink">
              {priceView?.lineCost == null
                ? 'Koszt niepełny'
                : `${money(priceView.lineCost)} ${priceView.cost.currency}`}
            </span>
          </div>
          {meta.dose.provenance === 'UNKNOWN' && item.planned_grams < 1 ? (
            <p className="mt-2 text-xs leading-relaxed text-attention">
              <strong className="block font-semibold">Brak zweryfikowanej ilości.</strong>
              Ustaw ilość odpowiednią dla swojej receptury.
            </p>
          ) : null}

          <details
            className="mt-3 rounded-xl border border-ink/10"
            open={moreOpen}
            onToggle={(event) => setMoreOpen(event.currentTarget.open)}
          >
            <summary className="pro-focus-ring flex min-h-11 cursor-pointer items-center justify-between px-3 text-xs font-semibold text-ink">
              Więcej opcji składnika
              <span aria-hidden className="text-stone-500">
                {moreOpen ? '−' : '+'}
              </span>
            </summary>
            <div className="px-2 pb-2">{menu}</div>
          </details>
        </div>

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
