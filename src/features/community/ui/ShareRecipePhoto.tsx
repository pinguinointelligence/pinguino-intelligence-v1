import { useEffect, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import { resolveRecipeImage } from '@/features/community/domain/recipeImageAuthority';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { attachSharePhoto, detachSharePhoto, readSharePhoto } from '@/services/community';

type Status = 'idle' | 'uploading' | 'failed' | 'removing' | 'removeFailed';

/**
 * „Zdjęcie dla odbiorcy" inside „Udostępnij recepturę" (owner decision 2026-09-17).
 *
 * Optional, never required: the link works the moment it exists. The picture
 * shown here is what the RECIPIENT would see right now — the sharer's own
 * photograph only once it is actually attached, otherwise the branded card of
 * the shared VERSION's profile (as the server reports it). An upload in
 * progress or a failed upload is therefore never shown as the photograph.
 *
 * The attached photograph is tracked on its own, apart from the attempt in
 * progress: a replacement that fails, or a removal that fails, leaves it
 * attached on the server — so it stays in the preview and the message says the
 * recipient still sees it (H-128-1, 2026-09-17).
 *
 * If the options for the link cannot be read, the section says so and offers a
 * retry — a failure is never shown as „no photo". The link itself works either way.
 */
export function ShareRecipePhoto({ shareLinkId }: { shareLinkId: string }) {
  const copy = communityCopy.share;
  const [attempt, setAttempt] = useState(0);
  const support = useAsyncResource(`${shareLinkId}:${attempt}`, () => readSharePhoto(shareLinkId));
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  /** The photograph attached to the link — what the recipient sees now. */
  const [attached, setAttached] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (attached) URL.revokeObjectURL(attached);
    },
    [attached],
  );

  if (support.status === 'loading') return null;
  if (support.status === 'failed' || !support.data.ok) {
    return (
      <section
        data-testid="share-photo"
        className="flex flex-col gap-3 border-t border-ink/10 pt-4"
      >
        <span className="text-xs tracking-label uppercase text-stone-400">{copy.photoTitle}</span>
        <p role="alert" className="text-sm leading-relaxed text-ink">
          {copy.photoOptionsFailed}
        </p>
        <div>
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {copy.photoRetry}
          </button>
        </div>
      </section>
    );
  }
  const category = support.data.category ?? null;
  const busy = status === 'uploading' || status === 'removing';

  const attach = async (chosen: File) => {
    setFile(chosen);
    setStatus('uploading');
    try {
      await attachSharePhoto(shareLinkId, chosen);
      setAttached(URL.createObjectURL(chosen));
      setFile(null);
      setStatus('idle');
    } catch {
      // A failed replacement leaves the previous photograph attached.
      setStatus('failed');
    }
  };

  const remove = async () => {
    setStatus('removing');
    try {
      await detachSharePhoto(shareLinkId);
      setAttached(null);
      setFile(null);
      setStatus('idle');
    } catch {
      setStatus('removeFailed');
    }
  };

  const decision = resolveRecipeImage({
    context: 'customer_share',
    userImageUrl: attached,
    profile: category,
  });

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (chosen) void attach(chosen);
  };

  const alert =
    status === 'failed'
      ? attached
        ? copy.photoReplaceFailed
        : copy.photoFailed
      : status === 'removeFailed'
        ? copy.photoRemoveFailed
        : null;

  return (
    <section data-testid="share-photo" className="flex flex-col gap-3 border-t border-ink/10 pt-4">
      <span className="text-xs tracking-label uppercase text-stone-400">{copy.photoTitle}</span>
      <div className="flex items-start gap-4">
        <img
          src={decision.url}
          alt=""
          aria-hidden
          data-testid="share-photo-preview"
          data-image-origin={decision.origin}
          className="aspect-square w-24 shrink-0 rounded-xl bg-shell-raised object-cover"
        />
        {alert ? (
          <p role="alert" className="text-sm leading-relaxed text-ink">
            {alert}
          </p>
        ) : (
          <p aria-live="polite" className="text-sm leading-relaxed text-stone-500">
            {status === 'uploading'
              ? copy.photoUploading
              : attached
                ? copy.photoAttached
                : copy.photoFallbackNote}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label
          className={cn(buttonClasses('ghost', 'sm'), busy && 'pointer-events-none opacity-50')}
        >
          {copy.photoTake}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            data-testid="share-photo-camera"
            disabled={busy}
            onChange={pick}
          />
        </label>
        <label
          className={cn(buttonClasses('ghost', 'sm'), busy && 'pointer-events-none opacity-50')}
        >
          {copy.photoChoose}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            data-testid="share-photo-gallery"
            disabled={busy}
            onChange={pick}
          />
        </label>
        {status === 'failed' && file ? (
          <>
            <button
              type="button"
              className={buttonClasses('ghost', 'sm')}
              onClick={() => void attach(file)}
            >
              {copy.photoRetry}
            </button>
            <button
              type="button"
              className={buttonClasses('ghost', 'sm')}
              onClick={() => {
                setFile(null);
                setStatus('idle');
              }}
            >
              {attached ? copy.photoKeepCurrent : copy.photoSkip}
            </button>
          </>
        ) : null}
        {status === 'removeFailed' ? (
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            onClick={() => void remove()}
          >
            {copy.photoRetry}
          </button>
        ) : attached ? (
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            disabled={busy}
            onClick={() => void remove()}
          >
            {copy.photoRemove}
          </button>
        ) : null}
      </div>
    </section>
  );
}
