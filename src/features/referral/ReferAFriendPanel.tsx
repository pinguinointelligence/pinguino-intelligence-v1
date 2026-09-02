import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { referralCopy } from '@/copy/referral';
import { fillTemplate } from '@/copy/affiliate';
import { useAuthStore } from '@/stores/authStore';
import {
  ensureReferralCode,
  getReferralDashboard,
  referralLink,
  type ReferralDashboard,
} from '@/services/referral';
import { REFERRAL_BONUS_DAYS } from './referralRewardRules';

const c = referralCopy;

const STAT_LABEL =
  'text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase';

function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className={STAT_LABEL}>{label}</dt>
      <dd className="mt-1.5 text-[20px] leading-[1.15] font-bold tracking-[-0.03em] text-[var(--g-ink)] tabular-nums">
        {value}
      </dd>
      {help ? (
        <p className="mt-1 text-[11px] leading-[1.45] text-[var(--g-text-muted)]">{help}</p>
      ) : null}
    </div>
  );
}

/** One copy control that reports what it did rather than silently succeeding. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={cn(buttonClasses('ghost', 'sm'), copied && 'border-[var(--g-ink)]')}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          // A denied clipboard permission must not look like success.
          .catch(() => setCopied(false));
      }}
    >
      {copied ? c.panel.copied : label}
    </button>
  );
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );

/**
 * POLEĆ GELLATTI — the signed-in user's referral panel.
 *
 * This is NOT the Affiliate dashboard. There is no commission, no payout, no
 * tier and no application: one link, one code, and days of PRO. The panel says
 * so explicitly and links to Affiliate for people who want the money programme
 * instead, so the two are never confused for one another.
 */
export function ReferAFriendPanel() {
  const authed = useAuthStore((state) => state.status) === 'authed';
  const userId = useAuthStore((state) => state.user?.id);

  // Minting is idempotent, so asking for the code on mount is safe and means
  // a first-time visitor sees a link rather than a "generate" button that
  // exists only to make them click once.
  const code = useQuery({
    queryKey: ['referral-code', userId ?? 'anonymous'],
    queryFn: ensureReferralCode,
    enabled: authed,
  });

  const dashboard = useQuery<ReferralDashboard>({
    queryKey: ['referral-dashboard', userId ?? 'anonymous'],
    queryFn: getReferralDashboard,
    enabled: authed,
  });

  if (!authed) return null;

  const myCode = code.data?.ok ? code.data.code : (dashboard.data?.code ?? null);
  const link = myCode ? referralLink(myCode) : null;
  const data = dashboard.data;
  const banked = (data?.bankDays ?? 0) > 0 && !data?.activeBonusEndsAt;

  return (
    <section aria-labelledby="refer-a-friend" data-testid="refer-a-friend">
      <span className={STAT_LABEL}>{c.panel.eyebrow}</span>
      <h2
        id="refer-a-friend"
        className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]"
      >
        {c.panel.title}
      </h2>
      <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
        {c.panel.blurb}
      </p>

      {/* ── the link ─────────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-[12px] border border-[var(--g-line)] bg-white p-5">
        {code.isLoading ? (
          <p className="text-[13px] text-[var(--g-text-secondary)]" role="status">
            {c.panel.loading}
          </p>
        ) : link && myCode ? (
          <>
            <span className={STAT_LABEL}>{c.panel.linkLabel}</span>
            <p className="mt-1.5 font-mono text-[13px] break-all text-[var(--g-ink)]">{link}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CopyButton value={link} label={c.panel.copyLink} />
              <CopyButton value={myCode} label={c.panel.copyCode} />
              <span className="ml-1 text-[12px] text-[var(--g-text-secondary)]">
                {c.panel.codeLabel}:{' '}
                <strong className="font-mono font-semibold text-[var(--g-ink)]">{myCode}</strong>
              </span>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-[var(--g-text-secondary)]">{c.panel.unavailable}</p>
        )}
      </div>

      {/* ── the rule, stated from the canonical day table ─────────────────── */}
      <div className="mt-3 rounded-[12px] border border-[var(--g-line)] bg-[#e7e3dd] p-5">
        <span className={STAT_LABEL}>{c.rules.title}</span>
        <ul className="mt-2 space-y-1.5">
          <li className="text-[13px] leading-relaxed text-[var(--g-ink)]">
            {fillTemplate(c.rules.monthlyTemplate, { days: REFERRAL_BONUS_DAYS.monthly })}
          </li>
          <li className="text-[13px] leading-relaxed text-[var(--g-ink)]">
            {fillTemplate(c.rules.annualTemplate, { days: REFERRAL_BONUS_DAYS.annual })}
          </li>
        </ul>
        <p className="mt-3 text-[12px] leading-[1.5] text-[var(--g-text-muted)]">{c.rules.honest}</p>
        <p className="mt-3 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          {c.rules.notAffiliate}{' '}
          <Link to="/affiliate" className="underline underline-offset-2 hover:text-[var(--g-ink)]">
            {c.rules.affiliateLink}
          </Link>
        </p>
      </div>

      {/* ── status ───────────────────────────────────────────────────────── */}
      <dl className="mt-3 grid gap-px overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={c.stats.invited} value={String(data?.invited ?? 0)} />
        <Stat label={c.stats.rewarded} value={String(data?.rewarded ?? 0)} />
        <Stat label={c.stats.daysEarned} value={String(data?.daysEarned ?? 0)} />
        <Stat
          label={c.stats.bank}
          value={String(data?.bankDays ?? 0)}
          help={banked ? c.stats.bankedWhilePro : c.stats.bankHelp}
        />
      </dl>

      {data?.activeBonusEndsAt ? (
        <p className="mt-3 text-[13px] text-[var(--g-ink)]">
          <strong className="font-semibold">{c.stats.activeUntil}:</strong>{' '}
          {formatDate(data.activeBonusEndsAt)}
        </p>
      ) : null}

      {data && data.rewards.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--g-line)] overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-white">
          {data.rewards.map((reward) => (
            <li key={reward.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <span className="text-[13px] text-[var(--g-text-secondary)]">
                {c.product[reward.product]} · {c.product[reward.cadence]}
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    'text-[11px] font-semibold tracking-[0.04em] uppercase',
                    reward.status === 'reversed'
                      ? 'text-[var(--g-text-muted)]'
                      : 'text-[var(--g-ink)]',
                  )}
                >
                  {c.rewardStatus[reward.status]}
                </span>
                <strong
                  className={cn(
                    'text-[14px] font-bold tabular-nums',
                    reward.status === 'reversed'
                      ? 'text-[var(--g-text-muted)] line-through'
                      : 'text-[var(--g-ink)]',
                  )}
                >
                  +{reward.bonusDays}
                </strong>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-[var(--g-text-secondary)]">{c.stats.empty}</p>
      )}
    </section>
  );
}
