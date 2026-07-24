/**
 * PINGÜINO Pro — the COMPACT settings line (owner one-screen architecture, row 2).
 *
 * ONE short line (48–80 px): product type | quality tier | serving mode | batch |
 * machine link | „Więcej ustawień" — compact dropdowns with tooltips, NEVER the old
 * giant cards. Presentation only: every control drives the SAME canonical
 * `useRecipeStore` actions GoalSetup used (`setVisibleProductType`, `setMode`,
 * `setServingMode`, `setBatchGrams`, and — in the advanced popover — machine
 * capacity / flavour intensity / cost priority). No capability is removed: the
 * advanced goal tuning stays reachable in the popover; the honest Proteinowe
 * unsupported note stays inline.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import type { ProductMode } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { BATCH_UNITS, fromGrams, toGrams, type BatchUnit } from '@/lib/units';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import {
  VISIBLE_PRODUCT_TYPES,
  isSupportedVisibleType,
  type VisibleProductType,
} from '@/features/studio/productType';

const g = copy.studio.goal;
const servingCopy = copy.proMachine.serving;
const wb = copy.proWorkbench.settings;

const MODES: ProductMode[] = ['eco', 'classic', 'premium', 'signature'];
const FLAVORS = ['light', 'balanced', 'strong', 'maximum'] as const;
const COSTS = ['low', 'balanced', 'premium'] as const;

const SERVING_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'fresh', label: servingCopy.fresh },
  { id: 'temp_minus_11', label: servingCopy.minus11 },
  { id: 'temp_minus_12', label: servingCopy.minus12 },
  { id: 'temp_minus_13', label: servingCopy.minus13 },
];

const compactSelect =
  'h-8 rounded-md border border-ivory/15 bg-shell px-2 text-[12px] text-ivory transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none';

function LabeledSelect<T extends string>({
  label,
  title,
  value,
  options,
  labelOf,
  onChange,
  testid,
}: {
  label: string;
  title?: string;
  value: T | '';
  options: readonly T[];
  labelOf: (option: T) => string;
  onChange: (next: T) => void;
  testid: string;
}) {
  return (
    <label className="flex items-center gap-1.5" title={title ?? label}>
      <span className="text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase">{label}</span>
      <select
        className={compactSelect}
        value={value}
        aria-label={label}
        data-testid={testid}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelOf(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function WorkbenchSettingsLine() {
  const store = useRecipeStore();
  const [unit, setUnit] = useState<BatchUnit>('g');
  const batchDisplay = fromGrams(store.target_batch_grams, unit, store.category);

  const activeServing =
    store.servingModeId ??
    SERVING_OPTIONS.find(
      (option) =>
        option.id !== 'fresh' && temperatureForMode(option.id) === store.target_temperature_c,
    )?.id ??
    '';

  const pickServing = (id: string) => {
    const temp = temperatureForMode(id);
    if (temp == null) return;
    store.setServingMode(id, temp);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ivory/10 px-4 py-2.5"
      data-testid="workbench-settings-line"
    >
      <LabeledSelect
        label={g.productTypeLabel}
        value={store.visibleProductType}
        options={VISIBLE_PRODUCT_TYPES}
        labelOf={(option) => g.productTypes[option]}
        onChange={(next: VisibleProductType) => store.setVisibleProductType(next)}
        testid="workbench-product-type"
      />
      <LabeledSelect
        label={g.modeLabel}
        title={MODES.map((mode) => `${g.modes[mode].name} — ${g.modeFocus[mode]}`).join(' · ')}
        value={store.mode}
        options={MODES}
        labelOf={(mode) => g.modes[mode].name}
        onChange={(mode) => store.setMode(mode)}
        testid="workbench-quality"
      />
      <LabeledSelect
        label={g.servingLabel}
        title={g.temperatureHelp}
        value={activeServing}
        options={SERVING_OPTIONS.map((option) => option.id)}
        labelOf={(id) => SERVING_OPTIONS.find((option) => option.id === id)?.label ?? id}
        onChange={pickServing}
        testid="workbench-serving"
      />

      {/* Batch size + unit — the strongest numeric input of the line. */}
      <label className="flex items-center gap-1.5" title={g.batchLabel}>
        <span className="text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase">
          {g.batchLabel}
        </span>
        <input
          type="number"
          min={0}
          className={cn(compactSelect, 'w-24 text-right font-mono tabular-nums')}
          value={Number.isFinite(batchDisplay) ? Number(batchDisplay.toFixed(unit === 'g' ? 0 : 3)) : 0}
          data-testid="workbench-batch"
          onChange={(event) =>
            store.setBatchGrams(toGrams(event.currentTarget.valueAsNumber || 0, unit, store.category))
          }
        />
        <select
          className={compactSelect}
          value={unit}
          aria-label={g.batchLabel}
          onChange={(event) => setUnit(event.currentTarget.value as BatchUnit)}
        >
          {BATCH_UNITS.map((batchUnit) => (
            <option key={batchUnit} value={batchUnit}>
              {batchUnit}
            </option>
          ))}
        </select>
      </label>

      {/* Machine — the S4 section keeps its own page; the line links, never duplicates. */}
      <Link
        to="/pro/machine"
        className="text-[12px] text-ivory/70 underline decoration-ivory/25 underline-offset-4 transition-colors hover:text-ivory"
        data-testid="workbench-machine-link"
      >
        {wb.machineLink}
      </Link>

      {/* Advanced goal tuning — the FULL former „Ustawienia zaawansowane" controls in a
          compact popover (explicit, never a silent override of the tier). */}
      <details className="relative" data-testid="workbench-advanced">
        <summary className="cursor-pointer list-none rounded-md border border-ivory/15 px-2.5 py-1.5 text-[12px] text-ivory/70 transition-colors hover:border-ivory/40 hover:text-ivory">
          {wb.advanced}
        </summary>
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-ivory/15 bg-shell p-4 shadow-lg">
          <p className="text-xs leading-relaxed text-ivory/60">{g.advancedNote}</p>
          <div className="mt-3 space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase">
                {g.machineLabel}
              </span>
              <input
                type="number"
                min={0}
                placeholder={g.machineNone}
                className={cn(compactSelect, 'w-full text-right font-mono tabular-nums')}
                value={store.machine_capacity_grams ?? ''}
                onChange={(event) => {
                  const raw = event.currentTarget.value;
                  store.setMachineCapacity(raw === '' ? null : Math.max(0, Number(raw)));
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase">
                {g.flavorLabel}
              </span>
              <select
                className={compactSelect}
                value={store.flavor_intensity}
                aria-label={g.flavorLabel}
                onChange={(event) =>
                  store.setFlavorIntensity(event.currentTarget.value as (typeof FLAVORS)[number])
                }
              >
                {FLAVORS.map((option) => (
                  <option key={option} value={option}>
                    {g.flavorOptions[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[0.6rem] font-medium tracking-label text-ivory/60 uppercase">
                {g.costLabel}
              </span>
              <select
                className={compactSelect}
                value={store.cost_priority}
                aria-label={g.costLabel}
                onChange={(event) =>
                  store.setCostPriority(event.currentTarget.value as (typeof COSTS)[number])
                }
              >
                {COSTS.map((option) => (
                  <option key={option} value={option}>
                    {g.costOptions[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </details>

      {/* Honest Proteinowe state — inline, compact, never hidden. */}
      {!isSupportedVisibleType(store.visibleProductType) ? (
        <p className="w-full text-[11px] leading-snug text-amber-300/90" data-testid="protein-unsupported">
          {g.proteinUnsupported}
        </p>
      ) : null}
    </div>
  );
}
