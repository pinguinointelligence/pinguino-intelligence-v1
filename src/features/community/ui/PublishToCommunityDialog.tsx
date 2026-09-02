import { useMemo, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { DialogShell } from '@/components/ui/DialogShell';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import { slugifyTitle } from '@/features/community/domain/creatorHandle';
import {
  PUBLICATION_IMAGES,
  suggestPublicationImage,
} from '@/features/community/domain/publicationImages';
import { publicationPath } from '@/features/community/domain/shareUrls';
import { publishRecipe } from '@/services/community';
import { CreatorProfileForm } from './CreatorProfileForm';
import { customerErrorMessage } from '@/copy/customerError';

/**
 * „Opublikuj w Community" (§7).
 *
 * Publication is explicit and confirmed: the creator names the recipe, sees
 * the exact public address it will get, and sees WHICH immutable version is
 * being published — because publishing V1 and later editing to V2 must feel
 * like two separate acts, not one silent one (§5).
 *
 * The dialog never asks for anything that could weaken the paywall. There is
 * no „show grams publicly" switch, because the demo-safe projection is built
 * server-side and is not a user preference (§9).
 */
export function PublishToCommunityDialog({
  recipeId,
  versionNumber,
  defaultTitle,
  hasCreatorProfile,
  completionContext = false,
  onPublished,
  onClose,
}: {
  recipeId: string;
  versionNumber: number;
  defaultTitle: string;
  hasCreatorProfile: boolean;
  completionContext?: boolean;
  onPublished?: (result: { publication_id: string; handle: string; slug: string }) => void;
  onClose: () => void;
}) {
  const copy = communityCopy;
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  /* A publication always carries an image — a Community card with an empty
     frame reads as an unfinished product, and the ranking surfaces are built
     around a picture. The picker opens on a sensible suggestion instead of a
     blank grid, and publishing without one is not possible. */
  const [imageUrl, setImageUrl] = useState(() => suggestPublicationImage(defaultTitle).url);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creatorReady, setCreatorReady] = useState(hasCreatorProfile);
  const [creatorStep, setCreatorStep] = useState<'invite' | 'form'>('invite');

  const slug = useMemo(() => slugifyTitle(title), [title]);

  const submit = async () => {
    if (!slug) {
      setError(copy.creator.handleInvalid);
      return;
    }
    if (!imageUrl) {
      setError(copy.publish.imageRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await publishRecipe({
        recipeId,
        versionNumber,
        slug,
        title: title.trim(),
        description: description.trim() || null,
        imageUrl,
        category: category.trim() || null,
      });
      onPublished?.(result);
      onClose();
    } catch (cause) {
      setError(customerErrorMessage(cause, 'community'));
    } finally {
      setPending(false);
    }
  };

  const dialogTitle = creatorReady
    ? completionContext
      ? copy.publish.completionTitle
      : copy.publish.dialogTitle
    : copy.publish.creatorInviteTitle;

  return (
    <DialogShell
      label={dialogTitle}
      testId="publish-community-dialog"
      placement="responsive"
      panelClassName="p-0 sm:p-0"
      onClose={onClose}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>{copy.nav.community}</SectionLabel>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-ink">
              {dialogTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="pro-focus-ring grid size-10 shrink-0 place-items-center rounded-full text-xl text-stone-500 hover:bg-stone-100 hover:text-ink"
          >
            ×
          </button>
        </div>

        {!creatorReady && creatorStep === 'invite' ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-stone-600">
              {copy.publish.creatorInviteBody}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClasses('primary')}
                onClick={() => setCreatorStep('form')}
              >
                {copy.publish.createCreatorProfile}
              </button>
              <button type="button" className={buttonClasses('ghost')} onClick={onClose}>
                Nie teraz
              </button>
            </div>
          </div>
        ) : !creatorReady ? (
          <div className="mt-5" data-testid="community-creator-continuation">
            <CreatorProfileForm onSaved={() => setCreatorReady(true)} />
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-stone-600">
              {completionContext ? copy.publish.completionBody : copy.publish.dialogBody}
            </p>
            <Field label={copy.publish.titleLabel}>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>
            <Field label={copy.publish.descriptionLabel}>
              <textarea
                value={description}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>
            <Field label={copy.publish.imageLabel}>
              <div className="flex flex-col gap-3">
                <img
                  src={imageUrl}
                  alt={
                    PUBLICATION_IMAGES.find((image) => image.url === imageUrl)?.label ?? title
                  }
                  className="h-36 w-full rounded-sm border border-ink/12 object-cover"
                />
                <div
                  role="radiogroup"
                  aria-label={copy.publish.imageLabel}
                  className="grid max-h-40 grid-cols-5 gap-2 overflow-y-auto pr-1"
                  data-testid="publication-image-picker"
                >
                  {PUBLICATION_IMAGES.map((image) => (
                    <button
                      key={image.url}
                      type="button"
                      role="radio"
                      aria-checked={image.url === imageUrl}
                      aria-label={image.label}
                      onClick={() => setImageUrl(image.url)}
                      className={
                        image.url === imageUrl
                          ? 'overflow-hidden rounded-sm border-2 border-[#ef8708]'
                          : 'overflow-hidden rounded-sm border border-ink/12 opacity-80 hover:opacity-100'
                      }
                    >
                      <img src={image.url} alt="" className="h-12 w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label={copy.publish.categoryLabel}>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>
            <Field label={copy.publish.slugLabel}>
              <p className="font-mono text-xs text-stone-500">
                {slug ? publicationPath('…', slug) : '—'}
              </p>
            </Field>

            <p className="text-xs leading-relaxed text-stone-500">
              {copy.publish.privacyNote} {copy.share.versionNote(versionNumber)}
            </p>

            {error ? (
              <p role="alert" className="text-sm text-ink">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                className={buttonClasses('primary')}
                onClick={submit}
                disabled={pending || !slug || !imageUrl}
              >
                {pending ? '…' : copy.actions.publishToCommunity}
              </button>
              <button type="button" className={buttonClasses('ghost')} onClick={onClose}>
                Anuluj
              </button>
            </div>
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs tracking-label uppercase text-stone-400">{label}</span>
      {children}
    </label>
  );
}
