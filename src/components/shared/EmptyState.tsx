import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

/** Minimal premium empty state — hairline frame, quiet typography. */
export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-ink/10 px-8 py-16 text-center',
        className,
      )}
    >
      <span className="font-mono text-xs text-stone-300">—</span>
      <h3 className="mt-4 text-base font-medium text-ink">{title}</h3>
      {body ? <p className="mt-2 max-w-xs text-sm leading-relaxed text-stone-500">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
