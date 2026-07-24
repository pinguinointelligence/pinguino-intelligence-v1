import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';

type LabelTone = 'muted' | 'ink' | 'ivory';

const TONES: Record<LabelTone, string> = {
  muted: 'text-stone-500',
  ink: 'text-ink',
  ivory: 'text-ivory-soft',
};

/** On the dark shell, the paper tones map to ivory equivalents (≥ 4.5:1 on raised shell). */
const TONES_SHELL: Record<LabelTone, string> = {
  muted: 'text-ivory/65',
  ink: 'text-ivory',
  ivory: 'text-ivory-soft',
};

interface SectionLabelProps extends HTMLAttributes<HTMLParagraphElement> {
  tone?: LabelTone;
}

/** Uppercase, wide-tracked label echoing the wordmark (Design Lock §3). */
export function SectionLabel({ tone = 'muted', className, ...rest }: SectionLabelProps) {
  const surfaceTone = useSurfaceTone();
  const tones = surfaceTone === 'shell' ? TONES_SHELL : TONES;
  return (
    <p
      className={cn('text-xs font-medium tracking-label uppercase', tones[tone], className)}
      {...rest}
    />
  );
}
