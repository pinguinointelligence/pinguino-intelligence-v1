import { useState } from 'react';
import { buildNutritionDeclaration } from '@/data/label/nutritionLabel';
import { Button } from '@/components/ui/Button';
import type { MasterLabelData } from './masterLabel';

const displaySaturatedFat = (value: number): string =>
  value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });

/** Recipe/run-local editor for the optional saturated-fat value on every market label. */
export function SaturatedFatControl({
  label,
  onSave,
}: {
  label: MasterLabelData;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const saturatedFat = label.nutritionSource?.saturated_fat_g ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(saturatedFat === null ? '' : String(saturatedFat));
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <section
        className="flex min-h-11 items-center justify-between gap-3 py-2"
        data-testid="label-saturated-fat-row"
      >
        <p className="min-w-0 text-xs leading-5 text-stone-700">
          {saturatedFat === null
            ? 'Tłuszcze nasycone nieustalone'
            : `Tłuszcze nasycone: ${displaySaturatedFat(saturatedFat)} g / 100 g`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9 shrink-0 rounded-full px-3"
          data-testid={
            saturatedFat === null ? 'label-saturated-fat-set' : 'label-saturated-fat-change'
          }
          onClick={() => {
            setValue(saturatedFat === null ? '' : String(saturatedFat));
            setEditing(true);
          }}
        >
          {saturatedFat === null ? 'Ustaw' : 'Zmień'}
        </Button>
      </section>
    );
  }

  const parsed = value.trim() === '' ? null : Number(value);
  const valid = parsed !== null && Number.isFinite(parsed) && parsed >= 0;
  const save = async () => {
    if (!label.nutritionSource || !valid || saving) return;
    setSaving(true);
    try {
      const nutritionSource = { ...label.nutritionSource, saturated_fat_g: parsed };
      await onSave({
        ...label,
        nutritionSource,
        nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
        saturatedFatAuthority: {
          status: 'manual_final_value',
          sourceReferences: ['manual:label_saturated_fat'],
          missingIngredientNames: [],
        },
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="py-3" data-testid="label-saturated-fat-settings">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Ustawienia etykiety</h3>
        <button
          type="button"
          className="pro-focus-ring min-h-11 text-xs font-semibold underline underline-offset-4"
          data-testid="label-saturated-fat-back"
          onClick={() => {
            setValue(saturatedFat === null ? '' : String(saturatedFat));
            setEditing(false);
          }}
        >
          Wróć
        </button>
      </div>
      <label className="mt-2 block text-xs font-medium text-stone-600">
        Tłuszcze nasycone · g / 100 g
        <input
          autoFocus
          type="number"
          min={0}
          step="any"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          className="pro-focus-ring mt-1 min-h-11 w-full rounded-[10px] border border-ink/15 bg-white px-3 text-sm text-ink"
          data-testid="label-saturated-fat-input"
        />
      </label>
      <Button
        className="mt-3 rounded-full"
        size="sm"
        disabled={!valid || saving}
        data-testid="label-saturated-fat-save"
        onClick={() => void save()}
      >
        {saving ? 'Zapisywanie…' : 'Zapisz'}
      </Button>
    </section>
  );
}
