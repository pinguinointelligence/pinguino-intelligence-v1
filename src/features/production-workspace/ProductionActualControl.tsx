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
  disabled?: boolean;
  onChange: (value: number) => void;
  onConfirm: () => void;
  describedBy?: string;
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
  disabled = false,
  onChange,
  onConfirm,
  describedBy,
}: ProductionActualControlProps) {
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-stretch gap-1.5 lg:grid-cols-[minmax(0,1fr)_28px] lg:gap-1"
      data-testid={`production-actual-control-${lineId}`}
      data-production-control-family="recipe-direct-number"
      data-production-control-state={
        correctionMode ? 'correction' : confirmed ? 'confirmed' : 'addition'
      }
    >
      <DirectNumberControl
        value={value}
        step={step}
        min={minimum}
        decimals={productionControlDecimals(value, step)}
        suffix="g"
        ariaLabel={`${ingredientName} — faktyczna gramatura`}
        disabled={confirmed || disabled}
        onChange={onChange}
        testId={`production-stepper-${lineId}`}
        ariaDescribedBy={describedBy}
        preservePrecision
        density="responsive"
      />
      <button
        type="button"
        aria-label={
          confirmed ? `${ingredientName} — popraw zapis` : `${ingredientName} — potwierdź dodanie`
        }
        title={
          confirmed
            ? 'Zmienia zapis faktycznej ilości — użyj tylko jeśli poprzednia wartość została wpisana błędnie.'
            : 'Potwierdź, że ta ilość została fizycznie dodana.'
        }
        aria-describedby={describedBy}
        onClick={onConfirm}
        disabled={disabled}
        className={cn(
          'pro-focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl border text-base font-semibold transition-colors lg:min-h-7 lg:min-w-7 lg:rounded-lg lg:text-sm',
          confirmed
            ? 'border-status-ideal/35 bg-white text-status-ideal enabled:hover:bg-pro-sage'
            : correctionMode
              ? 'border-attention bg-attention text-white enabled:hover:bg-attention/90'
              : 'border-ink bg-ink text-white enabled:hover:bg-ink/90',
        )}
      >
        {confirmed ? '↺' : '✓'}
      </button>
    </div>
  );
}
