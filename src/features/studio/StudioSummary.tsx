import { copy } from '@/copy/en';
import type { ProductCategory, ProductMode } from '@/engine';

/** Quiet recipe breadcrumb under the Studio header — display only (mono chips). */
export function StudioSummary({
  mode,
  category,
  temperatureC,
  batchGrams,
}: {
  mode: ProductMode;
  category: ProductCategory;
  temperatureC: number;
  batchGrams: number;
}) {
  const chips = [
    copy.studio.goal.modes[mode].name,
    copy.studio.goal.categories[category],
    `−${Math.abs(temperatureC)} °C`,
    `${batchGrams.toLocaleString('en-US')} g`,
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {chips.map((chip, index) => (
        <span key={chip} className="flex items-center gap-2">
          {index > 0 ? <span className="text-ivory/30">·</span> : null}
          <span className="font-mono text-xs tracking-tight text-ivory/50 tabular-nums">
            {chip}
          </span>
        </span>
      ))}
    </div>
  );
}
