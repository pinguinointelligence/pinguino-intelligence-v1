import { useState } from 'react';
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
  displayValueToGrams,
  gramsToDisplayValue,
  requiredRemovalRoute,
  type IngredientCustomerRole,
  type IngredientDisplayUnit,
  type IngredientRowMeta,
  type SubstituteCandidate,
} from './ingredientTableUx';

const b = copy.studio.builder;
const t = b.ingredientTable;

export type IngredientTableMode = 'recipe' | 'production';

/** Recipe mode only: Ingredient | % + lock | quantity + lock/unit | price | menu. */
export const ROW_GRID =
  'grid grid-cols-2 items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(180px,1.7fr)_minmax(112px,0.65fr)_minmax(156px,0.9fr)_112px_34px]';
export const PRODUCTION_ROW_GRID =
  'grid grid-cols-1 items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(140px,1.4fr)_78px_minmax(220px,1.2fr)_76px]';

const inputClass =
  'h-8 w-full rounded-sm border border-ink/15 bg-white px-2 text-right font-mono text-xs tabular-nums text-ink transition-colors hover:border-ink/30 focus:border-ink/45 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

export interface IngredientRowActions {
  setPlannedGrams: (lineId: string, grams: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  setMainIngredient: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  setCustomerRole?: (lineId: string, role: 'main' | IngredientCustomerRole) => void;
  toggleRequired?: (lineId: string) => void;
  setIngredientUnavailable?: (lineId: string, unavailable: boolean) => void;
  removeRequiredIngredient?: (lineId: string, name: string) => void;
  selectSubstitute?: (lineId: string, candidate: SubstituteCandidate) => void;
  /** Retained store capability; Recipe mode intentionally no longer calls it. */
  markIngredientUnavailable?: (lineId: string) => void;
}

export interface ProductionRowActions {
  setDraftActual: (lineId: string, grams: number) => void;
  confirmLine: (lineId: string) => void;
  reopenRecord: (lineId: string) => void;
}

export interface IngredientRowLockView {
  state: 'ai' | 'locked' | 'range';
  lockedGramsLabel: string | null;
  ariaLabel: string;
  title: string;
  badge: string | null;
  plannedDisabled: boolean;
  toggleDisabled: boolean;
  onToggle: () => void;
}

function LockGlyph({ closed }: { closed: boolean }) {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5.2" width="8" height="5.4" rx="1" fill="currentColor" />
      <path
        d={closed ? 'M3.8 5V3.6a2.2 2.2 0 1 1 4.4 0V5' : 'M3.8 5V3.6a2.2 2.2 0 0 1 4.3-.7'}
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function MainRoleGlyph() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gold">
      <path d="M2 5.5 5.3 8 8 3l2.7 5L14 5.5l-1 6H3l-1-6Z" fill="currentColor" />
    </svg>
  );
}

function AdditionRoleGlyph() {
  return (
    <span
      aria-label="Dodatek"
      title={t.role.additionHint}
      className="grid size-3.5 place-items-center rounded-full border border-nonprod/45 text-[10px] font-semibold leading-none text-nonprod"
    >
      +
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[9px] font-semibold tracking-[0.08em] text-stone-500 uppercase md:hidden">
      {children}
    </span>
  );
}

const percentLockDetails = {
  limitation: 'Blokada udziału procentowego nie jest jeszcze podłączona do solvera.',
  calculationImpact: 'Przeliczenie nie zachowuje ustawionego udziału.',
  remaining: 'Zapisać docelowy udział i egzekwować go w Preview, Apply oraz solverze.',
};

function DialogShell({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" data-testid={testId}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-[min(520px,94vw)] rounded-sm border border-ink/15 bg-white p-5 text-ink shadow-[0_18px_60px_rgba(16,17,19,0.2)]"
      >
        {children}
      </section>
    </div>
  );
}

export function SubstituteDialog({
  ingredientName,
  candidates,
  onUse,
  onClose,
}: {
  ingredientName: string;
  candidates: readonly SubstituteCandidate[];
  onUse?: (candidate: SubstituteCandidate) => void;
  onClose: () => void;
}) {
  return (
    <DialogShell label={t.substituteDialog.title(ingredientName)} testId="ingredient-substitute-dialog">
      <p className="text-[10px] font-semibold tracking-label text-stone-500 uppercase">
        {t.substituteDialog.pending}
      </p>
      <h2 className="mt-2 text-lg font-semibold">{t.substituteDialog.title(ingredientName)}</h2>
      {candidates.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-stone-600">{t.substituteDialog.intro}</p>
          <ol className="mt-4 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="border border-ink/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">{candidate.name}</strong>
                    <p className="mt-1 text-[10px] font-semibold text-stone-500">
                      {candidate.fit === 'direct'
                        ? t.substituteDialog.direct
                        : t.substituteDialog.reformulation}
                    </p>
                    <p className="mt-2 text-xs text-stone-600">{candidate.expectedImpact}</p>
                    <p className="mt-1 text-xs text-stone-600">{candidate.compatibility}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUse?.(candidate)}
                    className="shrink-0 rounded-sm bg-ink px-3 py-2 text-xs font-semibold text-white"
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
        className="mt-5 rounded-sm border border-ink/20 px-4 py-2 text-xs font-semibold"
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
      <DialogShell label={t.requiredDialog.confirmTitle} testId="required-removal-confirm-dialog">
        <h2 className="text-lg font-semibold">{t.requiredDialog.confirmTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t.requiredDialog.confirmBody}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border border-ink/20 px-4 py-2 text-xs font-semibold">
            {t.requiredDialog.keep}
          </button>
          <button type="button" onClick={onConfirmDestructive} className="rounded-sm border border-status-error/45 bg-status-error px-4 py-2 text-xs font-semibold text-white">
            {t.requiredDialog.confirm}
          </button>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell label={t.requiredDialog.title} testId="required-removal-dialog">
      <p className="text-[10px] font-semibold tracking-label text-status-error uppercase">{ingredientName}</p>
      <h2 className="mt-2 text-lg font-semibold">{t.requiredDialog.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{t.requiredDialog.body}</p>
      {route === 'offer-substitute' ? (
        <div className="mt-4 border border-ink/10 p-3">
          <p className="text-sm font-semibold">{t.requiredDialog.substituteAvailable}</p>
          <button type="button" onClick={onFindSubstitute} className="mt-3 rounded-sm bg-ink px-4 py-2 text-xs font-semibold text-white">
            {t.recipe.findSubstitute}
          </button>
        </div>
      ) : (
        <div className="mt-4 border border-status-error/25 bg-status-error/[0.045] p-3">
          <p className="text-sm font-semibold text-status-error">{t.requiredDialog.noSubstitute}</p>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">{t.requiredDialog.noSubstituteBody}</p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className="rounded-sm border border-ink/20 px-4 py-2 text-xs font-semibold">
          {route === 'offer-substitute' ? t.substituteDialog.cancel : t.requiredDialog.keep}
        </button>
        {route === 'no-substitute' ? (
          <button type="button" onClick={onRequestDestructive} className="rounded-sm border border-status-error/45 px-4 py-2 text-xs font-semibold text-status-error">
            {t.requiredDialog.removeInfeasible}
          </button>
        ) : null}
      </div>
    </DialogShell>
  );
}

function IngredientDataDialog({ item, onClose }: { item: EffectiveRecipeItem; onClose: () => void }) {
  const estimated = !item.ingredient.is_verified || item.ingredient.confidence_score < 90;
  const rows = [
    [t.data.source, item.ingredient.source_type || 'Baza PINGÜINO'],
    [t.data.status, estimated ? t.data.estimated : t.data.verified],
    [t.data.confidence, `${item.ingredient.confidence_score}%`],
    [t.data.id, item.ingredient.canonical_ingredient_id ?? item.ingredient.id],
  ];
  return (
    <DialogShell label={`${t.data.open}: ${item.ingredient.name}`} testId="ingredient-data-dialog">
      <h2 className="text-lg font-semibold">{item.ingredient.name}</h2>
      <dl className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2 text-xs">
            <dt className="text-stone-500">{label}</dt>
            <dd className="break-all font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onClose} className="mt-5 rounded-sm border border-ink/20 px-4 py-2 text-xs font-semibold">
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
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  meta: IngredientRowMeta;
  substituteCandidates: readonly SubstituteCandidate[];
  priceView?: IngredientPriceView;
}) {
  const [unit, setUnit] = useState<IngredientDisplayUnit>('g');
  const [dialog, setDialog] = useState<'substitute' | 'required' | 'required-confirm' | 'data' | null>(null);
  const share = totalBatchG > 0 ? (item.effective_grams / totalBatchG) * 100 : null;
  const role = customerRoleFor(item.lock_type, meta);
  const isMain = role === 'main';
  const gramsLocked = lock?.state === 'locked' || item.lock_type === 'grams';
  const estimated = !item.ingredient.is_verified || item.ingredient.confidence_score < 90;
  const displayQuantity = gramsToDisplayValue(item.planned_grams, unit);
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
    else if (isMain) actions.setLockType(item.id, 'unlocked');
  };

  const requestRemove = () => {
    if (requiredRemovalRoute(meta.required, substituteCandidates) === 'normal-remove') {
      actions.removeItem(item.id);
      return;
    }
    setDialog('required');
  };

  return (
    <>
      <div className={ROW_GRID}>
        <div className="col-span-2 min-w-0 md:col-span-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {isMain ? <span aria-label="Składnik główny" title={t.role.mainHint}><MainRoleGlyph /></span> : null}
            {role === 'addition' ? <AdditionRoleGlyph /> : null}
            {meta.required ? (
              <span aria-label="Składnik wymagany" title={t.recipe.requiredHint} className="grid size-3.5 place-items-center rounded-full border border-ink/30 text-[9px] font-bold text-ink">!</span>
            ) : null}
            <span className="truncate text-[13px] font-semibold text-ink" title={item.ingredient.name}>{item.ingredient.name}</span>
            {estimated ? (
              <span aria-label={t.data.estimatedHint} title={t.data.estimatedHint} className="size-1.5 shrink-0 rounded-full bg-status-risky" data-testid={`row-estimated-${item.id}`} />
            ) : null}
          </span>
          {meta.unavailable ? (
            <span className="mt-1 flex items-center gap-2 text-[9px] font-semibold text-status-error">
              {t.recipe.unavailableStatus}
              <button type="button" onClick={() => setDialog('substitute')} className="text-nonprod underline decoration-nonprod/35 underline-offset-2">
                {t.recipe.findSubstitute} · {t.substituteDialog.pending}
              </button>
            </span>
          ) : null}
        </div>

        <div>
          <FieldLabel>{t.columns.percent}</FieldLabel>
          <div className="flex items-center justify-end gap-1.5">
            <span className="min-w-14 text-right font-mono text-xs font-semibold tabular-nums text-ink">
              {share === null ? '—' : `${share.toFixed(1)}%`}
            </span>
            <button
              type="button"
              disabled
              aria-label={`${item.ingredient.name} — blokada procentowa w przygotowaniu`}
              aria-pressed="false"
              title={percentLockDetails.limitation}
              data-testid={`row-lock-percent-${item.id}`}
              className="grid size-7 shrink-0 place-items-center rounded-sm border border-nonprod/45 bg-nonprod/[0.055] text-nonprod"
            >
              <LockGlyph closed={false} />
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>{t.columns.quantity}</FieldLabel>
          <div className="flex items-center gap-1">
            <input
              aria-label={`${item.ingredient.name} — ilość w ${unit}`}
              type="number"
              min={0}
              step={unit === 'kg' ? 0.001 : 0.1}
              disabled={lock?.plannedDisabled || gramsLocked}
              value={Number(displayQuantity.toFixed(unit === 'kg' ? 3 : 1))}
              onChange={(event) =>
                actions.setPlannedGrams(
                  item.id,
                  Math.max(0, displayValueToGrams(Number(event.currentTarget.value) || 0, unit)),
                )
              }
              className={cn(inputClass, 'min-w-0', gramsLocked && 'border-ink/45')}
            />
            <select
              aria-label={`${item.ingredient.name} — jednostka ilości`}
              value={unit}
              onChange={(event) => setUnit(event.currentTarget.value as IngredientDisplayUnit)}
              data-testid={`row-unit-${item.id}`}
              className="h-8 w-12 shrink-0 rounded-sm border border-ink/15 bg-white px-1 font-mono text-[10px] text-ink focus:border-ink/40 focus:outline-none"
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
            <button
              type="button"
              aria-pressed={gramsLocked}
              aria-label={`${gramsLocked ? 'Odblokuj' : 'Zablokuj'} gramaturę: ${item.ingredient.name}`}
              title={lock?.title ?? b.lockTypes.grams}
              disabled={lock?.toggleDisabled || isMain}
              data-testid={`row-lock-grams-${item.id}`}
              onClick={() => lock?.onToggle() ?? actions.setLockType(item.id, gramsLocked ? 'unlocked' : 'grams')}
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-sm border transition-colors',
                gramsLocked
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 bg-white text-stone-500 hover:border-ink/40 hover:text-ink',
                (lock?.toggleDisabled || isMain) && 'cursor-not-allowed opacity-35',
              )}
            >
              <LockGlyph closed={gramsLocked} />
              {gramsLocked ? <span className="sr-only">Zablokowana</span> : null}
            </button>
          </div>
        </div>

        <IngredientPriceCell view={resolvedPriceView} />

        <details className="relative justify-self-end">
          <summary aria-label={`Opcje składnika ${item.ingredient.name}`} className="grid size-7 cursor-pointer list-none place-items-center rounded-sm border border-ink/10 text-sm text-stone-500 hover:border-ink/35 hover:text-ink">•••</summary>
          <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-72 overflow-auto border border-ink/15 bg-white p-2 shadow-[0_8px_24px_rgba(16,17,19,0.08)]" data-testid={`row-menu-${item.id}`}>
            <MenuHeading>{t.role.heading}</MenuHeading>
            <MenuButton selected={role === 'main'} disabled={gramsLocked} onClick={() => setRole('main')}>{t.role.main}</MenuButton>
            <MenuButton selected={role === 'standard'} onClick={() => setRole('standard')}>{t.role.standard}</MenuButton>
            <MenuButton selected={role === 'addition'} onClick={() => setRole('addition')}>
              <span className="flex items-center justify-between gap-2"><span>{t.role.addition}</span><span className="text-[8px] font-semibold text-nonprod">{t.role.additionReadiness}</span></span>
            </MenuButton>

            <MenuDivider />
            <MenuHeading>{t.recipe.heading}</MenuHeading>
            <MenuButton selected={meta.required} onClick={() => actions.toggleRequired?.(item.id)}>{meta.required ? t.recipe.requiredOn : t.recipe.requiredOff}</MenuButton>
            <MenuButton selected={meta.unavailable} onClick={() => actions.setIngredientUnavailable?.(item.id, !meta.unavailable)}>{meta.unavailable ? t.recipe.available : t.recipe.unavailable}</MenuButton>
            <button type="button" onClick={() => setDialog('substitute')} className="w-full px-2 py-1.5 text-left text-[11px] text-nonprod hover:bg-nonprod/[0.045]">
              {t.recipe.findSubstitute} · {t.substituteDialog.pending}
            </button>

            <MenuDivider />
            <MenuHeading>{t.data.heading}</MenuHeading>
            <MenuButton onClick={() => setDialog('data')}>{t.data.open}</MenuButton>
            <CustomerPriceEditor view={priceView} />

            <MenuDivider />
            <MenuHeading>{t.remove.heading}</MenuHeading>
            <button type="button" onClick={requestRemove} className="w-full px-2 py-1.5 text-left text-[11px] text-status-error hover:bg-status-error/[0.05]">{t.remove.action}</button>
            <span className="sr-only">{t.percentReadiness}</span>
          </div>
        </details>
      </div>

      {dialog === 'substitute' ? (
        <SubstituteDialog
          ingredientName={item.ingredient.name}
          candidates={substituteCandidates}
          onUse={(candidate) => actions.selectSubstitute?.(item.id, candidate)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'required' || dialog === 'required-confirm' ? (
        <RequiredRemovalDialog
          ingredientName={item.ingredient.name}
          candidates={substituteCandidates}
          confirmDestructive={dialog === 'required-confirm'}
          onFindSubstitute={() => setDialog('substitute')}
          onRequestDestructive={() => setDialog('required-confirm')}
          onConfirmDestructive={() => {
            actions.removeRequiredIngredient?.(item.id, item.ingredient.name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'data' ? <IngredientDataDialog item={item} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
function MenuHeading({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 pt-1 text-[9px] font-semibold tracking-[0.08em] text-stone-400 uppercase">{children}</p>;
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
        'w-full px-2 py-1.5 text-left text-[11px] text-ink hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35',
        selected && 'bg-stone-100 font-semibold',
      )}
    >
      {children}
    </button>
  );
}

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
  const displayedValue = String(Math.round(value * 1_000) / 1_000);

  return (
    <div
      className={PRODUCTION_ROW_GRID}
      data-production-confirmed={line.confirmed ? 'true' : 'false'}
    >
      <div className="min-w-0">
        <span className="truncate text-[13px] font-semibold text-ink">{item.ingredient.name}</span>
        {line.physicalAddedGrams > 0 && !line.confirmed ? (
          <span className="mt-0.5 block text-[9px] text-stone-500">
            W naczyniu: {line.physicalAddedGrams.toFixed(1)} g
          </span>
        ) : null}
      </div>
      <div className="text-left font-mono text-xs tabular-nums text-ink md:text-right">
        <FieldLabel>Plan</FieldLabel>
        {line.plannedGrams.toFixed(1)} g
      </div>
      <div>
        <FieldLabel>Faktycznie · potwierdź</FieldLabel>
        <div
          className="grid grid-cols-[44px_minmax(74px,1fr)_44px_48px] items-stretch"
          data-testid={`production-stepper-${line.lineId}`}
        >
          <button
            type="button"
            disabled={line.confirmed}
            aria-label={`${item.ingredient.name} — zmniejsz o ${step} g`}
            onClick={() => setValue(value - step)}
            className="grid min-h-11 place-items-center border border-r-0 border-ink/15 bg-white text-lg font-medium text-ink transition-colors hover:bg-stone-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ink disabled:bg-stone-100 disabled:text-stone-400"
          >
            −
          </button>
          <label className="relative min-w-0">
            <span className="sr-only">{item.ingredient.name} — faktyczna gramatura</span>
            <input
              type="number"
              min={minimum}
              step="any"
              inputMode="decimal"
              value={displayedValue}
              disabled={line.confirmed}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isFinite(next)) setValue(next);
              }}
              className="h-11 w-full border border-ink/15 bg-white px-2 pr-5 text-right font-mono text-sm font-semibold tabular-nums text-ink focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ink disabled:bg-stone-100"
            />
            <span className="pointer-events-none absolute right-1.5 top-3 text-[9px] text-stone-500">g</span>
          </label>
          <button
            type="button"
            disabled={line.confirmed}
            aria-label={`${item.ingredient.name} — zwiększ o ${step} g`}
            onClick={() => setValue(value + step)}
            className="grid min-h-11 place-items-center border border-l-0 border-ink/15 bg-white text-lg font-medium text-ink transition-colors hover:bg-stone-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ink disabled:bg-stone-100 disabled:text-stone-400"
          >
            +
          </button>
          <button
            type="button"
            aria-label={
              line.confirmed
                ? `${item.ingredient.name} — popraw zapis`
                : `${item.ingredient.name} — potwierdź dodanie`
            }
            title={
              line.confirmed
                ? 'Zmienia zapis faktycznej ilości — użyj tylko jeśli poprzednia wartość została wpisana błędnie.'
                : 'Potwierdź, że ta ilość została fizycznie dodana.'
            }
            onClick={() =>
              line.confirmed
                ? actions.reopenRecord(line.lineId)
                : actions.confirmLine(line.lineId)
            }
            className={cn(
              'grid min-h-11 place-items-center border border-l-0 text-base font-semibold focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ink',
              line.confirmed
                ? 'border-status-ideal/35 bg-status-ideal/[0.08] text-status-ideal'
                : 'border-ink bg-ink text-white hover:bg-ink-soft',
            )}
          >
            {line.confirmed ? '↺' : '✓'}
          </button>
        </div>
        {correctionMode ? (
          <p
            className="mt-1 text-[9px] leading-snug text-attention"
            data-testid={`production-record-correction-${line.lineId}`}
          >
            Poprawiasz zapis faktycznej ilości — tylko jeśli poprzednia wartość była wpisana
            błędnie.
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          'font-mono text-xs tabular-nums md:text-right',
          exact ? 'text-stone-500' : 'text-attention',
        )}
      >
        <FieldLabel>Różnica</FieldLabel>
        {difference > 0 ? '+' : ''}
        {difference.toFixed(1)} g
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
}) {
  return (
    <div
      className={cn(
        'border-b border-ink/[0.075] px-3 py-1.5 transition-colors hover:bg-stone-50',
        mode === 'recipe' && meta.unavailable && 'border-status-error/20 bg-status-error/[0.045] hover:bg-status-error/[0.06]',
      )}
      data-ingredient-mode={mode}
      data-unavailable={mode === 'recipe' && meta.unavailable ? 'true' : undefined}
      data-line-id={item.id}
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
        />
      )}
    </div>
  );
}
