import { useState } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
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

/**
 * The canonical Pro workbench GOAL card (owner P0 contract):
 *  - „Typ produktu": exactly Gelato/Sorbet/Wegańskie/Proteinowe — the INTERNAL Engine category
 *    (milk/fruit/nut/chocolate/alcohol…) routes silently from the real ingredients and is shown
 *    only in the owner QA diagnostic; Proteinowe is an HONEST unsupported state;
 *  - „Poziom jakości": the ONE canonical quality tier (Eco/Classic/Premium/Signature);
 *  - „Tryb serwowania": Świeże/−11/−12/−13 — ONE state (servingModeId + temperature) drives the
 *    workbar, RecipeInput, target bands, Engine, Monitor and solver;
 *  - „Ustawienia zaawansowane" (collapsed): machine capacity + flavour-intensity + cost-priority
 *    goals — explicit tuning INSIDE the chosen tier, never a silent override of it.
 */
const MODES: ProductMode[] = ['eco', 'classic', 'premium', 'signature'];
const FLAVORS = ['light', 'balanced', 'strong', 'maximum'] as const;
const COSTS = ['low', 'balanced', 'premium'] as const;

/** The four professional serving modes, in display order (same source as the machine tab). */
const SERVING_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'fresh', label: servingCopy.fresh },
  { id: 'temp_minus_11', label: servingCopy.minus11 },
  { id: 'temp_minus_12', label: servingCopy.minus12 },
  { id: 'temp_minus_13', label: servingCopy.minus13 },
];

const fieldLabel = 'text-xs font-medium tracking-label text-ivory/65 uppercase';
const select =
  'rounded-md border border-ivory/15 bg-shell px-3 py-2 text-sm transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none';

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labelOf,
  testidOf,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labelOf: (option: T) => string;
  testidOf?: (option: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={active}
            data-testid={testidOf ? testidOf(option) : undefined}
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

  // Active serving mode: the explicit mode when set; otherwise projected from the temperature
  // (legacy drafts without a stored mode still highlight their real Engine cell).
  const activeServing =
    store.servingModeId ??
    SERVING_OPTIONS.find(
      (option) => option.id !== 'fresh' && temperatureForMode(option.id) === store.target_temperature_c,
    )?.id ??
    null;

  const pickServing = (id: string) => {
    const temp = temperatureForMode(id);
    if (temp == null) return;
    store.setServingMode(id, temp);
  };

  return (
    <Card padding="lg">
      <SectionLabel>{g.title}</SectionLabel>

      {/* Owner P0 UX repair (2026-07-24): the CORE setup is a COMPACT two-row group —
          row 1: product type + quality tier; row 2: serving mode + batch. Same store
          actions, same testids — only the presentation is condensed (no big tier cards). */}
      <div className="mt-5 grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {/* Visible product type — exactly FOUR (owner P0); internal categories route silently. */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.productTypeLabel}</span>
          <Segmented
            options={VISIBLE_PRODUCT_TYPES}
            value={store.visibleProductType}
            onChange={(next: VisibleProductType) => store.setVisibleProductType(next)}
            labelOf={(option) => g.productTypes[option]}
            testidOf={(option) => `product-type-${option}`}
          />
          {!isSupportedVisibleType(store.visibleProductType) ? (
            <p className="text-xs leading-relaxed text-amber-300/90" data-testid="protein-unsupported">
              {g.proteinUnsupported}
            </p>
          ) : null}
        </div>

        {/* Quality tier — the ONE canonical strategy choice (full description on hover). */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.modeLabel}</span>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((mode) => {
              const active = store.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  data-testid={`quality-${mode}`}
                  title={`${g.modeFocus[mode]} — ${g.modes[mode].body}`}
                  onClick={() => store.setMode(mode)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-ivory bg-ivory text-shell'
                      : 'border-ivory/15 text-ivory/70 hover:border-ivory/40',
                  )}
                >
                  {g.modes[mode].name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Serving mode — Świeże/−11/−12/−13, ONE shared state. */}
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{g.servingLabel}</span>
          <Segmented
            options={SERVING_OPTIONS.map((option) => option.id)}
            value={activeServing ?? ''}
            onChange={pickServing}
            labelOf={(id) => SERVING_OPTIONS.find((option) => option.id === id)?.label ?? id}
            testidOf={(id) => `serving-${id}`}
          />
          <p className="text-xs text-ivory/60">{g.temperatureHelp}</p>
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
            <p className="font-mono text-xs text-ivory/60 tabular-nums">
              = {Math.round(store.target_batch_grams).toLocaleString('en-US')} g
            </p>
          ) : null}
        </div>
      </div>

      {/* Advanced goal tuning — explicit, collapsed, NEVER a silent override of the tier. */}
      <details className="mt-6 rounded-md border border-ivory/10 px-4 py-3" data-testid="goal-advanced">
        <summary className="cursor-pointer text-xs font-medium tracking-label text-ivory/60 uppercase">
          {g.advancedLabel}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-ivory/60">{g.advancedNote}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
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
            <p className="text-xs text-ivory/60">{g.machineHelp}</p>
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
      </details>
    </Card>
  );
}
