import type { CSSProperties, ReactNode } from 'react';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import { cn } from '@/lib/cn';
import { DialogShell } from '@/components/ui/DialogShell';
import { useKeyboardInset } from '@/components/ui/useKeyboardInset';
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
      ? 'inline-flex h-11 w-full min-w-0 shrink-0 items-center justify-center rounded-none border-0 bg-education-ivory/75 px-2 text-[10px] font-semibold leading-none text-gold transition-colors hover:bg-education-ivory'
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
          ? 'h-11 w-full min-w-0 rounded-none border-0 bg-white hover:bg-education-ivory/70'
          : "relative h-6 w-[57px] rounded-lg border border-gold/28 bg-white after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] hover:border-gold/45 hover:bg-education-ivory disabled:border-ink/12 disabled:bg-[var(--g-ivory)] disabled:text-stone-400",
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
  changed,
  missingAmount,
  mainUnavailableReason,
  onSetMain,
  onOpen,
  editing = false,
}: {
  item: EffectiveRecipeItem;
  percent: number | null;
  isMain: boolean;
  required: boolean;
  /** Dormant availability metadata is preserved for compatibility but never rendered. */
  unavailable: boolean;
  changed: boolean;
  missingAmount: boolean;
  mainUnavailableReason?: string | null;
  onSetMain: () => void;
  onOpen: () => void;
  /** PRO MOBILE UX v2 · B11 — this line's product sheet is open: the list under
   *  the translucent sheet shows WHICH ingredient the controls refer to. */
  editing?: boolean;
}) {
  return (
    <div
      data-testid={`row-mobile-line-${item.id}`}
      data-changed={changed ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      className={cn(
        'gellatti-touch-control relative grid min-h-14 w-full scroll-mt-16 grid-cols-[minmax(0,1fr)_62px_62px_64px] items-center gap-x-2 rounded-lg text-left',
        editing && 'bg-[var(--g-ivory)] outline outline-[1.5px] outline-[var(--g-graphite)]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.ingredient.name} — otwórz edycję składnika`}
        className="pro-focus-ring absolute inset-0 z-0 rounded-lg transition-colors active:bg-[var(--g-ivory)]"
      />
      <span className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
        <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-[var(--g-ivory-deep)] text-stone-600">
          <IngredientCategoryIcon
            symbol={ingredientCategorySymbolFor({ category: item.ingredient.category })}
          />
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
      tone="context"
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
              {/* OWNER FROZEN PRO VISUAL, 2026-09-01. `Wróć` and `×` were two controls
                  calling the same `onClose`; the frozen sheet keeps ONE, and it reads as
                  a RETURN rather than a dismissal — the sheet goes back to the list, it
                  does not discard anything. The removed button's test id rides along so
                  nothing that targeted either control has to move. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij edycję składnika"
                data-testid={`ingredient-sheet-back-${item.id}`}
                className={iconButtonClasses('sm')}
              >
                <svg
                  aria-hidden
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M11 18l-6-6 6-6" />
                </svg>
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
                  disabled={percent === null || !actions.setPlannedPercent}
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
                className="pro-focus-ring min-h-12 w-full rounded-full bg-[var(--g-score-green)] px-4 text-sm font-semibold text-white"
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

/* ───────────────────────────────────────────── DESIGN V3.0 ingredient editor ── */

type EditorIconName = 'info' | 'swap' | 'crown';

function EditorIcon({ name }: { name: EditorIconName }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {name === 'info' ? (
          <>
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 7.25v3.25M8 5.1h.01" />
          </>
        ) : name === 'swap' ? (
          <path d="M2.75 5.25h8.5m0 0L9 3m2.25 2.25L9 7.5m4.25 3.25h-8.5m0 0L7 8.5m-2.25 2.25L7 13" />
        ) : (
          <path d="M2 5.5 5.3 8 8 3l2.7 5L14 5.5l-1 6H3l-1-6Z" />
        )}
      </g>
    </svg>
  );
}

export interface IngredientEditorAction {
  readonly label: string;
  readonly testId: string;
  readonly onClick: () => void;
  /** Toggle state for ⓘ (data shown) and the Crown (this line holds Main). */
  readonly pressed?: boolean;
}

export interface IngredientEditorAmount {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly ariaLabel: string;
  readonly testId: string;
  readonly suffix: string;
  readonly min?: number;
  readonly max?: number;
  readonly decimals?: number;
  /** The exact-amount padlock; a topping has none, so it passes nothing. */
  readonly lock?: {
    readonly pressed: boolean;
    readonly ariaLabel: string;
    readonly title: string;
    readonly testId: string;
    readonly onToggle: () => void;
    readonly disabled?: boolean;
  } | null;
  /** Entitlement masking — the canonical `DirectNumberControl` mask, unchanged. */
  readonly masked?: {
    readonly value: string;
    readonly label: string;
    readonly onInteract: () => void;
  } | null;
}

/**
 * DESIGN V3.0 — the ONE ingredient editor (PRO `editor`; HOME corrections IV-C + XII).
 *
 * Identity first (icon · name and variant · SKŁADNIK / TOPPING), the product data under
 * ⓘ, the round actions ⓘ · ⇄ · Crown, the amount pill − g + with its padlock, and
 * „Usuń” | „Gotowe” under the thumb. Presentation only: every value it shows and every
 * callback it calls belongs to the caller's existing authority — the amount is the
 * canonical `DirectNumberControl`, the Crown and the padlock are the caller's store
 * doors. No store, no Engine and no arithmetic live here (GEL-P0-019).
 *
 * HOME passes neither a price block nor a percent control (§52): the panel simply has
 * no such rows, so nothing is hidden with CSS.
 */
export function IngredientEditorPanel({
  name,
  category,
  tag,
  tagTone = 'ingredient',
  info,
  infoAction,
  replaceAction,
  crownAction,
  amount,
  amountNote,
  removeAction,
  doneAction,
  tone = 'pro',
  testId,
}: {
  /** The whole catalog name; the panel splits it into name + variant for display only. */
  name: string;
  category: string;
  tag: string;
  tagTone?: 'ingredient' | 'topping';
  /** The product data shown under the identity while ⓘ is pressed. */
  info?: ReactNode;
  infoAction?: IngredientEditorAction | null;
  replaceAction?: IngredientEditorAction | null;
  crownAction?: IngredientEditorAction | null;
  amount: IngredientEditorAmount;
  /** A short line under the amount (e.g. the manufacturer's dosage for a new product). */
  amountNote?: ReactNode;
  removeAction?: IngredientEditorAction | null;
  doneAction: IngredientEditorAction;
  /** `home` switches the amount pill to HOME's light skin (`homeLayer.css`). */
  tone?: 'pro' | 'home';
  testId: string;
}) {
  const identity = productIdentityLines(name);
  const actions: { readonly action: IngredientEditorAction; readonly icon: EditorIconName }[] = [];
  if (infoAction) actions.push({ action: infoAction, icon: 'info' });
  if (replaceAction) actions.push({ action: replaceAction, icon: 'swap' });
  if (crownAction) actions.push({ action: crownAction, icon: 'crown' });

  return (
    <div
      className="ingredient-editor flex min-h-0 flex-col text-[var(--g-ink)]"
      data-testid={testId}
      data-editor-tone={tone}
    >
      <div className="grid shrink-0 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3">
        <span className="grid size-[38px] place-items-center rounded-full bg-white shadow-[inset_0_0_0_1px_#ebe7e0]">
          <IngredientCategoryIcon symbol={ingredientCategorySymbolFor({ category })} />
        </span>
        <span className="min-w-0">
          <b
            className="block truncate text-[17px] leading-[1.25] font-medium"
            title={name}
            data-testid={`${testId}-name`}
          >
            {identity.name}
          </b>
          <small className="mt-0.5 block truncate text-[13px] leading-[1.3] text-[var(--g-text-muted)]">
            {identity.qualifier ?? categoryLabelPl(category)}
          </small>
        </span>
        <span
          className="inline-flex h-6 shrink-0 items-center rounded-full bg-white px-[9px] text-[10.5px] leading-none font-bold tracking-[0.06em] text-[var(--g-text-secondary)] uppercase shadow-[inset_0_0_0_1px_#e4e0d9]"
          data-testid={`${testId}-tag`}
          data-tag-tone={tagTone}
        >
          {tag}
        </span>
      </div>

      {info && infoAction?.pressed ? (
        /* Only the information scrolls when the room runs out: the actions, the amount
           and the buttons below it always stay reachable (XII). */
        <div className="mt-4 min-h-0 shrink overflow-y-auto" data-testid={`${testId}-info`}>
          {info}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="mt-[22px] flex shrink-0 items-center justify-between gap-3"
          data-testid={`${testId}-actions`}
        >
          {actions.map(({ action, icon }) => (
            <button
              key={action.testId}
              type="button"
              aria-label={action.label}
              title={action.label}
              aria-pressed={action.pressed}
              data-testid={action.testId}
              onClick={action.onClick}
              className={cn(
                'pro-focus-ring grid size-12 shrink-0 place-items-center rounded-full border bg-white text-[var(--g-ink)] transition-colors',
                action.pressed
                  ? 'border-[var(--g-ink)]'
                  : 'border-[#e4e0d9] hover:border-[var(--g-line-strong)]',
              )}
            >
              <EditorIcon name={icon} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="ingredient-editor-amount mt-6 shrink-0">
        <DirectNumberControl
          value={amount.value}
          step={1}
          min={amount.min ?? 0}
          max={amount.max}
          decimals={amount.decimals ?? 0}
          suffix={amount.suffix}
          ariaLabel={amount.ariaLabel}
          testId={amount.testId}
          widthPreset="fluid"
          onChange={amount.onChange}
          {...(amount.lock
            ? {
                lockSegment: {
                  pressed: amount.lock.pressed,
                  disabled: amount.lock.disabled,
                  ariaLabel: amount.lock.ariaLabel,
                  title: amount.lock.title,
                  suffix: 'g' as const,
                  onToggle: amount.lock.onToggle,
                  testId: amount.lock.testId,
                },
              }
            : {})}
          {...(amount.masked
            ? {
                maskedValue: amount.masked.value,
                maskedLabel: amount.masked.label,
                onMaskedInteract: amount.masked.onInteract,
              }
            : {})}
        />
        {amountNote ? (
          <p className="mt-2 text-[13px] leading-snug text-[var(--g-text-secondary)]">
            {amountNote}
          </p>
        ) : null}
      </div>

      <div className="mt-7 flex shrink-0 items-center gap-3">
        {removeAction ? (
          <button
            type="button"
            data-testid={removeAction.testId}
            onClick={removeAction.onClick}
            className="pro-focus-ring inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[15.5px] font-semibold text-[#a3261d] shadow-[inset_0_0_0_1px_rgba(16,17,19,0.2)] transition-colors hover:bg-[#fdf5f4]"
          >
            {removeAction.label}
          </button>
        ) : null}
        <button
          type="button"
          data-testid={doneAction.testId}
          onClick={doneAction.onClick}
          className="pro-focus-ring inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-full bg-[var(--g-ink)] px-5 text-[15.5px] font-semibold text-white"
        >
          {doneAction.label}
        </button>
      </div>
    </div>
  );
}

/**
 * The frame of the ingredient editor: a compact bottom layer on a phone and a portrait
 * tablet (height from content, capped under the header, lifted above the keyboard) and
 * a light centred modal from 1024 px — the shared `home-layer` placement (XII / XIII).
 * Escape closes it through `onClose`; a tap on the dimmed recipe is `onBackdrop`.
 */
export function IngredientEditorSheet({
  label,
  testId,
  onClose,
  onBackdrop,
  children,
}: {
  label: string;
  testId: string;
  onClose: () => void;
  onBackdrop?: () => void;
  children: ReactNode;
}) {
  const keyboardInset = useKeyboardInset();
  return (
    <DialogShell
      label={label}
      testId={testId}
      placement="home-layer"
      onClose={onClose}
      onBackdrop={onBackdrop}
      panelClassName="ingredient-editor-sheet"
      panelStyle={
        keyboardInset > 0
          ? ({ '--home-layer-keyboard': `${keyboardInset}px` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </DialogShell>
  );
}
