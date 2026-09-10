import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { referralCopyPl as c } from '@/copy/referral';
import { fillTemplate } from '@/copy/affiliate';
import { REFERRAL_BONUS_DAYS } from './referralRewardRules';
import {
  getReferralDashboard,
  ensureReferralCode,
  referralLink,
  type ReferralRewardRow,
} from '@/services/referral';

/**
 * "Poleć Gellatti" — the regular-user referral surface.
 *
 * K01. The programme's backend has been live and proven for a while (the reward
 * is earned, banked and reversed correctly), but no screen ever rendered it, so
 * the person who earned days could not see them and nobody could start a
 * referral at all. This panel is only a view: every number, rule and refusal
 * already exists elsewhere and is read from there.
 *
 *   days per cadence  → referralRewardRules.REFERRAL_BONUS_DAYS
 *   totals and bank   → services/referral.getReferralDashboard (the RPC settles
 *                       the bank before answering, so what is shown is true now,
 *                       not what a webhook last wrote)
 *   every string      → copy/referral.ts
 *
 * It is NOT the Affiliate programme and says so out loud, because the two pay in
 * different currencies — PRO days here, money there. The copy guard bans money
 * words in this lane; the link out is the only bridge.
 */

const numeric = 'font-mono tabular-nums text-[var(--g-ink)]';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-3">
      <p className="text-[10px] leading-[1.25] font-bold tracking-[0.14em] text-[var(--g-text-secondary)] uppercase">
        {label}
      </p>
      <p className={cn(numeric, 'mt-1.5 text-[22px] leading-none font-semibold')}>{value}</p>
      {hint ? (
        <p className="mt-2 text-[11.5px] leading-[1.45] text-[var(--g-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** One earned or reversed reward. A reversal stays visible and struck through —
 *  a reward that quietly disappears looks like a bug to the person who earned it. */
function RewardRow({ row }: { row: ReferralRewardRow }) {
  const reversed = row.status === 'reversed';
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-[var(--g-line)] py-2.5 last:border-b-0">
      <span className="text-[13px] text-[var(--g-text-secondary)]">
        {c.product[row.product]} · {c.product[row.cadence]}
      </span>
      <span className="flex items-baseline gap-2.5">
        <span
          className={cn(
            'text-[11px] font-semibold tracking-[0.04em] uppercase',
            reversed ? 'text-[var(--g-text-muted)]' : 'text-[var(--g-orange)]',
          )}
        >
          {reversed ? c.rewardStatus.reversed : c.rewardStatus.earned}
        </span>
        <span className={cn(numeric, 'text-[14px] font-semibold', reversed && 'line-through opacity-55')}>
          +{row.bonusDays}
        </span>
      </span>
    </li>
  );
}

export function ReferralPanel() {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  // A signed-out visitor can reach this section — /affiliate links straight to
  // it. Without this gate the dashboard query never resolves for them and the
  // panel sits on "Przygotowuję Twój link…" for ever, which reads as a hang
  // rather than as "you are not signed in".
  const signedIn = useAuthStore((state) => state.user !== null);

  const dashboard = useQuery({
    enabled: signedIn,
    queryKey: ['referral', 'dashboard'],
    queryFn: async () => {
      const first = await getReferralDashboard();
      // A first-time visitor has no code yet. Minting is idempotent, so asking
      // for one here costs nothing on repeat visits and saves a dead panel.
      if (first.ok && !first.code) {
        const minted = await ensureReferralCode();
        if (minted.ok && minted.code) return { ...first, code: minted.code };
      }
      return first;
    },
  });

  const data = dashboard.data;
  const code = data?.code ?? null;

  const copy = async (what: 'code' | 'link', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard is permission-gated and simply unavailable in some contexts.
      // The code and link are both on screen and selectable, so a silent
      // no-op leaves the user no worse off than before they clicked.
    }
  };

  return (
    <section aria-labelledby="referral-title" data-testid="referral-panel">
      <p className="text-[10px] leading-[1.25] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
        {c.panel.eyebrow}
      </p>
      <h2
        id="referral-title"
        className="mt-2 text-[21px] leading-[1.2] font-bold tracking-[-0.028em] text-[var(--g-ink)]"
      >
        {c.panel.title}
      </h2>
      <p className="mt-2 max-w-[58ch] text-[13.5px] leading-relaxed text-[var(--g-text-secondary)]">
        {c.panel.blurb}
      </p>

      {!signedIn ? (
        <p className="mt-5 text-[13px] text-[var(--g-text-muted)]" data-testid="referral-signed-out">
          {c.claim.not_authenticated}
        </p>
      ) : dashboard.isPending ? (
        <p className="mt-5 text-[13px] text-[var(--g-text-muted)]">{c.panel.loading}</p>
      ) : !data?.ok || !code ? (
        <p className="mt-5 text-[13px] text-[var(--g-text-muted)]" data-testid="referral-unavailable">
          {c.panel.unavailable}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-3">
              <p className="text-[10px] leading-[1.25] font-bold tracking-[0.14em] text-[var(--g-text-secondary)] uppercase">
                {c.panel.codeLabel}
              </p>
              <p className={cn(numeric, 'mt-1.5 text-[19px] font-semibold tracking-[0.08em]')}>
                {code}
              </p>
              <button
                type="button"
                onClick={() => void copy('code', code)}
                className={cn(buttonClasses('ghost', 'sm'), 'mt-3')}
                data-testid="referral-copy-code"
              >
                {copied === 'code' ? c.panel.copied : c.panel.copyCode}
              </button>
            </div>
            <div className="rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-3">
              <p className="text-[10px] leading-[1.25] font-bold tracking-[0.14em] text-[var(--g-text-secondary)] uppercase">
                {c.panel.linkLabel}
              </p>
              <p className="mt-1.5 truncate text-[13px] text-[var(--g-text-secondary)]">
                {referralLink(code)}
              </p>
              <button
                type="button"
                onClick={() => void copy('link', referralLink(code))}
                className={cn(buttonClasses('ghost', 'sm'), 'mt-3')}
                data-testid="referral-copy-link"
              >
                {copied === 'link' ? c.panel.copied : c.panel.copyLink}
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={c.stats.invited} value={String(data.invited)} />
            <Stat label={c.stats.rewarded} value={String(data.rewarded)} />
            <Stat label={c.stats.daysEarned} value={String(data.daysEarned)} />
            <Stat
              label={c.stats.bank}
              value={String(data.bankDays)}
              hint={data.activeBonusEndsAt ? undefined : c.stats.bankHelp}
            />
          </div>

          {data.activeBonusEndsAt ? (
            <p className="mt-3 text-[12.5px] text-[var(--g-text-secondary)]">
              {c.stats.activeUntil}{' '}
              <span className={numeric}>{data.activeBonusEndsAt.slice(0, 10)}</span>
            </p>
          ) : null}

          <div className="mt-6">
            <h3 className="text-[13px] font-bold tracking-[-0.01em] text-[var(--g-ink)]">
              {c.rules.title}
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              <li className="text-[13px] text-[var(--g-text-secondary)]">
                {fillTemplate(c.rules.monthlyTemplate, { days: String(REFERRAL_BONUS_DAYS.monthly) })}
              </li>
              <li className="text-[13px] text-[var(--g-text-secondary)]">
                {fillTemplate(c.rules.annualTemplate, { days: String(REFERRAL_BONUS_DAYS.annual) })}
              </li>
            </ul>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--g-text-muted)]">
              {c.rules.honest}
            </p>
          </div>

          <div className="mt-6">
            {data.rewards.length === 0 ? (
              <p className="text-[13px] text-[var(--g-text-muted)]" data-testid="referral-empty">
                {c.stats.empty}
              </p>
            ) : (
              <ul className="border-t border-[var(--g-line)]">
                {data.rewards.map((row) => (
                  <RewardRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* The bridge to the other programme. It is deliberately quiet and always
          present: someone reading about PRO days should be able to find the
          programme that pays money, and should never confuse the two. */}
      <div className="mt-7 border-t border-[var(--g-line)] pt-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--g-text-muted)]">
          {c.rules.notAffiliate}
        </p>
        <Link
          to="/affiliate"
          className={cn(buttonClasses('ghost', 'sm'), 'mt-3 inline-flex')}
          data-testid="referral-affiliate-link"
        >
          {c.rules.affiliateLink}
        </Link>
      </div>
    </section>
  );
}
