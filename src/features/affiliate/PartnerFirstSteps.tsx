import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import type { PartnerWorkspace } from '@/services/partner';
import { firstStepsComplete, partnerFirstSteps, type FirstStepId } from './firstStepsModel';

const ACTION: Readonly<Record<FirstStepId, string>> = {
  code: 'Utwórz kod',
  link: 'Utwórz link',
  payouts: 'Dokończ konfigurację',
};

/**
 * G-WEL — shown at the top of the Overview until every step is done, then it
 * steps aside for the dashboard. Each open step links to the section where the
 * partner does it; a step that waits on Gellatti says so and offers nothing.
 */
export function PartnerFirstSteps({ data }: { data: PartnerWorkspace }) {
  const steps = partnerFirstSteps(data);
  if (firstStepsComplete(steps)) return null;
  const done = steps.filter((step) => step.done).length;

  return (
    <section
      aria-labelledby="first-steps-title"
      className="mt-7 border border-ink/10 bg-[#f3ede3] p-5"
      data-testid="first-steps"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="first-steps-title" className="text-sm font-semibold text-ink">
          Pierwsze kroki
        </h3>
        <span className="text-xs text-stone-600">
          {done} z {steps.length} gotowe
        </span>
      </div>
      <ol className="mt-4 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-semibold',
                step.done ? 'bg-ink text-paper' : 'border border-ink/30 text-ink',
              )}
            >
              {step.done ? '✓' : index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                {step.title}
                {step.done ? <span className="sr-only"> — gotowe</span> : null}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{step.detail}</p>
              {!step.done && step.section ? (
                <Link
                  to={{ search: `?section=${step.section}` }}
                  className="pro-focus-ring mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-ink underline underline-offset-4"
                >
                  {ACTION[step.id]}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
