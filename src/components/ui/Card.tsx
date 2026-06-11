import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type CardPadding = 'none' | 'md' | 'lg';

const PADDINGS: Record<CardPadding, string> = {
  none: '',
  md: 'p-6',
  lg: 'p-8',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

/** White workspace card: hairline border, minimal shadow (Design Lock §3). */
export function Card({ padding = 'md', className, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-md border border-ink/10 bg-paper', PADDINGS[padding], className)}
      {...rest}
    />
  );
}
