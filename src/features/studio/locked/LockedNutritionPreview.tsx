import { copy } from '@/copy/en';
import { LockedPanel, SkeletonRow } from './LockedPanel';

/** @security Decorative only — no engine imports, no result prop, no real values. */
export function LockedNutritionPreview() {
  return (
    <LockedPanel title={copy.studio.metrics.title}>
      <div className="divide-y divide-ivory/10">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </LockedPanel>
  );
}
