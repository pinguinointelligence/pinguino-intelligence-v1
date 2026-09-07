import { supabase } from '@/lib/supabase/client';

/**
 * REFER A FRIEND — the user reward lane's client.
 *
 * Deliberately separate from `services/partner.ts`: this lane earns PRO DAYS,
 * that one earns MONEY, and they must not become one module with a flag. The
 * only three RPCs a signed-in user may call are here; everything that creates
 * value runs with elevated privileges inside the payment webhook, never here.
 */

const unavailable = (): never => {
  throw new Error('Referral backend is unavailable in this build.');
};

/** One reward row as the referrer sees it. Carries no data about the referred person. */
export interface ReferralRewardRow {
  id: string;
  product: 'home' | 'pro';
  cadence: 'monthly' | 'annual';
  bonusDays: number;
  status: 'earned' | 'reversed';
  earnedAt: string;
}

export interface ReferralDashboard {
  ok: boolean;
  reason?: string;
  code?: string | null;
  /** How many people claimed this user's link. */
  invited: number;
  /** How many of them produced a live reward. */
  rewarded: number;
  reversed: number;
  /** Days earned in total, excluding reversals. */
  daysEarned: number;
  /** Days currently in the PRO Bonus Bank. May be negative after a reversal. */
  bankDays: number;
  /** When a currently-running bonus grant ends, if one is running. */
  activeBonusEndsAt: string | null;
  rewards: ReferralRewardRow[];
}

const EMPTY_DASHBOARD: ReferralDashboard = {
  ok: false,
  invited: 0,
  rewarded: 0,
  reversed: 0,
  daysEarned: 0,
  bankDays: 0,
  activeBonusEndsAt: null,
  rewards: [],
};

/**
 * The referrer's own view. The RPC SETTLES the bank before answering, so the
 * days shown are the days that are actually true right now — not the ones a
 * webhook last happened to write.
 */
export async function getReferralDashboard(): Promise<ReferralDashboard> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_referral_dashboard_v1');
  if (error) throw error;
  const payload = (data ?? {}) as Partial<ReferralDashboard>;
  return { ...EMPTY_DASHBOARD, ...payload, ok: payload.ok === true };
}

/** Mint (or fetch) this user's personal referral code. Idempotent. */
export async function ensureReferralCode(): Promise<{ ok: boolean; code?: string; reason?: string }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_referral_code_v1');
  if (error) throw error;
  return (data ?? { ok: false }) as { ok: boolean; code?: string; reason?: string };
}

/**
 * Typed refusals from `gellatti_claim_referral_code_v1`. They are CONTRACT
 * values — never shown raw to a customer; `referralClaimMessagePl` maps them.
 */
export type ReferralClaimReason =
  | 'claimed'
  | 'not_authenticated'
  | 'code_required'
  | 'code_not_found'
  | 'self_referral'
  | 'already_claimed_same'
  | 'already_claimed_other'
  | 'partner_attribution_exists';

export async function claimReferralCode(
  code: string,
): Promise<{ ok: boolean; reason: ReferralClaimReason }> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_claim_referral_code_v1', { p_code: code });
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  return {
    ok: result.ok === true,
    reason: (result.reason ?? 'code_not_found') as ReferralClaimReason,
  };
}

/** Where a referral link points. One link, one code — not a campaign builder. */
export function referralLink(code: string, origin = window.location.origin): string {
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

/** The query parameter a referral link carries. */
export const REFERRAL_QUERY_PARAM = 'ref';

/** Where a pending referral code waits until the visitor has an account. */
const PENDING_KEY = 'gellatti_pending_referral_v1';

/**
 * A visitor who arrives on a referral link usually has no account yet, so the
 * code is parked until they do. It is stored as the raw code and claimed
 * server-side — the browser never decides who referred whom.
 */
export function savePendingReferralCode(code: string): void {
  try {
    localStorage.setItem(PENDING_KEY, code);
  } catch {
    // A private window with storage disabled loses the referral rather than
    // breaking the page. The link still works; only the credit is lost.
  }
}

export function readPendingReferralCode(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingReferralCode(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}
