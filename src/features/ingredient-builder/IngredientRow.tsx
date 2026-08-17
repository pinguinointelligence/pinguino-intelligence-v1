import { useEffect, useRef, useState } from 'react';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem, LockType } from '@/engine';
import { cn } from '@/lib/cn';
import { effectiveCostForIngredient } from '@/features/pro-core/effectiveRecipePricing';
import { effectiveLineCost } from '@/features/pro-core/costing';
import {
  CustomerPriceEditor,
  IngredientPriceCell,
  type IngredientPriceView,
} from './IngredientPriceControl';
import {
  productionStepForGrams,
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
import { DirectNumberControl } from './DirectNumberControl';
import { ProductionActualControl } from '@/features/production-workspace/ProductionActualControl';

const b = copy.studio.builder;
const t = b.ingredientTable;

export type IngredientTableMode = 'recipe' | 'production';

/** Recipe mode only: Ingredient | % + lock | quantity + lock/unit | price | menu. */
export const ROW_GRID =
  'grid grid-cols-1 items-center gap-x-3 gap-y-3 md:grid-cols-[minmax(180px,1.5fr)_minmax(174px,0.85fr)_minmax(202px,1fr)_96px_44px] 2xl:grid-cols-[minmax(300px,1fr)_222px_260px_76px_44px]';
export const PRODUCTION_ROW_GRID =
  'grid grid-cols-1 items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(140px,1.4fr)_78px_minmax(220px,1.2fr)_76px]';

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
        Brak własnej wagi oznacza równy podział. Gramy startowe nie ustalają proporcji.
      </span>
    </label>
  );
}

export interface ProductionRowActions {
  setDraftActual: (lineId: string, grams: number) => void;
  confirmLine: (lineId: string) => void;
  reopenRecord: (lineId: string) => void;
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

function MainRoleGlyph({ active = true }: { active?: boolean }) {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={active ? 'text-gold' : 'text-stone-300'}
    >
      <path d="M2 5.5 5.3 8 8 3l2.7 5L14 5.5l-1 6H3l-1-6Z" fill="currentColor" />
    </svg>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase md:hidden">
      {children}
    </span>
  );
}

function LockGlyph({ locked }: { locked: boolean }) {
  return (
    <svg
      aria-hidden
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path
        d={locked ? 'M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2' : 'M10.75 7V5a2.75 2.75 0 0 0-5.5 0'}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DialogShell({
  label,
  testId,
  children,
  onClose,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"
      data-testid={testId}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="max-h-[min(86vh,760px)] w-[min(520px,94vw)] overflow-y-auto rounded-[24px] border border-ink/15 bg-white p-5 text-ink shadow-pro-md"
      >
        {children}
      </section>
    </div>
  );
}

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
  const rows = [
    [t.data.source, item.ingredient.source_type || 'Baza PINGÜINO'],
    [t.data.status, estimated ? t.data.estimated : t.data.verified],
    [t.data.confidence, `${item.ingredient.confidence_score}%`],
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
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2 text-xs">
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
}) {
  const unit = 'g' as const;
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<
    'substitute' | 'required' | 'required-confirm' | 'data' | null
  >(null);
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
    setRowMenuOpen(false);
    if (requiredRemovalRoute(required, substituteCandidates) === 'normal-remove') {
      actions.removeItem(item.id);
      return;
    }
    setDialog('required');
  };

  const openSubstitute = () => {
    setRowMenuOpen(false);
    setDialog('substitute');
    if (!actions.requestSubstitutes) return;
    setSubstitutesLoading(true);
    void actions
      .requestSubstitutes(item.id)
      .then(setLoadedSubstitutes)
      .catch(() => setLoadedSubstitutes([]))
      .finally(() => setSubstitutesLoading(false));
  };

  return (
    <>
      <div
        className={ROW_GRID}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onDrop?.(item.id);
        }}
        data-scope="BASE_FORMULATION"
      >
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5 2xl:gap-1">
            <span
              aria-hidden
              draggable
              onDragStart={() => onDragStart?.(item.id)}
              className="inline-grid size-11 shrink-0 cursor-grab select-none place-items-center text-base leading-none text-stone-400 active:cursor-grabbing md:size-6 2xl:order-1 2xl:size-5"
              title="Przeciągnij, aby zmienić kolejność"
            >
              ⠿
            </span>
            <button
              type="button"
              aria-label={isMain ? 'Zmień na składnik standardowy' : 'Ustaw jako składnik główny'}
              aria-pressed={isMain}
              title={isMain ? 'Główny — kliknij, aby ustawić Standardowy' : t.role.mainHint}
              disabled={!isMain && Boolean(mainUnavailableReason)}
              onClick={() => setRole(isMain ? 'standard' : 'main')}
              data-testid={`row-main-toggle-${item.id}`}
              className={cn(
                'pro-focus-ring grid size-8 shrink-0 place-items-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-35 2xl:order-10 2xl:size-6',
                isMain && '2xl:flex 2xl:w-auto 2xl:gap-1 2xl:px-2',
                isMain
                  ? 'border-gold/22 bg-education-ivory'
                  : 'border-transparent bg-transparent hover:border-gold/18 hover:bg-education-ivory/55',
              )}
            >
              <MainRoleGlyph active={isMain} />
              {isMain ? (
                <span className="hidden text-[11px] font-semibold text-gold 2xl:inline">
                  Główny
                </span>
              ) : null}
            </button>
            {isMain ? (
              <span
                aria-label="Składnik główny"
                title={t.role.mainHint}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-education-ivory px-2 py-1 text-xs font-semibold text-gold 2xl:hidden"
              >
                <span>Główny</span>
              </span>
            ) : null}
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
              className="truncate text-[13px] font-semibold text-ink 2xl:order-2"
              title={item.ingredient.name}
            >
              {item.ingredient.name}
            </span>
            {estimated ? (
              <span
                aria-label={t.data.estimatedHint}
                title={t.data.estimatedHint}
                className="mr-auto size-1.5 shrink-0 rounded-full bg-status-risky 2xl:order-3"
                data-testid={`row-estimated-${item.id}`}
              />
            ) : null}
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
              <strong className="block font-semibold">Brak zweryfikowanej dawki.</strong>
              Podaj ilość zgodnie z zaleceniem producenta lub własną recepturą.
            </span>
          ) : null}
        </div>

        <div>
          <FieldLabel>{t.columns.percent}</FieldLabel>
          <div className="flex items-center justify-end gap-1.5">
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
            />
            <button
              type="button"
              disabled={lock?.percentToggleDisabled ?? true}
              onClick={lock?.onTogglePercent}
              aria-label={`${item.ingredient.name} — ${lock?.percentLocked ? '% partii zablokowany. Odblokuj' : 'Zablokuj % partii'}`}
              aria-pressed={lock?.percentLocked ?? false}
              title={
                lock?.percentLocked
                  ? `Udział zablokowany: ${lock.percentLabel ?? ''}`
                  : 'Zablokuj procent finalnej partii'
              }
              data-testid={`row-lock-percent-${item.id}`}
              className={cn(
                'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-2 font-mono text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
                lock?.percentLocked
                  ? 'border-ink bg-ink text-white shadow-pro-sm'
                  : 'border-ink/15 bg-white text-stone-500 hover:border-gold/50 hover:text-gold',
              )}
            >
              <LockGlyph locked={lock?.percentLocked ?? false} />
              <span aria-hidden>%</span>
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>{t.columns.quantity}</FieldLabel>
          <div className="flex items-center gap-1.5">
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
            />
            <button
              type="button"
              aria-pressed={gramsLocked}
              aria-label={`${item.ingredient.name} — ${gramsLocked ? 'Gramatura zablokowana. Odblokuj' : 'Zablokuj gramy'}`}
              title={lock?.title ?? b.lockTypes.grams}
              disabled={lock?.toggleDisabled}
              data-testid={`row-lock-grams-${item.id}`}
              onClick={() =>
                lock?.onToggle() ?? actions.setLockType(item.id, gramsLocked ? 'unlocked' : 'grams')
              }
              className={cn(
                'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-2 font-mono text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                gramsLocked
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 bg-white text-stone-500 hover:border-ink/40 hover:text-ink',
                lock?.toggleDisabled && 'cursor-not-allowed opacity-35',
              )}
            >
              <LockGlyph locked={gramsLocked} />
              <span aria-hidden>g</span>
              {gramsLocked ? <span className="sr-only">Zablokowana</span> : null}
            </button>
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
            className="pro-focus-ring grid size-11 place-items-center rounded-full border border-ink/10 text-sm text-stone-500 hover:border-ink/35 hover:text-ink"
          >
            •••
          </button>
          {rowMenuOpen ? (
            <DialogShell
              label={`Opcje składnika ${item.ingredient.name}`}
              testId={`row-menu-${item.id}`}
              onClose={() => setRowMenuOpen(false)}
            >
              <div id={`row-menu-dialog-${item.id}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong className="text-sm text-ink">{item.ingredient.name}</strong>
                  <button
                    type="button"
                    onClick={() => setRowMenuOpen(false)}
                    className="grid size-11 place-items-center rounded-full border border-ink/12 text-lg text-ink"
                    aria-label="Zamknij opcje składnika"
                  >
                    ×
                  </button>
                </div>
                <MenuHeading>{t.role.heading}</MenuHeading>
                <MenuButton
                  selected={role === 'main'}
                  disabled={Boolean(mainUnavailableReason)}
                  onClick={() => {
                    setRole('main');
                    setRowMenuOpen(false);
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
                    setRowMenuOpen(false);
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
                    setRowMenuOpen(false);
                  }}
                >
                  Przesuń wyżej
                </MenuButton>
                <MenuButton
                  disabled={!canMoveDown}
                  onClick={() => {
                    actions.moveDown?.(item.id);
                    setRowMenuOpen(false);
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
                    setRowMenuOpen(false);
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
                    setRowMenuOpen(false);
                    setDialog('data');
                  }}
                >
                  {t.data.open}
                </MenuButton>
                <CustomerPriceEditor view={priceView} />

                <MenuDivider />
                <MenuHeading>{t.remove.heading}</MenuHeading>
                <button
                  type="button"
                  onClick={requestRemove}
                  className="min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-status-error hover:bg-status-error/[0.05]"
                >
                  {t.remove.action}
                </button>
              </div>
            </DialogShell>
          ) : null}
        </div>
      </div>

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
  const value = line.confirmed ? line.physicalAddedGrams : line.draftActualGrams;
  const difference = value - line.plannedGrams;
  const exact = Math.abs(difference) <= 0.05;
  const step = productionStepForGrams(line.targetGrams);
  const correctionMode = !line.confirmed && line.recordCorrectionCount > 0;
  const minimum = correctionMode ? 0 : line.physicalAddedGrams;
  const setValue = (next: number) => actions.setDraftActual(line.lineId, Math.max(minimum, next));

  return (
    <div
      className={PRODUCTION_ROW_GRID}
      data-production-confirmed={line.confirmed ? 'true' : 'false'}
      data-production-mode={correctionMode ? 'correction' : 'addition'}
    >
      <div className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink">
          {item.ingredient.name}
        </span>
        <span
          className={cn(
            'mt-1 inline-flex min-h-6 items-center rounded-full border px-2 text-[10px] font-semibold',
            correctionMode
              ? 'border-attention/30 bg-pro-amber text-attention'
              : line.confirmed
                ? 'border-status-ideal/25 bg-pro-sage text-status-ideal'
                : 'border-ink/10 bg-stone-50 text-stone-600',
          )}
          data-testid={`production-mode-${line.lineId}`}
          role="status"
          aria-live="polite"
        >
          {correctionMode ? 'Korekta zapisu' : line.confirmed ? 'Potwierdzono' : 'Dodawanie'}
        </span>
        {line.physicalAddedGrams > 0 && !line.confirmed ? (
          <span className="mt-0.5 block text-xs text-stone-600">
            W naczyniu: {formatProductionMassG(line.physicalAddedGrams)} g
          </span>
        ) : null}
      </div>
      <div className="rounded-[14px] border border-ink/8 bg-stone-50 px-3 py-2 text-left md:text-right">
        <span className="block text-[10px] font-semibold text-stone-600 md:block">Plan</span>
        <strong className="font-mono text-sm tabular-nums text-ink">
          {formatProductionMassG(line.plannedGrams)} g
        </strong>
      </div>
      <div>
        <FieldLabel>Faktycznie · potwierdź</FieldLabel>
        <ProductionActualControl
          lineId={line.lineId}
          ingredientName={item.ingredient.name}
          value={value}
          minimum={minimum}
          step={step}
          confirmed={line.confirmed}
          correctionMode={correctionMode}
          onChange={setValue}
          onConfirm={() =>
            line.confirmed ? actions.reopenRecord(line.lineId) : actions.confirmLine(line.lineId)
          }
          describedBy={correctionMode ? `production-correction-${line.lineId}` : undefined}
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
        className={cn(
          'rounded-[14px] border px-3 py-2 md:text-right',
          exact
            ? 'border-ink/8 bg-stone-50 text-stone-600'
            : 'border-attention/25 bg-pro-amber/65 text-attention',
        )}
        data-testid={`production-difference-${line.lineId}`}
        data-production-difference={exact ? 'exact' : difference > 0 ? 'over' : 'under'}
        role="status"
        aria-live="polite"
        aria-label={`Różnica względem planu: ${difference > 0 ? 'plus ' : difference < 0 ? 'minus ' : ''}${formatProductionMassG(Math.abs(difference))} gramów${exact ? ', zgodnie z planem' : difference > 0 ? ', powyżej planu' : ', poniżej planu'}`}
      >
        <FieldLabel>Różnica</FieldLabel>
        <span className="block text-[10px] font-semibold">Odchylenie</span>
        <strong className="block font-mono text-sm tabular-nums">
          {difference > 0 ? '+' : ''}
          {formatProductionMassG(difference)} g
        </strong>
        {!exact ? (
          <span className="mt-0.5 block text-[10px] font-medium">
            {difference > 0 ? 'powyżej planu' : 'poniżej planu'}
          </span>
        ) : null}
      </div>
    </div>
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
}) {
  return (
    <div
      className={cn(
        mode === 'production'
          ? 'mx-2 mb-2 rounded-[20px] border border-ink/[0.08] bg-white/95 px-3 py-3 shadow-pro-e1 transition-colors hover:border-ink/15'
          : 'border-b border-ink/[0.075] px-3 py-3 transition-colors hover:bg-stone-50 2xl:py-[7px]',
        mode === 'recipe' &&
          customerRoleFor(item.lock_type, meta) === 'main' &&
          'border-gold/20 bg-education-ivory/55 hover:bg-education-ivory/75',
        mode === 'recipe' &&
          customerRoleFor(item.lock_type, meta) === 'addition' &&
          'bg-pro-sage/35 hover:bg-pro-sage/55',
        mode === 'recipe' &&
          meta.unavailable &&
          'border-status-error/20 bg-status-error/[0.045] hover:bg-status-error/[0.06]',
      )}
      data-ingredient-mode={mode}
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
        />
      )}
    </div>
  );
}
