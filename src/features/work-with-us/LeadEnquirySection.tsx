import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import {
  DestinationSection,
  DestinationSectionHead,
} from '@/components/shared/destinationEditorial';
import { applicationFieldClasses } from '@/components/ui/applicationControlStyles';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { customerErrorMessage } from '@/copy/customerError';
import { LEAD_TYPE_BY_ROUTE, LEAD_TYPE_LABEL, leadCopy as t } from '@/copy/workWithUsLead';
import { submitBusinessLead, type BusinessLeadType } from '@/services/businessLeads';
import { applicationViewportGeometry } from '@/features/shell/applicationScaleAuthority';

const fieldClass = applicationFieldClasses('mt-1 text-sm');
const labelClass = 'block text-[12px] font-semibold tracking-[-0.01em] text-[var(--g-ink)]';
const hintClass = 'ml-1 font-normal text-[var(--g-text-muted)]';

const LEAD_TYPES = Object.keys(LEAD_TYPE_LABEL) as BusinessLeadType[];

/** How often, and for how long, the anchor re-checks that it is still aligned. */
const ALIGN_INTERVAL_MS = 100;
const ALIGN_BUDGET_MS = 3000;

/** The four lanes plus the gateway itself — anything else is not one of ours. */
const knownRoute = (value: string | null): string | null =>
  value !== null && (value in LEAD_TYPE_BY_ROUTE || value === '/work-with-us') ? value : null;

interface Submitted {
  reference: string;
}

/**
 * The real enquiry surface at `/work-with-us#lead`.
 *
 * Every lane CTA points here. Before this existed the CTAs pointed at an anchor
 * that was never rendered, so the buttons landed on the top of the gateway and
 * the visitor had nowhere to ask — the reason this section exists at all.
 *
 * It writes through `gellatti_submit_business_lead_v1`, the canonical business-leads
 * authority, which is executable by a signed-out visitor by design: a machine
 * enquiry must not require an account. No field here is invented — every one maps
 * to a column that authority already defines.
 */
export function LeadEnquirySection() {
  const [params] = useSearchParams();

  /**
   * `?from=` records where the visitor actually was. It also chooses the initial
   * subject, so arriving from `/trailer` costs no extra click — but the two stay
   * SEPARATE afterwards: change the select and the route still says `/trailer`,
   * which is exactly what the stored `source_route` is for.
   */
  const sourceRoute = knownRoute(params.get('from')) ?? '/work-with-us';
  const [leadType, setLeadType] = useState<BusinessLeadType | ''>(
    LEAD_TYPE_BY_ROUTE[sourceRoute] ?? '',
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const inFlight = useRef(false);

  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  /**
   * Bring the section into view when the URL asks for it.
   *
   * A browser only jumps to a fragment on a full document load. Every lane CTA
   * is a client-side navigation, and this app installs no scroll restoration, so
   * without this the button would change the URL and leave the visitor at the
   * top of the gateway — the dead CTA in a quieter form. Scoped to this section
   * rather than added globally, because only this anchor is navigated to.
   */
  const anchorRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== '#lead') return;

    /**
     * ONE SCROLL IS NOT ENOUGH on a client-side navigation.
     *
     * Measured on staging: arriving from /machines landed at y=112 while the
     * section's real position was y=4127. At mount the gateway's images above
     * this section have not loaded, so the document is short and the section is
     * near the top; the scroll succeeds, then the images arrive and push it
     * 4000 px down, leaving the visitor stranded at the top — the dead CTA
     * again, one step further along. A direct full page load did not show this,
     * because the document was already laid out.
     *
     * So re-align until the section's ABSOLUTE position stops moving, bounded in
     * time so a page that never settles is not scrolled forever.
     *
     * Driven by a TIMER, not requestAnimationFrame: rAF does not fire at all
     * while a document is hidden, so a tab restored in the background or opened
     * with cmd-click would never align, and neither could the behaviour be
     * verified in a headless pane. A timer still fires there, clamped.
     */
    let settled = 0;
    let elapsed = 0;
    let previousTop = Number.NaN;
    let timer = 0;

    const align = () => {
      const node = anchorRef.current;
      if (node === null) return;
      const top = applicationViewportGeometry(node.getBoundingClientRect()).top + window.scrollY;
      if (top !== previousTop) {
        previousTop = top;
        settled = 0;
        // Instant, not smooth: this is an arrival, and animating a 4000 px
        // correction on every reflow would read as the page fighting the reader.
        node.scrollIntoView({ block: 'start' });
      } else {
        settled += 1;
      }
      elapsed += ALIGN_INTERVAL_MS;
      if (settled < 3 && elapsed < ALIGN_BUDGET_MS) {
        timer = window.setTimeout(align, ALIGN_INTERVAL_MS);
      }
    };

    align();
    return () => window.clearTimeout(timer);
  }, [hash]);

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (leadType === '') next.leadType = t.errSubject;
    if (fullName.trim() === '') next.fullName = t.errFullName;
    // The same shape the stored authority enforces, checked here so the visitor
    // is told which field is wrong instead of being shown a database message.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t.errEmail;
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    /**
     * The in-flight guard is a REF, not the `busy` state.
     *
     * `setBusy(true)` does not take effect until React re-renders, so two clicks
     * landing in the same tick would both read `busy === false` and both submit.
     * The submit function mints a new reference every call and has no
     * idempotency key, so that is a second real lead, not a harmless retry.
     * A ref closes the window because it updates synchronously.
     */
    if (inFlight.current) return;
    inFlight.current = true;

    const errors = validate();
    setFieldErrors(errors);
    setFailure(null);
    if (Object.keys(errors).length > 0 || leadType === '') {
      inFlight.current = false; // refusing is not submitting; the next attempt must work
      return;
    }

    setBusy(true);
    try {
      const result = await submitBusinessLead({
        leadType,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        city: city.trim() || undefined,
        message: message.trim() || undefined,
        sourceRoute,
      });
      setSubmitted({ reference: result.reference });
    } catch (error) {
      // Never the raised code itself: `lead_email_required` means nothing to a person.
      setFailure(customerErrorMessage(error, 'shared'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (submitted !== null) {
    return (
      <DestinationSection>
        <div
          id="lead"
          ref={anchorRef}
          className="scroll-mt-28 rounded-[12px] border border-[var(--g-line)] bg-white p-[clamp(24px,3.4vw,44px)]"
        >
          <h2 className="text-[clamp(20px,2.2vw,28px)] leading-[1.1] font-bold tracking-[-0.03em] text-[var(--g-ink)]">
            {t.successTitle}
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[var(--g-text-secondary)]">
            {t.successBody}{' '}
            <strong className="font-bold text-[var(--g-ink)]">{submitted.reference}</strong>
          </p>
          <button
            type="button"
            className={`${buttonClasses('ghost', 'md')} mt-7 inline-flex bg-white`}
            onClick={() => {
              setSubmitted(null);
              setFullName('');
              setEmail('');
              setPhone('');
              setCountry('');
              setCity('');
              setMessage('');
            }}
          >
            {t.successAgain}
          </button>
        </div>
      </DestinationSection>
    );
  }

  return (
    <DestinationSection>
      <div
        id="lead"
        ref={anchorRef}
        className="scroll-mt-28 rounded-[12px] border border-[var(--g-line)] bg-white p-[clamp(24px,3.4vw,44px)]"
      >
        <DestinationSectionHead eyebrow={t.eyebrow} title={t.title} helper={t.blurb} />

        <form className="mt-8 grid max-w-3xl gap-5 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
          <label className="block sm:col-span-2" htmlFor={id('subject')}>
            <span className={labelClass}>{t.subject}</span>
            <select
              id={id('subject')}
              className={fieldClass}
              value={leadType}
              aria-invalid={fieldErrors.leadType !== undefined}
              onChange={(e) => setLeadType(e.target.value as BusinessLeadType | '')}
            >
              <option value="">{t.subjectPlaceholder}</option>
              {LEAD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LEAD_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            {fieldErrors.leadType !== undefined ? (
              <span className="mt-1 block text-[12px] text-status-error">
                {fieldErrors.leadType}
              </span>
            ) : null}
          </label>

          <label className="block" htmlFor={id('name')}>
            <span className={labelClass}>{t.fullName}</span>
            <input
              id={id('name')}
              className={fieldClass}
              value={fullName}
              autoComplete="name"
              aria-invalid={fieldErrors.fullName !== undefined}
              onChange={(e) => setFullName(e.target.value)}
            />
            {fieldErrors.fullName !== undefined ? (
              <span className="mt-1 block text-[12px] text-status-error">
                {fieldErrors.fullName}
              </span>
            ) : null}
          </label>

          <label className="block" htmlFor={id('email')}>
            <span className={labelClass}>{t.email}</span>
            <input
              id={id('email')}
              type="email"
              className={fieldClass}
              value={email}
              autoComplete="email"
              aria-invalid={fieldErrors.email !== undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email !== undefined ? (
              <span className="mt-1 block text-[12px] text-status-error">{fieldErrors.email}</span>
            ) : null}
          </label>

          <label className="block" htmlFor={id('phone')}>
            <span className={labelClass}>
              {t.phone}
              <span className={hintClass}>{t.optional}</span>
            </span>
            <input
              id={id('phone')}
              type="tel"
              className={fieldClass}
              value={phone}
              autoComplete="tel"
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="block" htmlFor={id('country')}>
            <span className={labelClass}>
              {t.country}
              <span className={hintClass}>{t.optional}</span>
            </span>
            <input
              id={id('country')}
              className={fieldClass}
              value={country}
              autoComplete="country-name"
              onChange={(e) => setCountry(e.target.value)}
            />
          </label>

          <label className="block" htmlFor={id('city')}>
            <span className={labelClass}>
              {t.city}
              <span className={hintClass}>{t.optional}</span>
            </span>
            <input
              id={id('city')}
              className={fieldClass}
              value={city}
              autoComplete="address-level2"
              onChange={(e) => setCity(e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2" htmlFor={id('message')}>
            <span className={labelClass}>
              {t.message}
              <span className={hintClass}>{t.optional}</span>
            </span>
            <textarea
              id={id('message')}
              className={applicationFieldClasses('mt-1 h-auto min-h-28 py-2 text-sm')}
              value={message}
              placeholder={t.messagePlaceholder}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          <div className="sm:col-span-2">
            {failure !== null ? (
              <p role="alert" className="mb-4 text-[13px] leading-relaxed text-status-error">
                {failure}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className={`${buttonClasses('orange', 'md')} inline-flex disabled:opacity-60`}
            >
              {busy ? t.submitting : t.submit}
            </button>
          </div>
        </form>
      </div>
    </DestinationSection>
  );
}
