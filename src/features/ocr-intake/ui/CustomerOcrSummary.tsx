import { useState } from 'react';
import type { IntakeFieldKey, ReviewedField } from '../intakeContracts';
import { resolveFieldDisplay } from './intakeUiSupport';
import { CUSTOMER_CORRECTION_FIELDS } from './customerOcrReviewPolicy';

const FIELD_LABELS: Partial<Record<IntakeFieldKey, string>> = {
  product_name: 'Nazwa produktu',
  brand: 'Marka',
  package_size: 'Ilość',
  package_unit: 'Jednostka',
  ean_code: 'Kod EAN',
  ingredients_text: 'Składniki',
  allergens_text: 'Alergeny',
  may_contain_text: 'Może zawierać',
  nutrition_basis: 'Podstawa tabeli',
  energy_kcal: 'Energia',
  fat: 'Tłuszcz',
  carbohydrate: 'Węglowodany',
  sugars: 'Cukry',
  protein: 'Białko',
  salt: 'Sól',
};

const fieldByKey = (fields: readonly ReviewedField[], key: IntakeFieldKey) =>
  fields.find((field) => field.fieldKey === key) ?? null;

function DisplayValue({ field }: { field: ReviewedField | null }) {
  if (!field) return <span className="text-stone-500">Brak danych</span>;
  const display = resolveFieldDisplay(field);
  if (display.kind === 'value') return <span>{display.value}</span>;
  if (display.kind === 'unknown') return <span className="text-stone-500">Nie podano</span>;
  if (display.kind === 'conflict') return <span className="text-amber-700">Wymaga wyboru</span>;
  return <span className="text-stone-500">Nie odczytano</span>;
}

function SummaryRow({ label, field }: { label: string; field: ReviewedField | null }) {
  return (
    <div className="grid gap-1 border-b border-ink/8 py-2 last:border-0 sm:grid-cols-[150px_1fr]">
      <dt className="text-xs font-medium text-stone-600">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">
        <DisplayValue field={field} />
      </dd>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-ink/8 py-2 last:border-0 sm:grid-cols-[150px_1fr]">
      <dt className="text-xs font-medium text-stone-600">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{value}</dd>
    </div>
  );
}

interface CustomerOcrSummaryProps {
  fields: readonly ReviewedField[];
  missingActions: readonly string[];
  market: string | null;
  onEdit: (key: IntakeFieldKey, value: string) => void;
  onConfirm: (key: IntakeFieldKey) => void;
  onMarkUnknown: (key: IntakeFieldKey) => void;
  onChooseCandidate: (key: IntakeFieldKey, index: number) => void;
}

function ReviewValueEditor({
  field,
  onEdit,
  onConfirm,
  onMarkUnknown,
}: {
  field: ReviewedField;
  onEdit: (key: IntakeFieldKey, value: string) => void;
  onConfirm: (key: IntakeFieldKey) => void;
  onMarkUnknown: (key: IntakeFieldKey) => void;
}) {
  const display = resolveFieldDisplay(field);
  const initial = display.kind === 'value' ? display.value : '';
  const [value, setValue] = useState(initial);
  return (
    <form
      className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() !== initial.trim()) onEdit(field.fieldKey, value.trim());
        else onConfirm(field.fieldKey);
      }}
    >
      <input
        aria-label={`Popraw ${FIELD_LABELS[field.fieldKey] ?? 'wartość'}`}
        className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <button
        type="submit"
        className="min-h-11 rounded-xl bg-ink px-3 text-xs font-semibold text-white"
      >
        {value.trim() === initial.trim() ? 'Potwierdź' : 'Zapisz poprawkę'}
      </button>
      <button
        type="button"
        className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-xs"
        onClick={() => onMarkUnknown(field.fieldKey)}
      >
        Nie wiem
      </button>
    </form>
  );
}

export function CustomerOcrSummary({
  fields,
  missingActions,
  market,
  onEdit,
  onConfirm,
  onMarkUnknown,
  onChooseCandidate,
}: CustomerOcrSummaryProps) {
  const productName = fieldByKey(fields, 'product_name');
  const brand = fieldByKey(fields, 'brand');
  const unresolved = fields
    .filter(
      (field) =>
        field.reviewStatus === 'needs_confirmation' || field.reviewStatus === 'conflict_unresolved',
    )
    .filter((field) => CUSTOMER_CORRECTION_FIELDS.has(field.fieldKey));
  const correctionCards = unresolved.filter(
    (field) => field.fieldKey !== 'product_name' && field.fieldKey !== 'brand',
  );
  const identityUnresolved = unresolved.some(
    (field) => field.fieldKey === 'product_name' || field.fieldKey === 'brand',
  );
  const hasRecognizedValue = (keys: readonly IntakeFieldKey[]) =>
    keys.some((key) => {
      const field = fieldByKey(fields, key);
      return field !== null && resolveFieldDisplay(field).kind === 'value';
    });
  const ingredientsStatus = hasRecognizedValue([
    'ingredients_text',
    'allergens_text',
    'may_contain_text',
  ])
    ? 'Odczytano z etykiety'
    : 'Nie potwierdzono';
  const nutritionStatus = hasRecognizedValue([
    'nutrition_basis',
    'energy_kcal',
    'fat',
    'carbohydrate',
    'sugars',
    'protein',
    'salt',
  ])
    ? 'Odczytano tabelę'
    : 'Brak potwierdzonej tabeli';

  const identityEditor = (key: 'product_name' | 'brand', field: ReviewedField | null) => {
    const display = field ? resolveFieldDisplay(field) : { kind: 'missing' as const };
    const value = display.kind === 'value' ? display.value : '';
    const needsConfirmation = field?.reviewStatus === 'needs_confirmation';
    return (
      <div className="rounded-xl border border-ink/10 p-3">
        <label className="text-xs font-medium text-stone-600" htmlFor={`ocr-${key}`}>
          {FIELD_LABELS[key]}
        </label>
        <input
          id={`ocr-${key}`}
          className="mt-1 min-h-11 w-full rounded-xl border border-ink/15 px-3 text-sm"
          value={value}
          placeholder={
            key === 'product_name'
              ? 'Wpisz nazwę z przodu opakowania'
              : 'Wpisz markę albo zaznacz brak marki'
          }
          onChange={(event) => onEdit(key, event.currentTarget.value)}
        />
        {key === 'product_name' && display.kind !== 'value' ? (
          <p className="mt-2 text-xs font-medium text-amber-800">
            Nazwa produktu nie została jeszcze rozpoznana
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {needsConfirmation ? (
            <button
              type="button"
              className="min-h-10 rounded-xl bg-ink px-3 text-xs font-semibold text-white"
              onClick={() => onConfirm(key)}
            >
              Potwierdź
            </button>
          ) : null}
          <button
            type="button"
            className="min-h-10 rounded-xl border border-ink/15 px-3 text-xs"
            onClick={() => onMarkUnknown(key)}
          >
            Nie wiem
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-5 space-y-4" data-customer-ocr-summary="true">
      <section className="rounded-2xl border border-ink/10 bg-paper/50 p-4">
        <h3 className="text-sm font-semibold">Tożsamość produktu</h3>
        <p className="mt-1 text-xs leading-5 text-stone-600">
          Potwierdź nazwę tylko wtedy, gdy widać ją na przodzie opakowania.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {identityEditor('product_name', productName)}
          {identityEditor('brand', brand)}
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 p-4">
        <h3 className="text-sm font-semibold">Opakowanie</h3>
        <dl className="mt-2">
          <SummaryRow label="Ilość" field={fieldByKey(fields, 'package_size')} />
          <SummaryRow label="Jednostka" field={fieldByKey(fields, 'package_unit')} />
          <SummaryRow label="Kod EAN" field={fieldByKey(fields, 'ean_code')} />
        </dl>
      </section>

      <section className="rounded-2xl border border-ink/10 p-4">
        <h3 className="text-sm font-semibold">Podsumowanie etykiety</h3>
        <dl className="mt-2">
          <StatusRow label="Rynek" value={market?.trim() || 'Nie wybrano'} />
          <StatusRow label="Skład i alergeny" value={ingredientsStatus} />
          <StatusRow label="Wartości odżywcze" value={nutritionStatus} />
        </dl>
      </section>

      <section className="rounded-2xl border border-ink/10 p-4">
        <h3 className="text-sm font-semibold">Sprawdzenie braków</h3>
        {unresolved.length === 0 && missingActions.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-800">
            Dane są gotowe do zapisu. Brakujące opcjonalne informacje pozostaną nieznane.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {identityUnresolved ? (
              <p className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm font-medium">
                Popraw nazwę produktu lub markę w sekcji „Tożsamość produktu”.
              </p>
            ) : null}
            {missingActions.map((action) => (
              <p
                key={action}
                className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm font-medium"
              >
                {action}
              </p>
            ))}
            {correctionCards.map((field) => (
              <div
                key={field.fieldKey}
                data-customer-review-card="true"
                className="rounded-xl border border-amber-300/60 bg-amber-50 p-3"
              >
                <p className="text-sm font-medium">
                  {FIELD_LABELS[field.fieldKey] ?? 'Wymaga sprawdzenia'}
                </p>
                {field.reviewStatus === 'conflict_unresolved' ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {field.candidates.map((candidate, index) => {
                      const value = candidate.normalized ?? candidate.extractedRaw;
                      return value ? (
                        <button
                          key={`${field.fieldKey}-${index}`}
                          type="button"
                          className="min-h-10 rounded-xl border border-ink/15 bg-white px-3 text-xs"
                          onClick={() => onChooseCandidate(field.fieldKey, index)}
                        >
                          {value}
                        </button>
                      ) : null;
                    })}
                    <button
                      type="button"
                      className="min-h-10 rounded-xl border border-ink/15 bg-white px-3 text-xs"
                      onClick={() => onMarkUnknown(field.fieldKey)}
                    >
                      Nie wiem
                    </button>
                  </div>
                ) : (
                  <ReviewValueEditor
                    field={field}
                    onEdit={onEdit}
                    onConfirm={onConfirm}
                    onMarkUnknown={onMarkUnknown}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
