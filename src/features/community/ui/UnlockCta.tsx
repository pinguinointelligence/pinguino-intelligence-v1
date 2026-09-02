import { useNavigate } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import {
  withContinuation,
  type ContinuationTarget,
} from '@/features/community/domain/shareContinuation';
import { cn } from '@/lib/cn';

/**
 * The contextual unlock CTA (§18, §19).
 *
 * Two rules it obeys:
 *
 *  1. IT NEVER INVENTS A CAPABILITY. `benefits` is supplied by the caller from
 *     the real entitlement matrix (`@/access/plans`). This component has no
 *     hardcoded feature list, so it cannot promise something a plan does not
 *     actually include.
 *
 *  2. IT NEVER LOSES THE RECIPE. Every route out of here — sign in, create
 *     account, subscribe — carries the continuation, so the user comes back to
 *     THIS recipe rather than to a generic dashboard.
 */
export function UnlockCta({
  target,
  isSignedIn,
  benefits,
  className,
}: {
  target: ContinuationTarget;
  isSignedIn: boolean;
  /** Real, plan-backed capabilities. Empty is allowed; invented is not. */
  benefits: readonly string[];
  className?: string;
}) {
  const copy = communityCopy;
  const navigate = useNavigate();

  return (
    <Card className={cn('flex flex-col gap-5', className)}>
      <div>
        <SectionLabel>{copy.demo.badge}</SectionLabel>
        <h2 className="mt-2 text-xl leading-tight font-medium text-ink">
          {copy.actions.unlockThisRecipe}
        </h2>
      </div>

      {benefits.length > 0 ? (
        <div>
          <p className="text-xs tracking-label uppercase text-stone-400">{copy.demo.whatYouGet}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-2 text-sm text-ink">
                <span aria-hidden className="text-stone-400">
                  —
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClasses('primary')}
          onClick={() => navigate(withContinuation('/subscription', target))}
        >
          {copy.actions.unlockThisRecipe}
        </button>
        {!isSignedIn ? (
          <button
            type="button"
            className={buttonClasses('ghost')}
            onClick={() => navigate(withContinuation('/account', target))}
          >
            {copy.actions.signIn}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
