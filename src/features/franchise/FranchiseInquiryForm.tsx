import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { cooperationCopy } from '@/copy/cooperation';
import { submitFranchiseInquiry, type FranchiseConcept } from '@/services/franchise';

const c = cooperationCopy.franchise;

/** DESIGN F1 `.d-flabel` — 9.5 px mono caps, the compact field label. */
const LABEL =
  'block font-mono text-[9.5px] leading-[1.2] font-semibold tracking-[0.12em] text-[#8a857d] uppercase';
/** DESIGN F1 `.d-input` — 38 px row, 9 px radius, hairline ring, warm white. */
const FIELD =
  'pro-focus-ring mt-[5px] block h-[38px] w-full min-w-0 rounded-[9px] bg-[#fbfaf7] px-3 text-[13px] text-[var(--g-ink)] shadow-[inset_0_0_0_1px_#e4e0d9] outline-none';

/**
 * The Franchise funnel's missing middle.
 *
 * The page already explained the four approved concepts and then handed the
 * visitor a `mailto:` link, so a lead never reached Admin. This stores a real
 * inquiry and confirms it, without inventing a single commercial term.
 *
 * DESIGN F1 (owner, 2026-09-18) rescaled it and nothing else: the SAME fields,
 * the same validation, the same mutation and the same RPC, drawn as one compact
 * card — 38 px rows, two columns on a phone and three from the tablet up, a
 * short „Kontakt” head instead of a section-sized heading. It stays ON the
 * page, at the foot, and is the only contact Franchise offers.
 *
 * The concept is no longer picked inside the form: the four format cards above
 * ARE that choice in the design, so the page hands the open format's concept
 * down. The stored value is unchanged, and so is the default when no format is
 * open.
 */
export function FranchiseInquiryForm({
  concept = 'lokal',
  sourceRoute,
  title,
  note,
}: {
  /** The open format's stored concept. Same contract value, chosen above the form. */
  concept?: FranchiseConcept;
  /**
   * Route the question started on, from `?from=`. Recorded on the lead so Admin
   * can tell a /machines enquiry from a /trailer one — equipment has no concept
   * of its own, so without this the two would be indistinguishable.
   */
  sourceRoute?: string;
  /** DESIGN F1's short head. Defaults to the standing copy. */
  title?: string;
  note?: string;
}) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    city: '',
    country: '',
    note: '',
  });
  const submit = useMutation({
    mutationFn: () => submitFranchiseInquiry({ concept, sourceRoute, ...form }),
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const canSubmit = form.fullName.trim() !== '' && form.email.trim() !== '';

  if (submit.isSuccess) {
    /* DESIGN F1 `.d-sent`. */
    return (
      <div
        className="rounded-[12px] bg-[#e7e3dd] p-6 shadow-[inset_0_0_0_1px_rgba(16,17,19,0.12)]"
        id="franchise-inquiry"
      >
        <h3 className="text-[18px] leading-[1.25] font-semibold text-[var(--g-ink)]">
          {c.successTitle}
        </h3>
        <p className="mt-2 max-w-[56ch] text-[13.5px] leading-[1.5] text-[#3b3833]">
          {c.successBody}
        </p>
      </div>
    );
  }

  return (
    <form
      id="franchise-inquiry"
      /* `.d-formcard`: 14 px radius, hairline ring, the accent rule on top. */
      className="rounded-[14px] border-t-[3px] border-[var(--g-orange)] bg-white p-[16px_18px] shadow-[inset_0_0_0_1px_#efebe4] lg:max-w-[720px] lg:p-[20px_22px]"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !submit.isPending) submit.mutate();
      }}
    >
      <div className="mb-[14px]">
        <b className="block text-[16px] leading-[1.2] font-semibold text-[var(--g-ink)]">
          {title ?? c.formTitle}
        </b>
        <small className="mt-1 block max-w-[52ch] text-[12.5px] leading-[1.4] text-[#6f6b64]">
          {note ?? c.formBlurb}
        </small>
      </div>

      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-3 md:gap-3">
        <label className="block min-w-0">
          <span className={LABEL}>{c.nameLabel}</span>
          <input
            required
            value={form.fullName}
            onChange={(event) => set('fullName', event.currentTarget.value)}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{c.emailLabel}</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => set('email', event.currentTarget.value)}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{c.phoneLabel}</span>
          <input
            value={form.phone}
            onChange={(event) => set('phone', event.currentTarget.value)}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{c.cityLabel}</span>
          <input
            value={form.city}
            onChange={(event) => set('city', event.currentTarget.value)}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{c.countryLabel}</span>
          <input
            value={form.country}
            onChange={(event) => set('country', event.currentTarget.value)}
            className={FIELD}
          />
        </label>
      </div>

      <label className="mt-[10px] block min-w-0">
        <span className={LABEL}>{c.noteLabel}</span>
        <textarea
          rows={2}
          value={form.note}
          onChange={(event) => set('note', event.currentTarget.value)}
          className={cn(FIELD, 'h-[58px] resize-y py-2')}
          placeholder={c.notePlaceholder}
        />
      </label>

      {submit.isError ? (
        <p role="alert" className="mt-3 text-[12.5px] text-[#b3261e]">
          {c.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit || submit.isPending}
        /* `.d-btn.sm`: 40 px pill, 14 px label. */
        className="pro-focus-ring mt-[14px] inline-flex h-10 items-center justify-center rounded-full bg-[#101113] px-4 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45 md:justify-self-start"
      >
        {submit.isPending ? c.submitting : c.submit}
      </button>
    </form>
  );
}
