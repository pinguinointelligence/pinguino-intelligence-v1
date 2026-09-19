/**
 * Subscription management (client) — Account → Plan i rozliczenia.
 *
 * Thin, typed wrappers over the `manage-subscription` and
 * `create-portal-session` Edge Functions. The vendor call stays behind the
 * `src/services/**` boundary; the client submits an ACTION and, for a plan
 * change, a target OFFER KEY — never a price id, never an amount. Every
 * number the UI shows before a confirm comes back from Stripe through the
 * preview; the UI is forbidden from computing `pricePro - priceHome`.
 *
 * Every failure is HONEST and typed so the panel can say what happened
 * (declined card, stale preview, nothing to resume) instead of a dead button.
 */
import { supabase } from '@/lib/supabase/client';

export type ManageFailureReason =
  | 'unavailable'
  | 'not_signed_in'
  | 'no_subscription'
  | 'already_cancelling'
  | 'not_cancelling'
  | 'period_already_ended'
  | 'resume_before_changing_plan'
  | 'cancel_scheduled_change_first'
  | 'cadence_conversion_not_available'
  | 'same_offer'
  | 'preview_required'
  | 'preview_expired'
  | 'no_scheduled_change'
  | 'payment_failed'
  | 'requires_action'
  | 'failed';

export interface SubscriptionStateReply {
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export interface MutationReply {
  subscription: SubscriptionStateReply;
  /** True when the cache was refreshed inline; false → the webhook converges it shortly. */
  synced: boolean;
}

export type ChangePreview =
  | {
      kind: 'immediate';
      targetOfferKey: string;
      /** Echo this back on confirm — the confirm is valid only against this preview. */
      prorationTimestamp: number;
      /** What Stripe charges today (cents). */
      amountDueTodayCents: number;
      currency: string;
      prorationCents: number;
      taxCents: number;
      appliedBalanceCents: number;
      /** Next renewal after the change (ISO) — unchanged for a same-cadence upgrade. */
      nextRenewalAt: string | null;
      /** The full recurring price from the next period (catalog cents). */
      nextAmountCents: number | null;
      resetBillingCycle: boolean;
    }
  | {
      kind: 'scheduled';
      targetOfferKey: string;
      /** ISO — the current period end; the current plan stays until then. */
      effectiveAt: string;
      amountDueTodayCents: 0;
      nextAmountCents: number | null;
    };

export type ManageResult<T> = { ok: true; data: T } | { ok: false; reason: ManageFailureReason };

type ManageBody =
  | { action: 'cancel' }
  | { action: 'resume' }
  | { action: 'preview_change'; targetOfferKey: string }
  | { action: 'confirm_change'; targetOfferKey: string; prorationTimestamp?: number }
  | { action: 'cancel_scheduled_change' };

async function invokeManage<T>(body: ManageBody, pick: (data: unknown) => T | null): Promise<ManageResult<T>> {
  if (supabase === null) return { ok: false, reason: 'unavailable' };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, reason: 'not_signed_in' };

  const { data, error } = await supabase.functions.invoke('manage-subscription', { body });
  if (error) return { ok: false, reason: await classifyInvokeError(error) };
  const picked = pick(data);
  if (picked === null) return { ok: false, reason: 'failed' };
  return { ok: true, data: picked };
}

const asMutationReply = (data: unknown): MutationReply | null => {
  const d = data as { ok?: unknown; subscription?: unknown; synced?: unknown } | null;
  if (!d || d.ok !== true || typeof d.subscription !== 'object' || d.subscription === null) return null;
  const s = d.subscription as Record<string, unknown>;
  if (typeof s.stripeSubscriptionId !== 'string' || typeof s.status !== 'string') return null;
  return {
    subscription: {
      stripeSubscriptionId: s.stripeSubscriptionId,
      status: s.status,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
      currentPeriodEnd: typeof s.currentPeriodEnd === 'string' ? s.currentPeriodEnd : null,
    },
    synced: d.synced === true,
  };
};

const asPreview = (data: unknown): ChangePreview | null => {
  const d = data as Record<string, unknown> | null;
  if (!d || d.ok !== true || typeof d.targetOfferKey !== 'string') return null;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (d.kind === 'scheduled') {
    if (typeof d.effectiveAt !== 'string') return null;
    return {
      kind: 'scheduled',
      targetOfferKey: d.targetOfferKey,
      effectiveAt: d.effectiveAt,
      amountDueTodayCents: 0,
      nextAmountCents: num(d.nextAmountCents),
    };
  }
  if (d.kind === 'immediate') {
    const prorationTimestamp = num(d.prorationTimestamp);
    const amountDueTodayCents = num(d.amountDueTodayCents);
    // A preview WITHOUT a Stripe amount is not a preview — never show a guess.
    if (prorationTimestamp === null || amountDueTodayCents === null) return null;
    return {
      kind: 'immediate',
      targetOfferKey: d.targetOfferKey,
      prorationTimestamp,
      amountDueTodayCents,
      currency: typeof d.currency === 'string' ? d.currency : 'eur',
      prorationCents: num(d.prorationCents) ?? 0,
      taxCents: num(d.taxCents) ?? 0,
      appliedBalanceCents: num(d.appliedBalanceCents) ?? 0,
      nextRenewalAt: typeof d.nextRenewalAt === 'string' ? d.nextRenewalAt : null,
      nextAmountCents: num(d.nextAmountCents),
      resetBillingCycle: d.resetBillingCycle === true,
    };
  }
  return null;
};

/** „Anuluj subskrypcję” — cancel at period end; access stays until the paid date. */
export function cancelSubscriptionAtPeriodEnd(): Promise<ManageResult<MutationReply>> {
  return invokeManage({ action: 'cancel' }, asMutationReply);
}

/** „Wznów subskrypcję” — clears cancel_at_period_end on the same subscription, no charge now. */
export function resumeSubscription(): Promise<ManageResult<MutationReply>> {
  return invokeManage({ action: 'resume' }, asMutationReply);
}

/** Real Stripe preview of a plan change (the amount due today, or the period-end plan). */
export function previewPlanChange(targetOfferKey: string): Promise<ManageResult<ChangePreview>> {
  return invokeManage({ action: 'preview_change', targetOfferKey }, asPreview);
}

/**
 * Apply the change the customer previewed. An IMMEDIATE change must echo the
 * preview's `prorationTimestamp` — that is what makes the amount charged the
 * amount shown; the server refuses a stale or missing one. A SCHEDULED
 * (period-end) change moves no money today and carries none.
 */
export function confirmPlanChange(
  targetOfferKey: string,
  prorationTimestamp?: number | null,
): Promise<ManageResult<MutationReply>> {
  return invokeManage(
    typeof prorationTimestamp === 'number'
      ? { action: 'confirm_change', targetOfferKey, prorationTimestamp }
      : { action: 'confirm_change', targetOfferKey },
    asMutationReply,
  );
}

/** „Anuluj zmianę planu” — release the scheduled period-end change. */
export function cancelScheduledPlanChange(): Promise<ManageResult<MutationReply>> {
  return invokeManage({ action: 'cancel_scheduled_change' }, asMutationReply);
}

export type PortalFailureReason = 'unavailable' | 'not_signed_in' | 'no_billing_customer' | 'failed';
export type PortalResult = { ok: true; url: string } | { ok: false; reason: PortalFailureReason };

/**
 * Stripe Customer Portal. `flow: 'payment_method_update'` deep-links to the
 * payment-method screen („Zaktualizuj metodę płatności”) — Stripe stores the
 * card, Pinguino never sees it. The return URL is this origin's account page,
 * which must be in the function's `BILLING_REDIRECT_URL_ALLOWLIST`.
 */
export async function openBillingPortal(flow?: 'payment_method_update'): Promise<PortalResult> {
  if (supabase === null) return { ok: false, reason: 'unavailable' };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, reason: 'not_signed_in' };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: { returnUrl: `${origin}/account?section=billing`, ...(flow ? { flow } : {}) },
  });
  if (error) {
    const reason = await readErrorCode(error);
    if (reason === 'no_billing_customer') return { ok: false, reason };
    if (reason === 'unauthorized') return { ok: false, reason: 'not_signed_in' };
    if (reason === 'billing_not_configured') return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'failed' };
  }
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === 'string' && url.length > 0 ? { ok: true, url } : { ok: false, reason: 'failed' };
}

/** The function's structured `{ error }` code, when the FunctionsHttpError carries one. */
async function readErrorCode(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = (await (context as Response).json()) as { error?: unknown };
      return typeof body?.error === 'string' ? body.error : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Function error code → typed reason (the closed vocabulary the UI branches on). */
export function manageReasonFromCode(code: string | null): ManageFailureReason {
  switch (code) {
    case 'unauthorized':
      return 'not_signed_in';
    case 'billing_not_configured':
    case 'offer_price_not_configured':
      return 'unavailable';
    case 'no_billing_customer':
    case 'no_active_subscription':
    case 'not_manageable':
      return 'no_subscription';
    case 'already_cancelling':
    case 'not_cancelling':
    case 'period_already_ended':
    case 'resume_before_changing_plan':
    case 'cancel_scheduled_change_first':
    case 'cadence_conversion_not_available':
    case 'same_offer':
    case 'preview_required':
    case 'preview_expired':
    case 'no_scheduled_change':
    case 'payment_failed':
    case 'requires_action':
      return code;
    case 'preview_in_future':
      return 'preview_expired';
    default:
      return 'failed';
  }
}

async function classifyInvokeError(error: unknown): Promise<ManageFailureReason> {
  return manageReasonFromCode(await readErrorCode(error));
}
