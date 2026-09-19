import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applicationFieldClasses,
  applicationPrimaryClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import {
  getMyPartnerApplication,
  submitPartnerApplication,
  type PartnerApplicationDraft,
} from '@/services/partner';
import { cooperationCopy } from '@/copy/cooperation';
import { ApplicationStatusCard } from './ApplicationStatusCard';
import { applicationSurface } from './applicationSurface';
import type { PartnerApplicationStatus } from './partnerApplicationStatus';

const c = cooperationCopy;

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Blog', 'Inne'] as const;

const label = 'text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase';

/**
 * The customer's way INTO the Gellatti partner programme.
 *
 * Everything behind it already existed — partners, codes, attribution,
 * commissions, the Partner workspace — but the only route in was an admin
 * invitation, so the cooperation page had no door. This panel writes a real
 * `partner_applications` row through the server, and Admin decides.
 */
export function PartnerApplicationPanel() {
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const queryClient = useQueryClient();
  const authed = authStatus === 'authed';

  const mine = useQuery({
    queryKey: ['partner-application', user?.id ?? 'anonymous'],
    queryFn: getMyPartnerApplication,
    enabled: authed,
  });

  const [draft, setDraft] = useState<PartnerApplicationDraft>({
    displayName: '',
    primaryLink: '',
    otherLinks: '',
    platforms: [],
    audience: '',
    country: '',
    languages: '',
    audienceSize: '',
    consent: false,
    note: '',
    proposedSlug: '',
  });

  const submit = useMutation({
    mutationFn: () => submitPartnerApplication(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['partner-application'] });
    },
  });

  const set = <K extends keyof PartnerApplicationDraft>(
    key: K,
    value: PartnerApplicationDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const togglePlatform = (platform: string) =>
    setDraft((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((entry) => entry !== platform)
        : [...current.platforms, platform],
    }));

  /**
   * C-APP-07: when the team asks for more information, the form comes back
   * holding what was already sent — the writer updates that same application,
   * so retyping everything would only invite a different answer by accident.
   * Consent is deliberately NOT carried over: it must be given again, never
   * pre-ticked (applicationPrivacy.test.ts pins the unticked default).
   */
  const prefilled = useRef(false);
  useEffect(() => {
    const app = mine.data?.application;
    if (!app || prefilled.current || !applicationSurface(app.status).prefill) return;
    prefilled.current = true;
    const sent = app.application_data ?? {};
    const text = (key: string) => (typeof sent[key] === 'string' ? (sent[key] as string) : '');
    const platforms = Array.isArray(sent.platforms)
      ? (sent.platforms as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [];
    setDraft((current) => ({
      ...current,
      displayName: current.displayName || text('displayName'),
      primaryLink: current.primaryLink || text('primaryLink'),
      otherLinks: current.otherLinks || text('otherLinks'),
      platforms: current.platforms.length > 0 ? current.platforms : platforms,
      audience: current.audience || text('audience'),
      country: current.country || text('country'),
      languages: current.languages || text('languages'),
      audienceSize: current.audienceSize || text('audienceSize'),
      // The writer stores the free-text answer as `description`.
      note: current.note || text('description') || text('note'),
      proposedSlug: current.proposedSlug || text('proposedSlug'),
    }));
  }, [mine.data]);

  if (!authed) {
    return (
      <div className="rounded-[12px] border border-ink/12 bg-white p-6" id="partner-application">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{c.form.title}</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">
          {c.form.signInFirst}
        </p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className={cn(applicationPrimaryClasses(), 'mt-5')}
        >
          {c.form.signInCta}
        </button>
      </div>
    );
  }

  if (mine.isLoading) {
    return <ApplicationState kind="loading" title={c.state.loading} />;
  }

  if (mine.data?.partnerActive) {
    return (
      <div
        className="rounded-[12px] border border-ink/12 bg-[#e7e3dd] p-6"
        id="partner-application"
      >
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{c.state.activeTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{c.state.activeBody}</p>
        <a href="/partner" className={cn(applicationPrimaryClasses(), 'mt-5 inline-flex')}>
          {c.state.activeCta}
        </a>
      </div>
    );
  }

  const application = mine.data?.application ?? null;
  // What the server just answered wins over a refetch that has not landed yet,
  // so a fresh submission never flashes the empty form again.
  const status: PartnerApplicationStatus | null =
    submit.data?.status ?? application?.status ?? null;
  const surface = applicationSurface(status);
  const statusCard =
    surface.showStatus && status ? (
      <ApplicationStatusCard status={status} reason={application?.decision_reason ?? null} />
    ) : null;

  if (!surface.showForm) {
    return <div id="partner-application">{statusCard}</div>;
  }

  const canSubmit =
    draft.displayName.trim() !== '' && draft.primaryLink.trim() !== '' && draft.consent === true;

  return (
    <div id="partner-application" className="space-y-4">
      {statusCard}
      <form
        className="rounded-[12px] border border-ink/12 bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !submit.isPending) submit.mutate();
        }}
      >
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{c.form.title}</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">{c.form.blurb}</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>{c.form.displayName}</span>
            <input
              required
              value={draft.displayName}
              onChange={(event) => set('displayName', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.displayNamePlaceholder}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>{c.form.account}</span>
            <input
              readOnly
              value={user?.email ?? ''}
              className={applicationFieldClasses('bg-[#f5f2ee] text-stone-600')}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={label}>{c.form.primaryLink}</span>
            <input
              required
              value={draft.primaryLink}
              onChange={(event) => set('primaryLink', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.primaryLinkPlaceholder}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={label}>{c.form.otherLinks}</span>
            <input
              value={draft.otherLinks}
              onChange={(event) => set('otherLinks', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.otherLinksPlaceholder}
            />
          </label>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={label}>{c.form.platforms}</span>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => {
                const active = draft.platforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePlatform(platform)}
                    className={cn(
                      'min-h-11 rounded-[10px] border px-4 text-sm transition-colors',
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-ink/15 bg-white text-stone-600 hover:border-ink/35',
                    )}
                  >
                    {platform}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={label}>{c.form.audience}</span>
            <input
              value={draft.audience}
              onChange={(event) => set('audience', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.audiencePlaceholder}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>{c.form.country}</span>
            <input
              value={draft.country}
              onChange={(event) => set('country', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.countryPlaceholder}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>{c.form.languages}</span>
            <input
              value={draft.languages}
              onChange={(event) => set('languages', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.languagesPlaceholder}
            />
          </label>
          {/* C-APP-03: a BAND, not an exact follower count. The tier decision only
              needs an order of magnitude, so asking for the precise number would
              collect more personal data than the decision uses. */}
          <label className="flex flex-col gap-1.5">
            <span className={label}>{c.form.audienceSize}</span>
            <select
              value={draft.audienceSize}
              onChange={(event) => set('audienceSize', event.currentTarget.value)}
              className={applicationFieldClasses()}
            >
              {c.form.audienceSizeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={label}>{c.form.note}</span>
            <textarea
              rows={3}
              value={draft.note}
              onChange={(event) => set('note', event.currentTarget.value)}
              className={applicationFieldClasses('resize-y')}
              placeholder={c.form.notePlaceholder}
            />
          </label>
          {/* C-APP-02: the applicant may suggest their own code. It was already in
              the draft and in the RPC, but no field ever rendered it, so nobody
              could actually suggest one. */}
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={label}>{c.form.proposedSlug}</span>
            <input
              value={draft.proposedSlug}
              onChange={(event) => set('proposedSlug', event.currentTarget.value)}
              className={applicationFieldClasses()}
              placeholder={c.form.proposedSlugPlaceholder}
            />
          </label>
          {/* Consent is REQUIRED and gates submit, so it can never be a
              pre-ticked formality the applicant did not actually give. */}
          <label className="flex items-start gap-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.consent === true}
              onChange={(event) => set('consent', event.currentTarget.checked)}
              className="mt-0.5 size-4 flex-none accent-[var(--g-orange)]"
              data-testid="application-consent"
            />
            <span className="text-[12.5px] leading-relaxed text-stone-600">{c.form.consent}</span>
          </label>
        </div>

        {submit.isError ? <p className="mt-4 text-sm text-[#b3261e]">{c.form.error}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || submit.isPending}
            className={cn(applicationPrimaryClasses(), 'disabled:opacity-45')}
          >
            {submit.isPending ? c.form.submitting : c.form.submit}
          </button>
          <a href="/community" className={applicationSecondaryClasses()}>
            {c.form.seeCommunity}
          </a>
        </div>
        <p className="mt-3 text-xs text-stone-500">{c.form.afterSubmit}</p>
      </form>
    </div>
  );
}
