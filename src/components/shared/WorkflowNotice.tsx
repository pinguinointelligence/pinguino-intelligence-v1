import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type WorkflowNoticeVariant = 'neutral' | 'attention' | 'blocking';

/* GELLATTI V2.1: the approved warm notice surface, measured from the preview. */
const TONES: Record<WorkflowNoticeVariant, string> = {
  neutral: 'border-ink/10 bg-stone-50/75',
  attention: 'border-[#dfccb0] bg-[var(--g-attention-surface)]',
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
  emphasis = 'compact',
  stackAction = false,
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
  /** `lead` is the approved full-card gate: 18 px title over an 11 px body. */
  emphasis?: 'compact' | 'lead';
  /** The approved gate puts its action BELOW the copy, not beside it. */
  stackAction?: boolean;
}) {
  return (
    <section
      role={role}
      className={cn(
        'flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 border text-xs text-stone-700',
        emphasis === 'lead' ? 'rounded-[10px] px-4 py-4' : 'rounded-[12px] px-3 py-2.5',
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
        <h3
          className={cn(
            'text-ink',
            emphasis === 'lead' ? 'text-[18px] leading-[24px] font-bold' : 'font-semibold',
            eyebrow && 'mt-0.5',
          )}
        >
          {title}
        </h3>
        {description ? (
          <p
            className={cn('leading-relaxed', emphasis === 'lead' ? 'mt-1.5 text-[11px]' : 'mt-0.5')}
          >
            {description}
          </p>
        ) : null}
        {detail ? (
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{detail}</p>
        ) : null}
        {children}
      </div>
      {action ? (
        <div className={cn('shrink-0', stackAction ? 'mt-3 w-full self-start' : 'self-center')}>
          {action}
        </div>
      ) : null}
    </section>
  );
}
