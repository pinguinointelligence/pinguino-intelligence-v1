import { useEffect, useMemo, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import { slugifyTitle } from '@/features/community/domain/creatorHandle';
import { publicationPath } from '@/features/community/domain/shareUrls';
import { publishRecipe } from '@/services/community';

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
  onPublished,
  onClose,
}: {
  recipeId: string;
  versionNumber: number;
  defaultTitle: string;
  hasCreatorProfile: boolean;
  onPublished?: (result: { publication_id: string; handle: string; slug: string }) => void;
  onClose: () => void;
}) {
  const copy = communityCopy;
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  const slug = useMemo(() => slugifyTitle(title), [title]);

  const submit = async () => {
    if (!slug) {
      setError(copy.creator.handleInvalid);
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
        category: category.trim() || null,
      });
      onPublished?.(result);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-ink/10 bg-paper p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>{copy.nav.community}</SectionLabel>
            <h2 id="publish-dialog-title" className="mt-2 text-xl font-medium text-ink">
              {copy.publish.dialogTitle}
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

        <p className="mt-4 text-sm leading-relaxed text-stone-500">{copy.publish.dialogBody}</p>
        <p className="mt-2 text-sm text-stone-500">{copy.share.versionNote(versionNumber)}</p>

        {!hasCreatorProfile ? (
          <p role="alert" className="mt-4 text-sm text-ink">
            {copy.publish.needsCreatorProfile}
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
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

            {error ? (
              <p role="alert" className="text-sm text-ink">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3">
              <button
                type="button"
                className={buttonClasses('primary')}
                onClick={submit}
                disabled={pending || !slug}
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
    </div>
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
