import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';
import {
  STATUS_CHIP_CLASSES,
  STATUS_CHIP_CLASSES_SHELL,
  STATUS_LABELS,
  type IndicatorStatus,
} from './status';

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  status: IndicatorStatus;
}

/** Muted laboratory status badge — premium tones only, never candy (Design Lock §3). */
export function StatusChip({ status, className, ...rest }: StatusChipProps) {
  const tone = useSurfaceTone();
  const classes = tone === 'shell' ? STATUS_CHIP_CLASSES_SHELL : STATUS_CHIP_CLASSES;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] uppercase',
        classes[status],
        className,
      )}
      {...rest}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
