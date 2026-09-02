import { useState } from 'react';
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
 *
 * ONE PANEL, TWO SURFACES. Work With Us presents this as the *Partner*
 * application; `/affiliate` presents the SAME flow, the same RPC and the same
 * `partner_applications` row as the *Affiliate* application. Only the wording
 * and the anchor differ, which is what `labels` and `anchorId` carry. A second
 * application component would mean a second application system — the one thing
 * this programme must not have.
 */
export interface PartnerApplicationLabels {
  readonly formTitle?: string;
  readonly signInFirst?: string;
  readonly signInCta?: string;
  readonly activeTitle?: string;
  readonly activeBody?: string;
  readonly activeCta?: string;
  /** Where the approved applicant's panel lives. */
  readonly activeHref?: string;
  readonly pendingTitle?: string;
  readonly pendingBody?: string;
  readonly informationBody?: string;
}

export function PartnerApplicationPanel({
  labels,
  anchorId = 'partner-application',
}: {
  labels?: PartnerApplicationLabels;
  anchorId?: string;
} = {}) {
  // Defaults are the cooperation copy this panel shipped with, so Work With Us
  // is byte-identical unless a caller deliberately overrides a string.
  const t = {
    formTitle: labels?.formTitle ?? c.form.title,
    signInFirst: labels?.signInFirst ?? c.form.signInFirst,
    signInCta: labels?.signInCta ?? c.form.signInCta,
    activeTitle: labels?.activeTitle ?? c.state.activeTitle,
    activeBody: labels?.activeBody ?? c.state.activeBody,
    activeCta: labels?.activeCta ?? c.state.activeCta,
    activeHref: labels?.activeHref ?? '/partner',
    pendingTitle: labels?.pendingTitle ?? c.state.pendingTitle,
    pendingBody: labels?.pendingBody ?? c.state.pendingBody,
    informationBody: labels?.informationBody ?? c.state.informationBody,
  };
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

  if (!authed) {
    return (
      <div className="rounded-[12px] border border-ink/12 bg-white p-6" id={anchorId}>
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{t.formTitle}</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">{t.signInFirst}</p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className={cn(applicationPrimaryClasses(), 'mt-5')}
        >
          {t.signInCta}
        </button>
      </div>
    );
  }

  if (mine.isLoading) {
    return <ApplicationState kind="loading" title={c.state.loading} />;
  }

  if (mine.data?.partnerActive) {
    return (
      <div className="rounded-[12px] border border-ink/12 bg-[#e7e3dd] p-6" id={anchorId}>
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{t.activeTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{t.activeBody}</p>
        <a href={t.activeHref} className={cn(applicationPrimaryClasses(), 'mt-5 inline-flex')}>
          {t.activeCta}
        </a>
      </div>
    );
  }

  const status = mine.data?.application?.status;
  if (status === 'submitted' || status === 'more_information_needed' || submit.data?.id) {
    const reason = mine.data?.application?.decision_reason;
    return (
      <div className="rounded-[12px] border border-ink/12 bg-white p-6" id={anchorId}>
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{t.pendingTitle}</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">
          {status === 'more_information_needed' ? t.informationBody : t.pendingBody}
        </p>
        {reason ? <p className="mt-3 text-sm text-stone-600">{reason}</p> : null}
      </div>
    );
  }

  const rejected = status === 'rejected';
  const canSubmit = draft.displayName.trim() !== '' && draft.primaryLink.trim() !== '';

  return (
    <form
      id={anchorId}
      className="rounded-[12px] border border-ink/12 bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !submit.isPending) submit.mutate();
      }}
    >
      <h3 className="text-lg font-semibold tracking-[-0.02em]">{t.formTitle}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">{c.form.blurb}</p>
      {rejected ? (
        <p className="mt-3 max-w-prose text-sm text-stone-600">{c.state.rejectedBody}</p>
      ) : null}

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
  );
}
