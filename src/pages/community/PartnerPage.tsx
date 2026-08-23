import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { communityCopy } from '@/copy/community';
import { partnerDashboard, type PartnerDashboardResult } from '@/services/community';

/**
 * The Gellatti Partner area (§35) — the ONLY place money appears.
 *
 * Owner rule (2026-08-23), stated on the page rather than buried in a policy
 * document: commission is earned only on subscriptions acquired while Partner
 * status is ACTIVE. Creator standing, recipe popularity, sharing volume and
 * historical referrals never create a payment entitlement, and commissions are
 * not retroactive.
 *
 * That is why „nie jesteś Partnerem" and „nie masz jeszcze prowizji" render as
 * two different states. Showing an empty earnings dashboard to a non-partner
 * would imply that earnings are coming, which is precisely the impression the
 * rule exists to prevent.
 *
 * Aggregates only. No customer identity crosses this boundary (§81).
 */
export function PartnerPage() {
  const copy = communityCopy;
  const [data, setData] = useState<PartnerDashboardResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    partnerDashboard()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setData({ ok: false, reason: 'not_a_partner' }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DestinationSurface eyebrow="GELLATTI" title={copy.partner.dashboardTitle}>
      <div className="flex flex-col gap-10">
        {data === null ? <p className="text-sm text-stone-400">…</p> : null}

        {data !== null && !data.ok ? (
          <Card className="flex flex-col gap-4">
            <p className="text-base text-ink">
              {data.reason === 'partner_not_active' ? copy.partner.notActive : copy.partner.notAPartner}
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-stone-500">
              {copy.partner.eligibilityNote}
            </p>
            <p className="text-sm text-stone-500">
              Statystyki Twoich receptur znajdziesz w sekcji{' '}
              <Link to="/creator" className="text-ink underline-offset-4 hover:underline">
                {copy.roles.creator}
              </Link>
              .
            </p>
          </Card>
        ) : null}

        {data?.ok ? (
          <>
            <section>
              <SectionLabel>Ruch</SectionLabel>
              <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
                <Metric label="Otwarcia linku" value={data.traffic.referral_opens} />
                <Metric label={copy.metrics.opens} value={data.traffic.recipe_share_opens} />
                <Metric
                  label={copy.metrics.uniqueOpens}
                  value={data.traffic.recipe_share_unique_opens}
                />
                <Metric
                  label={copy.partner.attributedSubscriptions}
                  value={data.attributions.active}
                />
              </dl>
            </section>

            <section>
              <SectionLabel>Prowizje</SectionLabel>
              <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {(
                  [
                    ['held', copy.partner.pending],
                    ['eligible', copy.partner.approved],
                    ['paid', copy.partner.paid],
                    ['reversed', copy.partner.reversed],
                  ] as const
                ).map(([key, label]) => {
                  const entry = data.commissions[key];
                  return (
                    <div key={key}>
                      <dt className="text-xs tracking-label uppercase text-stone-400">{label}</dt>
                      <dd className="mt-1 text-2xl font-medium tabular-nums text-ink">
                        {entry ? formatMoney(entry.amount_cents, entry.currency) : '—'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-500">
                {copy.partner.eligibilityNote}
              </p>
              <p className="mt-2 text-sm text-stone-500">{copy.partner.separateFromCreator}</p>
            </section>

            {data.codes.length > 0 ? (
              <section>
                <SectionLabel>Kody</SectionLabel>
                <ul className="mt-4 flex flex-wrap gap-3">
                  {data.codes.map((code) => (
                    <li
                      key={code.code}
                      className="rounded-sm border border-ink/15 px-3 py-2 font-mono text-sm text-ink"
                    >
                      {code.code}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </DestinationSurface>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs tracking-label uppercase text-stone-400">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** Amounts come from the ledger in minor units; never computed in the client. */
function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
