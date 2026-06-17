import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useSurfaceTone } from './surface';

type CardPadding = 'none' | 'md' | 'lg';

const PADDINGS: Record<CardPadding, string> = {
  none: '',
  md: 'p-6',
  lg: 'p-8',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

/**
 * Workspace card: hairline border, minimal shadow (Design Lock §3). Adapts to the
 * surface tone — white paper by default, dark shell-raised inside Advanced Studio.
 */
export function Card({ padding = 'md', className, ...rest }: CardProps) {
  const tone = useSurfaceTone();
  const surface =
    tone === 'shell' ? 'border-shell-line bg-shell-raised text-ivory' : 'border-ink/10 bg-paper';
  return (
    <div className={cn('rounded-md border', surface, PADDINGS[padding], className)} {...rest} />
  );
}
