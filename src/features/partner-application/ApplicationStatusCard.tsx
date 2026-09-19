import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { cooperationCopy } from '@/copy/cooperation';
import {
  PARTNER_APPLICATION_STATUS_COPY,
  type PartnerApplicationStatus,
} from './partnerApplicationStatus';
import { applicationSurface, type ApplicationAction } from './applicationSurface';

const c = cooperationCopy;

/**
 * The canonical Gellatti mailbox (EMAIL-01). Offered only where the applicant
 * must act and there is no form for what the team needs — a suspension.
 */
const CONTACT_MAILBOX = 'info@gellatti.com';

const ACTION_TEXT: Readonly<Record<ApplicationAction, string>> = {
  none: c.state.actionNone,
  submit: c.state.actionSubmit,
  update: c.state.actionUpdate,
  reapply: c.state.actionReapply,
  contact: c.state.actionContact,
};

/**
 * C-APP-07 — the applicant reads, for every state: what it is, what it means,
 * whether they have to do anything, and what they can do.
 *
 * Every string comes from the canonical status copy or the cooperation copy;
 * no raw status value is ever rendered. The team's own message is shown only
 * for the two states where the team writes one FOR the applicant.
 */
export function ApplicationStatusCard({
  status,
  reason,
}: {
  status: PartnerApplicationStatus;
  reason?: string | null;
}) {
  const copy = PARTNER_APPLICATION_STATUS_COPY[status];
  const surface = applicationSurface(status);
  const teamMessage =
    reason && (status === 'more_information_needed' || status === 'rejected') ? reason.trim() : '';

  return (
    <section
      aria-labelledby="application-status-title"
      className="rounded-[12px] border border-ink/12 bg-white p-6"
      data-testid="application-status"
    >
      <p className="text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase">
        {c.state.statusEyebrow}
      </p>
      <h3 id="application-status-title" className="mt-2 text-lg font-semibold tracking-[-0.02em]">
        {copy.label}
      </h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">{copy.detail}</p>

      {teamMessage ? (
        <blockquote className="mt-4 border-l-2 border-[var(--g-orange)] pl-3 text-sm text-stone-700">
          <span className="block text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase">
            {c.state.teamMessage}
          </span>
          <span className="mt-1 block">{teamMessage}</span>
        </blockquote>
      ) : null}

      <p className="mt-4 text-sm text-ink" data-testid="application-status-action">
        <span className="font-semibold">{c.state.yourMove}: </span>
        {ACTION_TEXT[surface.action]}
      </p>

      {surface.action === 'contact' ? (
        <a href={`mailto:${CONTACT_MAILBOX}`} className={cn(applicationSecondaryClasses(), 'mt-4')}>
          {c.state.contactCta}
        </a>
      ) : null}
    </section>
  );
}
