import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogShell } from '@/components/ui/DialogShell';
import type { MasterLabelData } from './masterLabel';
import {
  applyPrintMissingValues,
  printMissingFields,
  validatePrintMissingValues,
  type PrintMissingField,
} from './printMissingData';
import { MissingLabelDataFields } from './MissingLabelDataFields';

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = (field: PrintMissingField, value: string) => {
    setValues((current) => ({ ...current, [field.id]: value }));
    setDirty((current) => new Set(current).add(field.id));
    setErrors((current) => {
      if (!current[field.id]) return current;
      const next = { ...current };
      delete next[field.id];
      return next;
    });
  };
  const apply = () => {
    const nextErrors = validatePrintMissingValues(label, values, dirty);
    setErrors({ ...nextErrors });
    if (Object.keys(nextErrors).length > 0) return;
    void onApply(applyPrintMissingValues(label, values, dirty));
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

      <div className="mt-4">
        <MissingLabelDataFields fields={fields} values={values} errors={errors} onChange={change} />
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
          onClick={apply}
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
