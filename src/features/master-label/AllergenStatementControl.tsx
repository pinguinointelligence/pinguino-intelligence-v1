import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { labelAllergenStatement, type MasterLabelData } from './masterLabel';

/** Recipe/run-local editor for the one existing final allergen statement. */
export function AllergenStatementControl({
  label,
  onSave,
}: {
  label: MasterLabelData;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const statement = labelAllergenStatement(label);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(statement ?? '');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <section
        className="flex min-h-11 items-center justify-between gap-3 py-2"
        data-testid="label-allergens-row"
      >
        <p className="min-w-0 text-xs leading-5 text-stone-700">
          {statement ? `Alergeny: ${statement}` : 'Alergeny nieustalone'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9 shrink-0 rounded-full px-3"
          data-testid={statement ? 'label-allergens-change' : 'label-allergens-set'}
          onClick={() => {
            setValue(statement ?? '');
            setEditing(true);
          }}
        >
          {statement ? 'Zmień' : 'Ustaw'}
        </Button>
      </section>
    );
  }

  const save = async () => {
    const nextStatement = value.trim();
    if (!nextStatement || saving) return;
    setSaving(true);
    try {
      await onSave({
        ...label,
        allergens: {
          ...label.allergens,
          status: 'complete',
          labelStatements: [nextStatement],
          reviewedByUser: true,
        },
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="py-3" data-testid="label-allergens-settings">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Ustawienia etykiety</h3>
        <button
          type="button"
          className="pro-focus-ring min-h-11 text-xs font-semibold underline underline-offset-4"
          data-testid="label-allergens-back"
          onClick={() => {
            setValue(statement ?? '');
            setEditing(false);
          }}
        >
          Wróć
        </button>
      </div>
      <label className="mt-3 block text-xs font-medium text-stone-600">
        Końcowa linia alergenów
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          className="pro-focus-ring mt-1 min-h-11 w-full rounded-[10px] border border-ink/15 bg-white px-3 text-sm text-ink"
          data-testid="label-allergens-input"
        />
      </label>
      <p className="mt-2 text-xs text-stone-500">
        Informacje o alergenach ustala producent żywności.
      </p>
      <Button
        className="mt-3 rounded-full"
        size="sm"
        disabled={!value.trim() || saving}
        data-testid="label-allergens-save"
        onClick={() => void save()}
      >
        {saving ? 'Zapisywanie…' : 'Zapisz'}
      </Button>
    </section>
  );
}
