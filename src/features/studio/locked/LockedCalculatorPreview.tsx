import { copy } from '@/copy/en';
import { LockedPanel, SkeletonRow } from './LockedPanel';

/** @security Decorative only — no engine imports, no result prop, no real values. */
export function LockedCalculatorPreview() {
  return (
    <LockedPanel title={copy.studio.builder.title}>
      <div className="divide-y divide-ivory/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-ivory/60">{copy.studio.locked.note}</p>
    </LockedPanel>
  );
}
