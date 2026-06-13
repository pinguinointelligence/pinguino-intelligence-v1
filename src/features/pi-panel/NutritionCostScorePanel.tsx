import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { copy } from '@/copy/en';
import type { RecipeResult } from '@/engine';

const m = copy.studio.metrics;

function Row({
  label,
  value,
  unit,
  precision = 1,
  muted = false,
}: {
  label: string;
  value: number | null;
  unit?: string;
  precision?: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={muted ? 'pl-3 text-xs text-stone-400' : 'text-sm text-stone-600'}>
        {label}
      </span>
      {value === null ? (
        <span className="font-mono text-sm text-stone-400">—</span>
      ) : (
        <MetricValue value={value} unit={unit} precision={precision} size="sm" />
      )}
    </div>
  );
}

export function NutritionCostScorePanel({ result }: { result: RecipeResult }) {
  const { nutrition_per_100g: nutrition, costs } = result;

  return (
    <Card padding="lg">
      <SectionLabel>{m.title}</SectionLabel>

      {/* Nutrition per 100 g */}
      <div className="mt-5">
        <p className="text-xs font-medium tracking-label text-stone-500 uppercase">
          {m.nutritionTitle}
        </p>
        {nutrition === null ? (
          <p className="mt-3 text-sm text-stone-500">{m.unavailable}</p>
        ) : (
          <div className="mt-2 divide-y divide-ink/5">
            <Row label={m.kcal} value={nutrition.kcal} unit="kcal" precision={0} />
            <Row label={m.fat} value={nutrition.fat_g} unit="g" />
            <Row label={m.saturated} value={nutrition.saturated_fat_g} unit="g" muted />
            <Row label={m.carbs} value={nutrition.carbohydrate_g} unit="g" />
            <Row label={m.sugars} value={nutrition.sugars_g} unit="g" muted />
            <Row label={m.protein} value={nutrition.protein_g} unit="g" />
            <Row label={m.salt} value={nutrition.salt_g} unit="g" precision={2} />
            <Row label={m.fiber} value={nutrition.fiber_g} unit="g" />
            {nutrition.alcohol_g > 0 ? (
              <Row label={m.alcohol} value={nutrition.alcohol_g} unit="g" />
            ) : null}
          </div>
        )}
      </div>

      {/* Cost */}
      <div className="mt-6 border-t border-ink/5 pt-4">
        <p className="text-xs font-medium tracking-label text-stone-500 uppercase">{m.costTitle}</p>
        {costs === null ? (
          <p className="mt-3 text-sm text-stone-500">{m.unavailable}</p>
        ) : (
          <>
            <div className="mt-2 divide-y divide-ink/5">
              <Row label={m.costPerKg} value={costs.cost_per_kg} unit="€" precision={2} />
              <Row label={m.serving60} value={costs.cost_per_serving_60g} unit="€" precision={2} />
              <Row label={m.serving70} value={costs.cost_per_serving_70g} unit="€" precision={2} />
              <Row label={m.serving80} value={costs.cost_per_serving_80g} unit="€" precision={2} />
            </div>
            {!costs.complete ? (
              <p className="mt-3 text-xs leading-relaxed text-stone-500">{m.costIncomplete}</p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
