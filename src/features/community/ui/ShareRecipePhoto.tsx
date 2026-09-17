import { useEffect, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import { resolveRecipeImage } from '@/features/community/domain/recipeImageAuthority';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { attachSharePhoto, detachSharePhoto, readSharePhoto } from '@/services/community';

type Status = 'idle' | 'uploading' | 'attached' | 'failed' | 'removing';

/**
 * „Zdjęcie dla odbiorcy" inside „Udostępnij recepturę" (owner decision 2026-09-17).
 *
 * Optional, never required: the link works the moment it exists. The picture
 * shown here is what the RECIPIENT would see right now — the sharer's own
 * photograph only once it is actually attached, otherwise the branded card of
 * the shared VERSION's profile (as the server reports it). An upload in
 * progress or a failed upload is therefore never shown as the photograph.
 *
 * The section renders nothing when the backend does not offer share photos
 * (its migration is not applied) or cannot say, so the dialog is then exactly
 * the link dialog it was before.
 */
export function ShareRecipePhoto({ shareLinkId }: { shareLinkId: string }) {
  const copy = communityCopy.share;
  const support = useAsyncResource(shareLinkId, () => readSharePhoto(shareLinkId));
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  if (support.status !== 'ready' || support.data === null || !support.data.ok) return null;
  const category = support.data.category ?? null;
  const busy = status === 'uploading' || status === 'removing';

  const attach = async (chosen: File) => {
    setFile(chosen);
    setStatus('uploading');
    try {
      await attachSharePhoto(shareLinkId, chosen);
      setPreview(URL.createObjectURL(chosen));
      setStatus('attached');
    } catch {
      setStatus('failed');
    }
  };

  const remove = async () => {
    setStatus('removing');
    try {
      await detachSharePhoto(shareLinkId);
      setPreview(null);
      setFile(null);
      setStatus('idle');
    } catch {
      setStatus('attached');
    }
  };

  const decision = resolveRecipeImage({
    context: 'customer_share',
    userImageUrl: status === 'attached' ? preview : null,
    profile: category,
  });

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (chosen) void attach(chosen);
  };

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
        {status === 'failed' ? (
          <p role="alert" className="text-sm leading-relaxed text-ink">
            {copy.photoFailed}
          </p>
        ) : (
          <p aria-live="polite" className="text-sm leading-relaxed text-stone-500">
            {status === 'uploading'
              ? copy.photoUploading
              : status === 'attached' || status === 'removing'
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
              {copy.photoSkip}
            </button>
          </>
        ) : null}
        {status === 'attached' || status === 'removing' ? (
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
