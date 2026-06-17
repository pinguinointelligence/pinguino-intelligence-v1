import { useState } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { ProductCategory, ProductMode } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { BATCH_UNITS, fromGrams, toGrams, type BatchUnit } from '@/lib/units';

const g = copy.studio.goal;

const MODES: ProductMode[] = ['eco', 'classic', 'premium', 'signature'];
const CATEGORIES = Object.keys(g.categories) as ProductCategory[];
const TEMPERATURES = [-11, -12, -14, -18];
const FLAVORS = ['light', 'balanced', 'strong', 'maximum'] as const;
const COSTS = ['low', 'balanced', 'premium'] as const;

const fieldLabel = 'text-xs font-medium tracking-label text-ivory/50 uppercase';
const select =
  'rounded-md border border-ivory/15 bg-shell px-3 py-2 text-sm transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none';

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labelOf: (option: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'border-ivory bg-ivory text-shell'
                : 'border-ivory/15 text-ivory/70 hover:border-ivory/40',
            )}
          >
            {labelOf(option)}
          </button>
        );
      })}
    </div>
  );
}

export function GoalSetup() {
  const store = useRecipeStore();
  const [unit, setUnit] = useState<BatchUnit>('g');

  const batchDisplay = fromGrams(store.target_batch_grams, unit, store.category);

  return (
    <Card padding="lg">
      <SectionLabel>{g.title}</SectionLabel>

      {/* Product mode — calculation behavior, not styling */}
      <div className="mt-6">
        <span className={fieldLabel}>{g.modeLabel}</span>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MODES.map((mode) => {
            const active = store.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => store.setMode(mode)}
                className={cn(
                  'relative overflow-hidden rounded-md border p-3 pl-4 text-left transition-colors',
                  active ? 'border-ivory bg-ivory/10' : 'border-ivory/15 hover:border-ivory/40',
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ivory" />
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium tracking-label uppercase">
                    {g.modes[mode].name}
                  </span>
                  <span className="text-[0.6rem] tracking-label text-ivory/40 uppercase">
                    {g.modeFocus[mode]}
                  </span>
                </div>
                <span className="mt-1 block text-xs leading-relaxed text-ivory/60">
                  {g.modes[mode].body}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {/* Category */}
        <label className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.categoryLabel}</span>
          <select
            className={select}
            value={store.category}
            onChange={(event) => store.setCategory(event.currentTarget.value as ProductCategory)}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {g.categories[category]}
              </option>
            ))}
          </select>
        </label>

        {/* Serving temperature */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.temperatureLabel}</span>
          <Segmented
            options={TEMPERATURES}
            value={store.target_temperature_c}
            onChange={store.setTargetTemperature}
            labelOf={(temperature) => `−${Math.abs(temperature)} °C`}
          />
          <p className="text-xs text-ivory/40">{g.temperatureHelp}</p>
        </div>

        {/* Batch size with unit */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.batchLabel}</span>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              className={cn(select, 'w-full font-mono tabular-nums')}
              value={Number.isFinite(batchDisplay) ? Number(batchDisplay.toFixed(unit === 'g' ? 0 : 3)) : 0}
              onChange={(event) =>
                store.setBatchGrams(toGrams(event.currentTarget.valueAsNumber || 0, unit, store.category))
              }
            />
            <select
              className={select}
              value={unit}
              onChange={(event) => setUnit(event.currentTarget.value as BatchUnit)}
            >
              {BATCH_UNITS.map((batchUnit) => (
                <option key={batchUnit} value={batchUnit}>
                  {batchUnit}
                </option>
              ))}
            </select>
          </div>
          {unit !== 'g' ? (
            <p className="font-mono text-xs text-ivory/40 tabular-nums">
              = {Math.round(store.target_batch_grams).toLocaleString('en-US')} g
            </p>
          ) : null}
        </div>

        {/* Machine capacity */}
        <label className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.machineLabel}</span>
          <input
            type="number"
            min={0}
            placeholder={g.machineNone}
            className={cn(select, 'font-mono tabular-nums')}
            value={store.machine_capacity_grams ?? ''}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              store.setMachineCapacity(raw === '' ? null : Math.max(0, Number(raw)));
            }}
          />
          <p className="text-xs text-ivory/40">{g.machineHelp}</p>
        </label>

        {/* Flavor intensity */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.flavorLabel}</span>
          <Segmented
            options={FLAVORS}
            value={store.flavor_intensity}
            onChange={store.setFlavorIntensity}
            labelOf={(option) => g.flavorOptions[option]}
          />
        </div>

        {/* Cost priority */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.costLabel}</span>
          <Segmented
            options={COSTS}
            value={store.cost_priority}
            onChange={store.setCostPriority}
            labelOf={(option) => g.costOptions[option]}
          />
        </div>
      </div>
    </Card>
  );
}
