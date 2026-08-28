import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import { productionControlDecimals } from '@/features/ingredient-builder/directNumberControlModel';
import { cn } from '@/lib/cn';

interface ProductionActualControlProps {
  lineId: string;
  ingredientName: string;
  value: number;
  minimum: number;
  step: number;
  confirmed: boolean;
  correctionMode: boolean;
  topUpMode?: boolean;
  settled?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
  onConfirm: () => void;
  describedBy?: string;
  separateAction?: boolean;
}

interface ProductionConfirmationActionProps {
  ingredientName: string;
  confirmed: boolean;
  correctionMode: boolean;
  topUpMode?: boolean;
  disabled?: boolean;
  settled?: boolean;
  onConfirm: () => void;
  describedBy?: string;
}

/** The physical confirmation occupies the recipe row's familiar final action slot. */
export function ProductionConfirmationAction({
  ingredientName,
  confirmed,
  correctionMode,
  topUpMode = false,
  disabled = false,
  settled = false,
  onConfirm,
  describedBy,
}: ProductionConfirmationActionProps) {
  if (settled) {
    return (
      <span
        className="grid h-8 w-7 place-items-center rounded-lg border border-status-ideal/25 bg-pro-sage text-sm font-semibold text-status-ideal"
        aria-label={`${ingredientName} — dodano`}
        data-production-confirmation="settled"
      >
        ✓
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={
        confirmed
          ? `${ingredientName} — popraw zapis`
          : `${ingredientName} — ${topUpMode ? 'potwierdź dolewkę' : 'potwierdź dodanie'}`
      }
      title={
        confirmed
          ? 'Zmienia zapis faktycznej ilości — użyj tylko jeśli poprzednia wartość została wpisana błędnie.'
          : topUpMode
            ? 'Potwierdź, że pokazana dodatkowa ilość została teraz fizycznie dodana.'
            : 'Potwierdź, że ta ilość została fizycznie dodana.'
      }
      aria-describedby={describedBy}
      onClick={onConfirm}
      disabled={disabled}
      className={cn(
        'pro-focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl border text-base font-semibold transition-colors lg:min-h-8 lg:min-w-7 lg:rounded-lg lg:text-sm',
        confirmed
          ? 'border-status-ideal/35 bg-white text-status-ideal enabled:hover:bg-pro-sage'
          : correctionMode
            ? 'border-attention bg-attention text-white enabled:hover:bg-attention/90'
            : 'border-ink bg-ink text-white enabled:hover:bg-ink/90',
      )}
    >
      {confirmed ? '↺' : '✓'}
    </button>
  );
}

/**
 * Production uses the exact same numeric language as the recipe editor.
 * The confirm/correct action stays separate, so it cannot be mistaken for a
 * fourth value segment or silently change the physical-production contract.
 */
export function ProductionActualControl({
  lineId,
  ingredientName,
  value,
  minimum,
  step,
  confirmed,
  correctionMode,
  topUpMode = false,
  settled = false,
  disabled = false,
  onChange,
  onConfirm,
  describedBy,
  separateAction = false,
}: ProductionActualControlProps) {
  return (
    <div
      className={cn(
        'grid max-w-full min-w-0 items-stretch',
        separateAction
          ? 'w-full grid-cols-1'
          : 'w-[226px] grid-cols-[176px_44px] gap-1.5 lg:w-[154px] lg:grid-cols-[122px_28px] lg:gap-1',
      )}
      data-testid={`production-actual-control-${lineId}`}
      data-production-control-family="recipe-direct-number"
      data-production-control-state={
        correctionMode ? 'correction' : topUpMode ? 'top-up' : confirmed ? 'confirmed' : 'addition'
      }
    >
      <DirectNumberControl
        value={value}
        step={step}
        min={minimum}
        decimals={productionControlDecimals(value, step)}
        suffix="g"
        ariaLabel={`${ingredientName} — ${topUpMode ? 'dodaj teraz' : 'faktyczna gramatura'}`}
        disabled={confirmed || disabled}
        onChange={onChange}
        testId={`production-stepper-${lineId}`}
        ariaDescribedBy={describedBy}
        preservePrecision
        widthPreset="grams"
        density="responsive"
      />
      {separateAction ? null : (
        <ProductionConfirmationAction
          ingredientName={ingredientName}
          confirmed={confirmed}
          correctionMode={correctionMode}
          topUpMode={topUpMode}
          settled={settled}
          disabled={disabled}
          onConfirm={onConfirm}
          describedBy={describedBy}
        />
      )}
    </div>
  );
}
