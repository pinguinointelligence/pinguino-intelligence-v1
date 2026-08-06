import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { ReadinessBadge } from '@/features/design-review/ReadinessMarker';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem, LockType } from '@/engine';

const b = copy.studio.builder;

export type IngredientTableMode = 'recipe' | 'production';

export const ROW_GRID =
  'grid grid-cols-2 items-center gap-x-2 gap-y-1 md:grid-cols-[minmax(150px,1.65fr)_62px_30px_76px_30px_86px_92px_92px_34px]';
export const PRODUCTION_ROW_GRID =
  'grid grid-cols-2 items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(180px,1.8fr)_90px_100px_88px_108px]';

const inputClass =
  'h-8 w-full rounded-sm border border-ink/15 bg-white px-2 text-right font-mono text-xs tabular-nums text-ink transition-colors hover:border-ink/30 focus:border-ink/45 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

export interface IngredientRowActions {
  setPlannedGrams: (lineId: string, grams: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  setMainIngredient: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  markIngredientUnavailable?: (lineId: string) => void;
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[9px] font-semibold tracking-[0.08em] text-stone-500 uppercase md:hidden">{children}</span>;
}

function GramField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | '';
  disabled?: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <label className="relative block">
      <FieldLabel>{label}</FieldLabel>
      <input
        aria-label={label}
        type="number"
        min={0}
        disabled={disabled}
        value={value}
        placeholder={value === '' ? '—' : undefined}
        className={`${inputClass} pr-5`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span className="pointer-events-none absolute bottom-2 right-1.5 text-[9px] text-stone-500">g</span>
    </label>
  );
}

const percentLockDetails = {
  limitation: 'Blokada udziału procentowego nie jest jeszcze podłączona do solvera.',
  calculationImpact: 'Przeliczenie nie zachowuje ustawionego udziału.',
  remaining: 'Zapisać docelowy udział i egzekwować go w Preview, Apply oraz solverze.',
};

const privatePriceDetails = {
  limitation: 'Prywatna cena klienta nie jest jeszcze zapisywana na koncie.',
  calculationImpact: 'Koszt korzysta wyłącznie z ceny systemowej składnika.',
  remaining: 'Podłączyć prywatne ceny do danych konta i kalkulacji kosztu.',
};

const replacementDetails = {
  limitation: 'Wyszukiwanie zamiennika nie jest jeszcze gotowe.',
  calculationImpact: 'Wykluczony składnik nie jest ponownie dodawany, ale zamiennik nie zostanie dobrany automatycznie.',
  remaining: 'Podłączyć ranking zamienników do aktualnej receptury.',
};

function RecipeRow({
  item,
  totalBatchG,
  actions,
  lock,
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
}) {
  const share = totalBatchG > 0 ? (item.effective_grams / totalBatchG) * 100 : null;
  const isMain = item.lock_type === 'main';
  const gramsLocked = lock?.state === 'locked' || item.lock_type === 'grams';
  const price = item.ingredient.cost_per_kg;
  const contribution = price === null ? null : (price * item.effective_grams) / 1000;

  const setRole = (role: 'main' | 'supplementary') => {
    if (role === 'main') actions.setMainIngredient(item.id);
    else if (isMain) actions.setLockType(item.id, 'unlocked');
  };

  return (
    <div className={ROW_GRID}>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {isMain ? <span aria-label="Składnik główny" className="text-gold">♛</span> : null}
          <span className="truncate text-[13px] font-semibold text-ink" title={item.ingredient.name}>{item.ingredient.name}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[9px] text-stone-500">
          <span className="truncate">{item.ingredient.source_type || 'PI Base'}</span>
          <ConfidenceBadge score={item.ingredient.confidence_score} />
        </span>
      </div>

      <div className="text-right">
        <FieldLabel>Udział</FieldLabel>
        <span className="font-mono text-xs font-semibold tabular-nums text-ink">
          {share === null ? '—' : `${share.toFixed(1)}%`}
        </span>
      </div>

      <button
        type="button"
        disabled
        aria-label={`${item.ingredient.name} — blokada procentowa w przygotowaniu`}
        title={percentLockDetails.limitation}
        data-testid={`row-lock-percent-${item.id}`}
        className="grid size-7 place-items-center rounded-sm border border-nonprod/45 bg-nonprod/[0.055] font-mono text-[10px] font-semibold text-nonprod"
      >
        %
      </button>

      <GramField
        label={`${item.ingredient.name} — gramatura`}
        value={item.planned_grams}
        disabled={lock?.plannedDisabled}
        onChange={(raw) => actions.setPlannedGrams(item.id, Number(raw) || 0)}
      />

      <button
        type="button"
        aria-pressed={gramsLocked}
        aria-label={`${gramsLocked ? 'Odblokuj' : 'Zablokuj'} gramaturę: ${item.ingredient.name}`}
        title={lock?.title ?? b.lockTypes.grams}
        disabled={lock?.toggleDisabled || isMain}
        data-testid={`row-lock-grams-${item.id}`}
        onClick={() => lock?.onToggle() ?? actions.setLockType(item.id, gramsLocked ? 'unlocked' : 'grams')}
        className={cn(
          'grid size-7 place-items-center rounded-sm border transition-colors',
          gramsLocked ? 'border-ink bg-ink text-white' : 'border-ink/15 text-stone-500 hover:border-ink/40 hover:text-ink',
          (lock?.toggleDisabled || isMain) && 'cursor-not-allowed opacity-35',
        )}
      >
        <LockGlyph closed={gramsLocked} />
        {gramsLocked ? <span className="sr-only">Zablokowana</span> : null}
      </button>

      <label>
        <FieldLabel>Rola</FieldLabel>
        <select
          aria-label={`${item.ingredient.name} — rola`}
          value={isMain ? 'main' : 'supplementary'}
          disabled={gramsLocked}
          onChange={(event) => setRole(event.currentTarget.value as 'main' | 'supplementary')}
          className="h-8 w-full rounded-sm border border-ink/15 bg-white px-2 text-[11px] text-ink focus:border-ink/40 focus:outline-none disabled:opacity-45"
        >
          <option value="main">Główny</option>
          <option value="supplementary">Uzupełniający</option>
        </select>
      </label>

      <button
        type="button"
        disabled={!actions.markIngredientUnavailable}
        onClick={() => actions.markIngredientUnavailable?.(item.id)}
        data-testid={`row-mark-unavailable-${item.id}`}
        className="h-8 rounded-sm border border-status-ideal/30 bg-status-ideal/[0.07] px-2 text-[10px] font-semibold text-status-ideal transition-colors hover:border-status-error/40 hover:bg-status-error/[0.05] hover:text-status-error"
      >
        Dostępny
      </button>

      <div className="min-w-0 text-right">
        <FieldLabel>Cena/kg</FieldLabel>
        <span className="block font-mono text-[11px] tabular-nums text-ink">
          {price === null ? 'Brak ceny' : `${price.toFixed(2)} €/kg`}
        </span>
        <span className="block truncate text-[8px] text-stone-500" title={contribution === null ? 'Koszt niepełny' : `Koszt w recepturze: ${contribution.toFixed(2)} €`}>
          {contribution === null ? 'Koszt niepełny' : `${contribution.toFixed(2)} € w recepturze`}
        </span>
      </div>

      <details className="relative justify-self-end">
        <summary aria-label={`Opcje składnika ${item.ingredient.name}`} className="grid size-7 cursor-pointer list-none place-items-center rounded-sm border border-ink/10 text-sm text-stone-500 hover:border-ink/35 hover:text-ink">•••</summary>
        <div className="absolute right-0 z-40 mt-1 w-64 border border-ink/15 bg-white p-2 shadow-[0_8px_24px_rgba(16,17,19,0.08)]">
          <ReadinessBadge state="W PRZYGOTOWANIU" details={percentLockDetails} className="mb-2" />
          <button type="button" disabled className="mb-1 w-full rounded-sm border border-nonprod/30 px-2 py-1.5 text-left text-[10px] text-nonprod">
            Znajdź zamiennik · W PRZYGOTOWANIU
          </button>
          <button type="button" disabled title={privatePriceDetails.limitation} className="mb-1 w-full rounded-sm border border-nonprod/30 px-2 py-1.5 text-left text-[10px] text-nonprod">
            Moja cena · W PRZYGOTOWANIU
          </button>
          <button type="button" onClick={() => actions.setLockType(item.id, 'required')} className="w-full px-2 py-1.5 text-left text-[11px] text-ink hover:bg-stone-50">Oznacz jako wymagany</button>
          <button type="button" onClick={() => actions.setLockType(item.id, 'already_added')} className="w-full px-2 py-1.5 text-left text-[11px] text-ink hover:bg-stone-50">Oznacz jako już dodany</button>
          <button type="button" onClick={() => actions.removeItem(item.id)} className="w-full px-2 py-1.5 text-left text-[11px] text-status-error hover:bg-status-error/[0.05]">Usuń z receptury</button>
          <span className="sr-only">{replacementDetails.limitation}</span>
        </div>
      </details>
    </div>
  );
}

function ProductionRow({ item, actions }: { item: EffectiveRecipeItem; actions: IngredientRowActions }) {
  const actual = item.actual_grams;
  const difference = actual === null ? null : actual - item.planned_grams;
  const exact = difference !== null && Math.abs(difference) <= 0.05;
  const status = actual === null ? 'Do dodania' : exact ? 'Dodano zgodnie z planem' : 'Dodano inną ilość';

  return (
    <div className={PRODUCTION_ROW_GRID}>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <span className="truncate text-[13px] font-semibold text-ink">{item.ingredient.name}</span>
      </div>
      <div className="text-right font-mono text-xs tabular-nums text-ink"><FieldLabel>Planowane</FieldLabel>{item.planned_grams.toFixed(1)} g</div>
      <GramField
        label={`${item.ingredient.name} — faktycznie`}
        value={actual ?? ''}
        onChange={(raw) => actions.setActualGrams(item.id, raw === '' ? null : Math.max(0, Number(raw)))}
      />
      <div className={cn('text-right font-mono text-xs tabular-nums', difference === null || exact ? 'text-stone-500' : 'text-status-error')}>
        <FieldLabel>Różnica</FieldLabel>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference.toFixed(1)} g`}
      </div>
      <button
        type="button"
        onClick={() => actions.setActualGrams(item.id, item.planned_grams)}
        className={cn('h-8 rounded-sm border px-2 text-[10px] font-semibold', exact ? 'border-status-ideal/35 bg-status-ideal/[0.08] text-status-ideal' : actual === null ? 'border-ink/15 text-ink' : 'border-status-error/35 bg-status-error/[0.06] text-status-error')}
      >
        {status}
      </button>
    </div>
  );
}

export function IngredientRow({
  item,
  totalBatchG,
  actions,
  lock,
  mode = 'recipe',
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  lock?: IngredientRowLockView;
  compact?: boolean;
  mode?: IngredientTableMode;
}) {
  return (
    <div className="border-b border-ink/[0.075] px-3 py-1.5 transition-colors hover:bg-stone-50" data-ingredient-mode={mode}>
      {mode === 'production' ? (
        <ProductionRow item={item} actions={actions} />
      ) : (
        <RecipeRow item={item} totalBatchG={totalBatchG} actions={actions} lock={lock} />
      )}
    </div>
  );
}
