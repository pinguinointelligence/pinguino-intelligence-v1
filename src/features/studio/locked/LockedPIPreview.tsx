import { copy } from '@/copy/en';
import { LockedPanel, SkeletonBar, SkeletonRow } from './LockedPanel';

const FILLS = ['w-1/4', 'w-2/5', 'w-1/2', 'w-1/3'];

/** @security Decorative only — no engine imports, no result prop, no real values. */
export function LockedPIPreview() {
  return (
    <LockedPanel title={copy.studio.pi.title}>
      <div className="space-y-5">
        {FILLS.map((fill, i) => (
          <div key={i}>
            <SkeletonRow />
            <SkeletonBar fill={fill} />
          </div>
        ))}
      </div>
    </LockedPanel>
  );
}
