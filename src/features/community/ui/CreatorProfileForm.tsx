import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import { suggestHandle, validateHandle } from '@/features/community/domain/creatorHandle';
import { claimCreatorProfile } from '@/services/community';
import { customerErrorMessage } from '@/copy/customerError';

/**
 * Creating or editing the optional Creator profile (§6).
 *
 * The handle is validated locally so the refusal is instant and specific
 * („zarezerwowana" is a different answer from „zajęta"), and validated again
 * in the database because the client is not an authority. Reserved words live
 * in one list that both sides share.
 *
 * There is no verification, ranking or moderation control here: those are not
 * the creator's to set, and the write RPC cannot touch them (§52, §57).
 */
export function CreatorProfileForm({
  initial,
  onSaved,
}: {
  initial?: {
    handle?: string;
    displayName?: string;
    bio?: string;
    country?: string;
    city?: string;
    isPublic?: boolean;
  };
  onSaved?: (result: { handle: string }) => void;
}) {
  const copy = communityCopy;
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const validation = validateHandle(handle);
  const localMessage = handle.trim() === '' ? null : localHandleMessage(validation);

  const submit = async () => {
    if (!validation.ok) {
      setError(localHandleMessage(validation) ?? copy.creator.handleInvalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await claimCreatorProfile({
        handle: validation.handle,
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
        isPublic,
      });
      setSaved(true);
      onSaved?.({ handle: result.handle });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // The database refuses with stable codes; map them to the same typed
      // messages the local check uses, so one failure never reads two ways.
      setError(
        message.includes('handle_taken')
          ? copy.creator.handleTaken
          : message.includes('handle_reserved')
            ? copy.creator.handleReserved
            : message.includes('handle_invalid')
              ? copy.creator.handleInvalid
              : customerErrorMessage(cause, 'community'),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="flex flex-col gap-5">
      <SectionLabel>{copy.creator.claimTitle}</SectionLabel>

      <label className="flex flex-col gap-2">
        <span className="text-xs tracking-label uppercase text-stone-400">
          {copy.creator.displayNameLabel}
        </span>
        <input
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            if (handle.trim() === '') {
              const suggested = suggestHandle(event.target.value);
              if (suggested) setHandle(suggested);
            }
          }}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs tracking-label uppercase text-stone-400">
          {copy.creator.handleLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-400">@</span>
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            aria-invalid={localMessage !== null}
            aria-describedby={localMessage ? 'creator-handle-error' : undefined}
            className="flex-1 rounded-sm border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink"
          />
        </div>
        {localMessage ? (
          <span id="creator-handle-error" className="text-sm text-ink">
            {localMessage}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs tracking-label uppercase text-stone-400">
          {copy.creator.bioLabel}
        </span>
        <textarea
          value={bio}
          rows={3}
          onChange={(event) => setBio(event.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs tracking-label uppercase text-stone-400">
            {copy.creator.countryLabel}
          </span>
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs tracking-label uppercase text-stone-400">
            {copy.creator.cityLabel}
          </span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm text-ink">{copy.creator.makePublic}</span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-stone-500">Zapisano.</p> : null}

      <div>
        <button
          type="button"
          className={buttonClasses('primary')}
          onClick={submit}
          disabled={pending || !validation.ok || displayName.trim() === ''}
        >
          {pending ? '…' : 'Zapisz profil'}
        </button>
      </div>
    </Card>
  );
}

function localHandleMessage(validation: ReturnType<typeof validateHandle>): string | null {
  if (validation.ok) return null;
  const copy = communityCopy.creator;
  switch (validation.reason) {
    case 'reserved':
      return copy.handleReserved;
    case 'too_short':
    case 'empty':
      return copy.handleTooShort;
    case 'too_long':
      return copy.handleTooLong;
    default:
      return copy.handleInvalid;
  }
}
