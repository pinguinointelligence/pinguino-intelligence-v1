import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type LabelTone = 'muted' | 'ink' | 'ivory';

const TONES: Record<LabelTone, string> = {
  muted: 'text-stone-500',
  ink: 'text-ink',
  ivory: 'text-ivory-soft',
};

interface SectionLabelProps extends HTMLAttributes<HTMLParagraphElement> {
  tone?: LabelTone;
}

/** Uppercase, wide-tracked label echoing the wordmark (Design Lock §3). */
export function SectionLabel({ tone = 'muted', className, ...rest }: SectionLabelProps) {
  return (
    <p
      className={cn('text-xs font-medium tracking-label uppercase', TONES[tone], className)}
      {...rest}
    />
  );
}
