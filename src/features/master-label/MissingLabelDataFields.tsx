import { useState } from 'react';
import type { MasterLabelData } from './masterLabel';
import {
  applyPrintMissingValues,
  printMissingFields,
  validatePrintMissingValues,
  type PrintMissingErrors,
  type PrintMissingField,
} from './printMissingData';

const INPUT_CLASS =
  'pro-focus-ring mt-1 min-h-11 w-full rounded-[10px] border border-ink/15 bg-white px-3 text-sm text-ink';

/** Shared renderer for the canonical missing-data resolver (settings and print modal). */
export function MissingLabelDataFields({
  fields,
  values,
  errors = {},
  onChange,
}: {
  fields: readonly PrintMissingField[];
  values: Readonly<Record<string, string>>;
  errors?: PrintMissingErrors;
  onChange: (field: PrintMissingField, value: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-stone-600" data-testid="label-missing-fields-complete">
        Wszystkie dostępne dane tej etykiety są uzupełnione.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="label-missing-fields">
      {fields.map((item) => (
        <label key={item.id} className="block text-xs font-medium text-stone-600">
          {item.label}
          {item.unit ? ` · ${item.unit}` : ''}
          {item.kind === 'select' ? (
            <select
              value={values[item.id] ?? ''}
              onChange={(event) => onChange(item, event.currentTarget.value)}
              className={INPUT_CLASS}
              data-testid={`label-print-missing-${item.id}`}
              aria-invalid={Boolean(errors[item.id])}
            >
              <option value="">Nie uzupełniam</option>
              {item.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={item.kind}
              min={item.kind === 'number' ? 0 : undefined}
              step={item.kind === 'number' ? 'any' : undefined}
              value={values[item.id] ?? ''}
              onChange={(event) => onChange(item, event.currentTarget.value)}
              className={INPUT_CLASS}
              data-testid={`label-print-missing-${item.id}`}
              aria-invalid={Boolean(errors[item.id])}
              aria-describedby={errors[item.id] ? `label-error-${item.id}` : undefined}
            />
          )}
          {errors[item.id] ? (
            <span
              id={`label-error-${item.id}`}
              className="mt-1 block text-[11px] font-medium leading-relaxed text-status-error"
              role="alert"
            >
              {errors[item.id]}
            </span>
          ) : item.help ? (
            <span className="mt-1 block text-[11px] font-normal leading-relaxed text-stone-500">
              {item.help}
            </span>
          ) : null}
          <span className="mt-1 block text-[10px] font-normal leading-relaxed text-stone-400">
            {item.reason} Źródło: {item.source} Możesz pominąć.
          </span>
        </label>
      ))}
    </div>
  );
}

/** Live settings adapter. It uses the same resolver, fields and validation as the print dialog. */
export function MissingLabelDataSettings({
  label,
  onChange,
}: {
  label: MasterLabelData;
  onChange: (label: MasterLabelData) => void;
}) {
  const [fields] = useState(() => printMissingFields(label));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((item) => [item.id, item.value])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = (item: PrintMissingField, value: string) => {
    const nextValues = { ...values, [item.id]: value };
    const dirty = new Set([item.id]);
    const nextErrors = validatePrintMissingValues(label, nextValues, dirty);
    setValues(nextValues);
    setErrors({ ...nextErrors });
    if (Object.keys(nextErrors).length === 0) {
      onChange(applyPrintMissingValues(label, nextValues, dirty));
    }
  };
  return (
    <MissingLabelDataFields fields={fields} values={values} errors={errors} onChange={change} />
  );
}
