import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  applicationFieldClasses,
  applicationPrimaryClasses,
} from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { cooperationCopy } from '@/copy/cooperation';
import { submitFranchiseInquiry, type FranchiseConcept } from '@/services/franchise';
import {
  FRANCHISE_CONCEPT_ORDER,
  franchiseConceptLabelPl,
} from './franchiseConcepts';

const c = cooperationCopy.franchise;
const label = 'text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase';

/**
 * The Franchise funnel's missing middle.
 *
 * The page already explained the four approved concepts and then handed the
 * visitor a `mailto:` link, so a lead never reached Admin. This stores a real
 * inquiry and confirms it, without inventing a single commercial term.
 */
export function FranchiseInquiryForm({
  initialConcept = 'lokal',
  sourceRoute,
}: {
  initialConcept?: FranchiseConcept;
  /**
   * Route the question started on, from `?from=`. Recorded on the lead so Admin
   * can tell a /machines enquiry from a /trailer one — equipment has no concept
   * of its own, so without this the two would be indistinguishable.
   */
  sourceRoute?: string;
}) {
  const [concept, setConcept] = useState<FranchiseConcept>(initialConcept);
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
    return (
      <div className="rounded-[12px] border border-ink/12 bg-[#e7e3dd] p-6" id="franchise-inquiry">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{c.successTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{c.successBody}</p>
      </div>
    );
  }

  return (
    <form
      id="franchise-inquiry"
      className="rounded-[12px] border border-ink/12 bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !submit.isPending) submit.mutate();
      }}
    >
      <h3 className="text-lg font-semibold tracking-[-0.02em]">{c.formTitle}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">{c.formBlurb}</p>

      <div className="mt-5 flex flex-col gap-1.5">
        <span className={label}>{c.conceptLabel}</span>
        <div className="flex flex-wrap gap-2">
          {FRANCHISE_CONCEPT_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={concept === option}
              onClick={() => setConcept(option)}
              className={cn(
                'min-h-11 rounded-[10px] border px-4 text-sm transition-colors',
                concept === option
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 bg-white text-stone-600 hover:border-ink/35',
              )}
            >
              {franchiseConceptLabelPl(option)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>{c.nameLabel}</span>
          <input
            required
            value={form.fullName}
            onChange={(event) => set('fullName', event.currentTarget.value)}
            className={applicationFieldClasses()}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{c.emailLabel}</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => set('email', event.currentTarget.value)}
            className={applicationFieldClasses()}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{c.phoneLabel}</span>
          <input
            value={form.phone}
            onChange={(event) => set('phone', event.currentTarget.value)}
            className={applicationFieldClasses()}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{c.cityLabel}</span>
          <input
            value={form.city}
            onChange={(event) => set('city', event.currentTarget.value)}
            className={applicationFieldClasses()}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{c.countryLabel}</span>
          <input
            value={form.country}
            onChange={(event) => set('country', event.currentTarget.value)}
            className={applicationFieldClasses()}
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={label}>{c.noteLabel}</span>
          <textarea
            rows={3}
            value={form.note}
            onChange={(event) => set('note', event.currentTarget.value)}
            className={applicationFieldClasses('resize-y')}
            placeholder={c.notePlaceholder}
          />
        </label>
      </div>

      {submit.isError ? <p className="mt-4 text-sm text-[#b3261e]">{c.error}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit || submit.isPending}
        className={cn(applicationPrimaryClasses(), 'mt-6 disabled:opacity-45')}
      >
        {submit.isPending ? c.submitting : c.submit}
      </button>
    </form>
  );
}
