import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type WorkflowNoticeVariant = 'neutral' | 'attention' | 'blocking';

const TONES: Record<WorkflowNoticeVariant, string> = {
  neutral: 'border-ink/10 bg-stone-50/75',
  attention: 'border-attention/25 bg-[#fbf8f1]',
  blocking: 'border-status-error/25 bg-status-error/[0.045]',
};

/** One compact notice hierarchy for Pro workflow, history and plan gates. */
export function WorkflowNotice({
  eyebrow,
  title,
  description,
  detail,
  action,
  children,
  variant = 'attention',
  role = 'status',
  className,
  testId,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  variant?: WorkflowNoticeVariant;
  role?: 'status' | 'alert';
  className?: string;
  testId?: string;
}) {
  return (
    <section
      role={role}
      className={cn(
        'flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-[12px] border px-3 py-2.5 text-xs text-stone-700',
        TONES[variant],
        className,
      )}
      data-testid={testId}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="text-[10px] font-semibold tracking-[0.1em] text-stone-500 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h3 className={cn('font-semibold text-ink', eyebrow && 'mt-0.5')}>{title}</h3>
        {description ? <p className="mt-0.5 leading-relaxed">{description}</p> : null}
        {detail ? (
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{detail}</p>
        ) : null}
        {children}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </section>
  );
}
