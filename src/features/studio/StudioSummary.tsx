import { copy } from '@/copy/en';
import type { ProductMode } from '@/engine';
import type { VisibleProductType } from '@/features/studio/productType';

/**
 * Quiet recipe breadcrumb under the workbench header — display only (mono chips).
 * Projects the CUSTOMER-FACING state (owner P0): quality tier · visible product type ·
 * serving mode/temperature · batch. The INTERNAL Engine category is deliberately absent —
 * it lives in the owner QA diagnostic, never in the primary heading.
 */
export function StudioSummary({
  mode,
  visibleProductType,
  servingModeId,
  temperatureC,
  batchGrams,
}: {
  mode: ProductMode;
  visibleProductType: VisibleProductType;
  servingModeId: string | null;
  temperatureC: number;
  batchGrams: number;
}) {
  const serving =
    servingModeId === 'fresh' ? copy.proMachine.serving.fresh : `−${Math.abs(temperatureC)} °C`;
  const chips = [
    copy.studio.goal.modes[mode].name,
    copy.studio.goal.productTypes[visibleProductType],
    serving,
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
