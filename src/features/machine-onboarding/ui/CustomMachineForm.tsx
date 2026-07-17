/**
 * §8.4 custom-machine form (unknown machine data). Brand/model optional,
 * vessel capacity and manual max-mix in ml or l (stored internally in ml via
 * `volumeInputToMl` at build time), MAX FILL as tak / nie / nie wiem.
 *
 * Honesty: entering ONLY the total vessel capacity shows the device-type
 * note live (`vesselOnlyNote` — bowls never yield a derived number; re-spin
 * tubs yield an ESTIMATED recommendation), and every value stays editable.
 */
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { CustomMachineVolumeInput } from '@/features/machine-catalog';
import { TextField } from '@/features/customer-shell/ui/TextField';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import { color, focusRing, motion, radius, type } from '@/features/customer-shell/ui/tokens';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';

export interface CustomMachineFormValues {
  readonly brand: string | null;
  readonly model: string | null;
  readonly vesselCapacity: CustomMachineVolumeInput | null;
  readonly hasMaxFillLine: boolean | null;
  readonly manufacturerMaxMix: CustomMachineVolumeInput | null;
}

interface CustomMachineFormProps {
  initialValues?: CustomMachineFormValues | null;
  /** Device-type honest note shown when ONLY the vessel capacity is entered. */
  vesselOnlyNote: string;
  onSubmit: (values: CustomMachineFormValues) => void;
  onBack: () => void;
}

type VolumeUnit = 'ml' | 'l';

interface VolumeDraft {
  text: string;
  unit: VolumeUnit;
}

function draftFromInitial(input: CustomMachineVolumeInput | null | undefined): VolumeDraft {
  if (input == null) return { text: '', unit: 'ml' };
  return { text: String(input.value), unit: input.unit };
}

/** Parse a drafted volume: '' → null; invalid → 'invalid'; else the input. */
function parseVolumeDraft(draft: VolumeDraft): CustomMachineVolumeInput | null | 'invalid' {
  const trimmed = draft.text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return 'invalid';
  return { value, unit: draft.unit };
}

function UnitToggle({
  value,
  onChange,
  groupLabel,
}: {
  value: VolumeUnit;
  onChange: (unit: VolumeUnit) => void;
  groupLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex gap-1">
      {(['ml', 'l'] as const).map((unit) => {
        const selected = unit === value;
        return (
          <button
            key={unit}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(unit)}
            className={cn(
              'min-h-[44px] min-w-[44px] border px-3',
              radius.control,
              type.secondary,
              motion.base,
              focusRing,
              selected ? 'border-ink bg-ink text-paper' : cn('border-ink/15 bg-paper', color.textSecondary),
            )}
          >
            {unit === 'ml' ? copy.custom.unitMl : copy.custom.unitL}
          </button>
        );
      })}
    </div>
  );
}

function TriChoice({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}) {
  const options: ReadonlyArray<{ key: string; label: string; val: boolean | null }> = [
    { key: 'yes', label: copy.custom.maxFillYes, val: true },
    { key: 'no', label: copy.custom.maxFillNo, val: false },
    { key: 'unknown', label: copy.custom.maxFillUnknown, val: null },
  ];
  return (
    <div role="radiogroup" aria-label={copy.custom.maxFillLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.val === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.val)}
            className={cn(
              'min-h-[44px] border px-4',
              radius.control,
              type.secondary,
              motion.base,
              focusRing,
              selected ? 'border-ink bg-ink text-paper' : cn('border-ink/15 bg-paper', color.textSecondary),
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CustomMachineForm({
  initialValues = null,
  vesselOnlyNote,
  onSubmit,
  onBack,
}: CustomMachineFormProps) {
  const [brand, setBrand] = useState(initialValues?.brand ?? '');
  const [model, setModel] = useState(initialValues?.model ?? '');
  const [vessel, setVessel] = useState<VolumeDraft>(draftFromInitial(initialValues?.vesselCapacity));
  const [maxFill, setMaxFill] = useState<boolean | null>(initialValues?.hasMaxFillLine ?? null);
  const [maxMix, setMaxMix] = useState<VolumeDraft>(draftFromInitial(initialValues?.manufacturerMaxMix));

  const vesselParsed = useMemo(() => parseVolumeDraft(vessel), [vessel]);
  const maxMixParsed = useMemo(() => parseVolumeDraft(maxMix), [maxMix]);

  const vesselInvalid = vesselParsed === 'invalid';
  const maxMixInvalid = maxMixParsed === 'invalid';
  // §8.4 conservative fallback preview: vessel known, max mix not.
  const vesselOnly = vesselParsed !== null && !vesselInvalid && (maxMixParsed === null);

  const submit = () => {
    if (vesselParsed === 'invalid' || maxMixParsed === 'invalid') return;
    onSubmit({
      brand: brand.trim() === '' ? null : brand.trim(),
      model: model.trim() === '' ? null : model.trim(),
      vesselCapacity: vesselParsed,
      hasMaxFillLine: maxFill,
      manufacturerMaxMix: maxMixParsed,
    });
  };

  return (
    <div className="space-y-5">
      <TextField
        label={copy.custom.brandLabel}
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        autoComplete="off"
      />
      <TextField
        label={copy.custom.modelLabel}
        value={model}
        onChange={(e) => setModel(e.target.value)}
        autoComplete="off"
      />

      <div className="flex items-end gap-2">
        <TextField
          className="flex-1"
          label={copy.custom.vesselLabel}
          hint={copy.custom.vesselHint}
          inputMode="decimal"
          value={vessel.text}
          onChange={(e) => setVessel({ ...vessel, text: e.target.value })}
          {...(vesselInvalid ? { error: copy.custom.invalidVolume } : {})}
        />
        <div className="pb-6">
          <UnitToggle
            groupLabel={`${copy.custom.vesselLabel} — ${copy.custom.unitLabel}`}
            value={vessel.unit}
            onChange={(unit) => setVessel({ ...vessel, unit })}
          />
        </div>
      </div>

      <div>
        <p className={cn(type.secondary, 'font-medium', color.textPrimary)}>{copy.custom.maxFillLabel}</p>
        <div className="mt-2">
          <TriChoice value={maxFill} onChange={setMaxFill} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <TextField
          className="flex-1"
          label={copy.custom.maxMixLabel}
          hint={copy.custom.maxMixHint}
          inputMode="decimal"
          value={maxMix.text}
          onChange={(e) => setMaxMix({ ...maxMix, text: e.target.value })}
          {...(maxMixInvalid ? { error: copy.custom.invalidVolume } : {})}
        />
        <div className="pb-6">
          <UnitToggle
            groupLabel={`${copy.custom.maxMixLabel} — ${copy.custom.unitLabel}`}
            value={maxMix.unit}
            onChange={(unit) => setMaxMix({ ...maxMix, unit })}
          />
        </div>
      </div>

      {vesselOnly ? (
        <p className={cn(type.caption, color.textMuted, 'max-w-prose')}>{vesselOnlyNote}</p>
      ) : null}

      <div className="flex flex-col gap-3 pt-1 sm:flex-row">
        <TouchButton size="lg" onClick={submit} disabled={vesselInvalid || maxMixInvalid}>
          {copy.custom.save}
        </TouchButton>
        <TouchButton variant="quiet" onClick={onBack}>
          {copy.behavior.back}
        </TouchButton>
      </div>
    </div>
  );
}
