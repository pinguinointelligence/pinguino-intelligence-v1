import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

/** Minimal premium empty state — hairline frame, quiet typography. */
export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  const shell = useSurfaceTone() === 'shell';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border px-8 py-16 text-center',
        shell ? 'border-ivory/10' : 'border-ink/10',
        className,
      )}
    >
      <span className={cn('font-mono text-xs', shell ? 'text-ivory/30' : 'text-stone-300')}>—</span>
      <h3 className={cn('mt-4 text-base font-medium', shell ? 'text-ivory' : 'text-ink')}>{title}</h3>
      {body ? (
        <p
          className={cn(
            'mt-2 max-w-xs text-sm leading-relaxed',
            shell ? 'text-ivory-soft' : 'text-stone-500',
          )}
        >
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
