import { Link } from 'react-router';
import { shopCopy as c } from '@/copy/shop';
import { cn } from '@/lib/cn';

/** The machine code every shop order path answers when the account has no active HOME or PRO plan. */
export const PLAN_REQUIRED = 'plan_required';

/**
 * The one answer to a shop order refused for its plan (owner, 2026-09-18): the shop stays open to everyone,
 * ordering — the 0 € PDF included — needs an active HOME or PRO plan.
 *
 * It is shown only after the SERVER said `plan_required`; nothing here decides a plan. The link is the existing
 * way to choose one (/subscription) — no second checkout, no paywall over the shop.
 */
export function ShopPlanRequired({ className, testId }: { className?: string; testId: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-2', className)} data-testid={testId}>
      <p className="text-[12px] leading-snug text-[var(--g-attention-ink)]" role="alert">
        {c.orderGate.planRequired}
      </p>
      <Link
        to="/subscription"
        className="text-[12px] font-semibold text-[var(--g-text-primary)] underline underline-offset-2"
        data-testid={`${testId}-plans`}
      >
        {c.orderGate.plansCta}
      </Link>
    </div>
  );
}
