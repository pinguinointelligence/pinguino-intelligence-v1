import { useCallback, useEffect, useRef, useState } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import { myRating, ratePublication, type MyRating } from '@/services/community';

/**
 * Verified rating — submit and update (§42).
 *
 * ELIGIBILITY IS A CONFIRMED MAKE, and nothing else. Viewing, copying or
 * remixing a recipe does not qualify; only a completed production run does.
 * The control asks the server whether this user may rate (`can_rate`) and
 * renders nothing at all when they may not — an empty star row a user cannot
 * use would be an invitation to be refused.
 *
 * The client's answer is advisory in both directions: a user who forces
 * `can_rate` in devtools still hits `rating_requires_confirmed_make` on the
 * write, because `gellatti_rate_publication_v1` re-reads their make events.
 *
 * ONE ACTIVE RATING PER USER. The RPC upserts on (publication, user), so a
 * second submit updates rather than duplicating. When a rating already exists
 * the control opens with it selected and the button says „Zaktualizuj ocenę".
 *
 * PREMIUM, NOT SOCIAL. Five small text glyphs on a hairline row — no oversized
 * stars, no colour explosion, no animation. The rating is also announced in
 * text for assistive tech, so it is never conveyed by shape alone (§62).
 */
export function RatePublication({
  publicationId,
  onRated,
  className,
}: {
  publicationId: string;
  /** Called after a successful write so the caller can refresh the aggregate. */
  onRated?: () => void;
  className?: string;
}) {
  const copy = communityCopy;
  const [mine, setMine] = useState<MyRating | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    myRating(publicationId)
      .then((result) => {
        if (cancelled) return;
        setMine(result);
        setDraft(result.stars ?? null);
      })
      .catch(() => {
        if (!cancelled) setMine({ ok: false, can_rate: false, confirmed_makes: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [publicationId]);

  const submit = useCallback(async () => {
    if (draft === null || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await ratePublication(publicationId, draft);
      const refreshed = await myRating(publicationId);
      setMine(refreshed);
      setDraft(refreshed.stars ?? draft);
      setSaved(true);
      // Let the page re-read the publication so the verified average and count
      // shown above this control reflect the rating just written.
      onRated?.();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(
        message.includes('rating_requires_confirmed_make')
          ? 'Ocenić może tylko osoba, która wykonała tę recepturę.'
          : message,
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [draft, onRated, publicationId]);

  // Not eligible (or not signed in) → render nothing. The aggregate rating is
  // shown elsewhere on the page regardless.
  if (!mine?.can_rate) return null;

  const alreadyRated = typeof mine.stars === 'number';
  const shown = hover ?? draft ?? 0;
  const unchanged = alreadyRated && draft === mine.stars;

  return (
    <div className={cn('flex flex-col gap-3 border-t border-ink/10 pt-5', className)}>
      <SectionLabel>{copy.metrics.verifiedRating}</SectionLabel>

      <div
        role="radiogroup"
        aria-label={copy.metrics.verifiedRating}
        className="flex items-center gap-1"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={draft === value}
            aria-label={`${value} / 5`}
            disabled={pending}
            onMouseEnter={() => setHover(value)}
            onFocus={() => setHover(value)}
            onBlur={() => setHover(null)}
            onClick={() => {
              setDraft(value);
              setSaved(false);
            }}
            className={cn(
              'rounded-sm px-1 text-lg leading-none transition-colors',
              value <= shown ? 'text-ink' : 'text-stone-300 hover:text-stone-400',
            )}
          >
            <span aria-hidden>★</span>
          </button>
        ))}
        <span className="ml-2 text-sm tabular-nums text-stone-500">
          {draft !== null ? `${draft} / 5` : '—'}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p role="status" className="text-sm text-stone-500">
          Zapisano ocenę.
        </p>
      ) : null}

      <div>
        <button
          type="button"
          className={buttonClasses('primary', 'sm')}
          onClick={submit}
          disabled={pending || draft === null || unchanged}
          aria-busy={pending}
        >
          {pending ? '…' : alreadyRated ? 'Zaktualizuj ocenę' : 'Zapisz ocenę'}
        </button>
      </div>

      <p className="text-xs text-stone-400">
        Oceniać mogą tylko osoby, które wykonały tę recepturę w Gellatti.
      </p>
    </div>
  );
}
