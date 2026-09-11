import {
  PARTNER_APPLICATION_STATUS_COPY,
  type PartnerApplicationStatus,
} from './partnerApplicationStatus';

/**
 * C-APP-07 — what the applicant's surface shows for each application state.
 *
 * `/partner` used to decide this with hand-written comparisons in TWO places —
 * the page gate and the panel — and they disagreed:
 *
 *   under_review             the page said "in progress" and, directly under
 *                            it, the panel rendered an EMPTY application form,
 *                            because the panel special-cased only `submitted`
 *                            and `more_information_needed`. Sending it again
 *                            just returned a duplicate.
 *   more_information_needed  the opposite failure: it said "we need more
 *                            information" and offered no way to give it. The
 *                            writer already supports answering in place.
 *   suspended / terminated   fell through to the form as well.
 *
 * The canonical authority already existed and neither surface used it:
 * PARTNER_APPLICATION_STATUS_COPY knows every state's label, what it means and
 * whether the applicant must act. This module is the one place that turns that
 * into "what to render". It restates no copy and invents no state — the eight
 * statuses are the database CHECK's eight.
 */

export type ApplicationAction =
  /** Nothing to do — the next move is Gellatti's. */
  | 'none'
  /** Fill in and send the application. */
  | 'submit'
  /** Answer what the team asked for, in the same application. */
  | 'update'
  /** Optional: a new application after a declined one. Never required. */
  | 'reapply'
  /** Talk to the team — there is no form for what they need. */
  | 'contact';

export interface ApplicationSurface {
  /** Show the status card: label, what it means, whether action is needed. */
  readonly showStatus: boolean;
  /** Show the application form. */
  readonly showForm: boolean;
  /** Pre-fill the form from what was already sent, so nothing is retyped. */
  readonly prefill: boolean;
  readonly action: ApplicationAction;
  /** Straight from the canonical copy — never recomputed here. */
  readonly actionRequired: boolean;
}

/** Exhaustive by type: a ninth status cannot be added without deciding this. */
const ACTION: Readonly<Record<PartnerApplicationStatus, ApplicationAction>> = Object.freeze({
  draft: 'submit',
  submitted: 'none',
  under_review: 'none',
  more_information_needed: 'update',
  approved: 'none',
  rejected: 'reapply',
  suspended: 'contact',
  terminated: 'none',
});

const FORM_ACTIONS: readonly ApplicationAction[] = ['submit', 'update', 'reapply'];

export function applicationSurface(status: PartnerApplicationStatus | null): ApplicationSurface {
  if (status === null) {
    // Never applied: the form IS the surface; there is no status to show yet.
    return {
      showStatus: false,
      showForm: true,
      prefill: false,
      action: 'submit',
      actionRequired: true,
    };
  }
  const action = ACTION[status];
  return {
    showStatus: true,
    showForm: FORM_ACTIONS.includes(action),
    // A declined application starts fresh; everything else continues what was sent.
    prefill: action === 'update' || action === 'submit',
    action,
    actionRequired: PARTNER_APPLICATION_STATUS_COPY[status].actionRequired,
  };
}
