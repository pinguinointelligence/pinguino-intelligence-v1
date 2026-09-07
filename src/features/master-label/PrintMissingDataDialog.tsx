import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogShell } from '@/components/ui/DialogShell';
import type { MasterLabelData } from './masterLabel';
import {
  applyPrintMissingValues,
  printMissingFields,
  type PrintMissingField,
} from './printMissingData';

const INPUT_CLASS =
  'pro-focus-ring mt-1 min-h-11 w-full rounded-[10px] border border-ink/15 bg-white px-3 text-sm text-ink';

export function PrintMissingDataDialog({
  label,
  busy,
  onApply,
  onSkip,
  onClose,
}: {
  label: MasterLabelData;
  busy: boolean;
  onApply: (label: MasterLabelData) => Promise<void>;
  onSkip: () => Promise<void>;
  onClose: () => void;
}) {
  const fields = useMemo(() => printMissingFields(label), [label]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, field.value])),
  );
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const change = (field: PrintMissingField, value: string) => {
    setValues((current) => ({ ...current, [field.id]: value }));
    setDirty((current) => new Set(current).add(field.id));
  };

  return (
    <DialogShell
      label="Brakujące dane etykiety"
      testId="label-print-missing-dialog"
      placement="center"
      size="default"
      panelClassName="max-h-[min(86vh,760px)] overflow-y-auto p-4 sm:p-5"
      onClose={onClose}
    >
      <header>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-stone-500 uppercase">
          Przed wydrukiem
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-ink">
          Uzupełnij tylko to, co chcesz
        </h2>
      </header>

      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <label key={field.id} className="block text-xs font-medium text-stone-600">
            {field.label}
            {field.kind === 'select' ? (
              <select
                value={values[field.id] ?? ''}
                onChange={(event) => change(field, event.currentTarget.value)}
                className={INPUT_CLASS}
                data-testid={`label-print-missing-${field.id}`}
              >
                <option value="">Nie uzupełniam</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.kind}
                min={field.kind === 'number' ? 0 : undefined}
                step={field.kind === 'number' ? 'any' : undefined}
                value={values[field.id] ?? ''}
                onChange={(event) => change(field, event.currentTarget.value)}
                className={INPUT_CLASS}
                data-testid={`label-print-missing-${field.id}`}
              />
            )}
            {field.help ? (
              <span className="mt-1 block text-[11px] font-normal leading-relaxed text-stone-500">
                {field.help}
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">
        Nieuzupełnione informacje nie pojawią się na etykiecie. Za treść etykiety odpowiada
        producent.
      </p>

      <footer className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button
          className="rounded-full sm:col-span-2"
          disabled={busy}
          data-testid="label-print-missing-apply"
          onClick={() => void onApply(applyPrintMissingValues(label, values, dirty))}
        >
          Uzupełnij i pokaż podgląd
        </Button>
        <Button
          variant="ghost"
          className="rounded-full"
          disabled={busy}
          data-testid="label-print-missing-skip"
          onClick={() => void onSkip()}
        >
          Drukuj bez uzupełniania
        </Button>
        <Button
          variant="ghost"
          className="rounded-full"
          disabled={busy}
          data-testid="label-print-missing-back"
          onClick={onClose}
        >
          Wróć
        </Button>
      </footer>
    </DialogShell>
  );
}
