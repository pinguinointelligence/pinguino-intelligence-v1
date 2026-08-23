import { useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import { absoluteUrl, canWebShare, sharePath } from '@/features/community/domain/shareUrls';
import { cn } from '@/lib/cn';
import { createShareLink, type CreatedShareLink } from '@/services/community';

/**
 * „Udostępnij recepturę" (§10, §45).
 *
 * Three things this dialog is careful about:
 *
 *  1. IT DOES NOT PUBLISH (§11). The copy says so explicitly, because „share"
 *     means „post publicly" in most products and the user must not be
 *     surprised into making their work public.
 *  2. IT NAMES THE VERSION (§5). The link is bound to one immutable snapshot,
 *     and the user is told which — so editing the recipe tomorrow does not
 *     feel like it silently changed what they already sent.
 *  3. IT SHOWS THE TOKEN ONCE. The database keeps only a hash, so the link
 *     cannot be recovered later. The UI never pretends otherwise.
 */
export function ShareRecipeDialog({
  recipeId,
  versionNumber,
  publicationId = null,
  onClose,
}: {
  recipeId: string;
  versionNumber: number;
  publicationId?: string | null;
  onClose: () => void;
}) {
  const copy = communityCopy;
  const [link, setLink] = useState<CreatedShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = link ? absoluteUrl(origin, sharePath(link.token)) : null;

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      setLink(await createShareLink(recipeId, versionNumber, publicationId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  const copyLink = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const webShare = async () => {
    if (!url) return;
    await navigator.share({ title: copy.share.dialogTitle, url });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div className="w-full max-w-lg rounded-md border border-ink/10 bg-paper p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>{copy.roles.creator}</SectionLabel>
            <h2 id="share-dialog-title" className="mt-2 text-xl font-medium text-ink">
              {copy.share.dialogTitle}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="rounded-sm px-2 py-1 text-stone-400 hover:text-ink"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-stone-500">{copy.share.dialogBody}</p>
        <p className="mt-2 text-sm text-stone-500">{copy.share.versionNote(versionNumber)}</p>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-ink">
            {error}
          </p>
        ) : null}

        {!link ? (
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className={buttonClasses('primary')}
              onClick={create}
              disabled={pending}
            >
              {pending ? '…' : copy.actions.shareRecipe}
            </button>
            <button type="button" className={buttonClasses('ghost')} onClick={onClose}>
              Anuluj
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs tracking-label uppercase text-stone-400">Link</span>
              <input
                readOnly
                value={url ?? ''}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-sm border border-ink/15 bg-shell-raised px-3 py-2 font-mono text-xs text-ink"
              />
            </label>

            <p className="text-xs text-stone-400">{copy.share.unlistedNote}</p>
            {link.partner_attribution ? (
              <p className={cn('text-xs leading-relaxed text-stone-500')}>
                {copy.share.partnerNote}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="button" className={buttonClasses('primary')} onClick={copyLink}>
                {copied ? copy.actions.linkCopied : copy.actions.copyLink}
              </button>
              {canWebShare(typeof navigator === 'undefined' ? undefined : navigator) ? (
                <button type="button" className={buttonClasses('ghost')} onClick={webShare}>
                  {copy.actions.share}
                </button>
              ) : null}
              <button type="button" className={buttonClasses('ghost')} onClick={onClose}>
                Gotowe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
