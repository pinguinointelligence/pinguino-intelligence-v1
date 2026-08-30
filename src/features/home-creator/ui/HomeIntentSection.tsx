/**
 * §17–§21 — the first HOME screen.
 *
 * One elegant input area serving text, voice and scan (§17), producing removable chips
 * (§18). Deliberately absent here: any Score, any live Recalculate, any recipe edit —
 * before the first recipe exists the user is only describing an idea (§18), and this
 * component has no access to a recipe with which to break that rule.
 *
 * No preset flavour tiles (§17): the field is open, because the owner rule is that any
 * idea may be described, and a tile grid quietly teaches the opposite.
 */
import { useCallback, useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { parseIntent } from '../homeIntentParsing';
import { useHomeDraftStore, type IntentChip } from '../homeDraftStore';
import { useVoiceIntent } from '../useVoiceIntent';
import { HomeChip } from './HomeChip';
import { HomeIdentityChoice } from './HomeIdentityChoice';
import { HomeSection } from './HomeSection';

const chipId = (): string =>
  `chip_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export function HomeIntentSection({
  onSubmit,
  onScan,
  onChipClick,
  onChooseIdentity,
  resolving = false,
}: {
  onSubmit: () => void;
  onScan: () => void;
  onChipClick?: (chip: IntentChip) => void;
  /** §23: the user picked one of the offered real products. */
  onChooseIdentity?: (chip: IntentChip, candidate: { id: string; name: string }) => void;
  /** §18: identity resolution runs only after `Create my recipe`. */
  resolving?: boolean;
}) {
  const [value, setValue] = useState('');
  const fieldId = useId();
  const chips = useHomeDraftStore((state) => state.chips);
  const addChip = useHomeDraftStore((state) => state.addChip);
  const removeChip = useHomeDraftStore((state) => state.removeChip);
  const setProfile = useHomeDraftStore((state) => state.setProfile);
  const storedProfile = useHomeDraftStore((state) => state.profile);

  /** One ingestion path for all three inputs (§19). */
  const ingest = useCallback(
    (text: string, source: IntentChip['source']) => {
      const parsed = parseIntent(text);
      // §31: a stated profile is remembered so it is never asked again. An earlier
      // explicit profile wins — a later sentence should not silently retype it.
      if (parsed.profile && storedProfile === null) setProfile(parsed.profile);
      for (const term of parsed.terms) {
        addChip({
          id: chipId(),
          label: term.raw,
          concept: term.concept,
          role: term.role,
          source,
          productId: null,
          productName: null,
          ambiguous: false,
        });
      }
    },
    [addChip, setProfile, storedProfile],
  );

  const voice = useVoiceIntent({ onTranscript: (transcript) => ingest(transcript, 'voice') });

  const commitTyped = () => {
    const text = value.trim();
    if (!text) return;
    ingest(text, 'text');
    setValue('');
  };

  return (
    <HomeSection id="intent" data-testid="home-section-intent">
      <h1
        className="text-[26px] leading-[1.18] font-semibold tracking-[-0.02em] sm:text-[32px]"
        style={{ color: 'var(--g-ink)' }}
      >
        {homeCreatorCopy.intent.headline}
      </h1>
      <p
        className="mt-3 text-[17px] leading-snug sm:text-[19px]"
        style={{ color: 'var(--g-text-secondary)' }}
      >
        {homeCreatorCopy.intent.question}
      </p>

      {/* One input area — typing, speaking and scanning all land in the same intent. */}
      <div
        className="mt-7 rounded-[14px] border p-2"
        style={{ borderColor: 'var(--g-line)', background: '#ffffff' }}
      >
        <label htmlFor={fieldId} className="sr-only">
          {homeCreatorCopy.intent.inputLabel}
        </label>
        <textarea
          id={fieldId}
          data-testid="home-intent-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitTyped();
            }
          }}
          onBlur={commitTyped}
          rows={2}
          placeholder={homeCreatorCopy.intent.placeholder}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug outline-none placeholder:opacity-60"
          style={{ color: 'var(--g-ink)' }}
        />
        <div className="flex items-center gap-2 px-1 pb-1">
          <button
            type="button"
            onClick={voice.toggle}
            disabled={voice.state === 'unavailable'}
            aria-pressed={voice.state === 'listening'}
            data-testid="home-intent-voice"
            data-state={voice.state}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[13px] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
              voice.state === 'unavailable' && 'cursor-not-allowed opacity-45',
            )}
            style={
              voice.state === 'listening'
                ? { background: 'var(--g-ink)', color: '#fff', borderColor: 'var(--g-ink)' }
                : { borderColor: 'var(--g-line)', color: 'var(--g-ink)' }
            }
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <rect
                x="5.5"
                y="1.5"
                width="5"
                height="8"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {voice.state === 'listening'
              ? homeCreatorCopy.intent.listening
              : homeCreatorCopy.intent.addByVoice}
          </button>

          <button
            type="button"
            onClick={onScan}
            data-testid="home-intent-scan"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M1.5 5V2.5A1 1 0 0 1 2.5 1.5H5M11 1.5h2.5a1 1 0 0 1 1 1V5M14.5 11v2.5a1 1 0 0 1-1 1H11M5 14.5H2.5a1 1 0 0 1-1-1V11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {homeCreatorCopy.intent.addByScan}
          </button>
        </div>
      </div>

      {voice.state === 'unavailable' ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--g-text-muted)' }}>
          {homeCreatorCopy.intent.voiceUnavailable}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-6" data-testid="home-intent-chips">
          <p
            className="text-[11px] font-bold tracking-[0.12em] uppercase"
            style={{ color: 'var(--g-text-muted)' }}
          >
            {homeCreatorCopy.intent.chipsLabel}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <HomeChip
                key={chip.id}
                chip={chip}
                onRemove={() => removeChip(chip.id)}
                onClick={onChipClick ? () => onChipClick(chip) : undefined}
              />
            ))}
          </div>
          {/* §23: only where the catalogue genuinely offers several real products. */}
          {onChooseIdentity
            ? chips
                .filter((chip) => chip.ambiguous)
                .map((chip) => (
                  <HomeIdentityChoice
                    key={`choice-${chip.id}`}
                    chip={chip}
                    onChoose={(candidate) => onChooseIdentity(chip, candidate)}
                  />
                ))
            : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          commitTyped();
          onSubmit();
        }}
        disabled={chips.length === 0 && value.trim() === ''}
        data-testid="home-intent-cta"
        className={cn(
          'mt-8 inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold transition-opacity',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-not-allowed disabled:opacity-35',
        )}
        style={{ background: 'var(--g-ink)', color: '#ffffff' }}
      >
        {homeCreatorCopy.intent.cta}
      </button>
      {resolving ? (
        <p
          className="mt-3 text-center text-[12px]"
          data-testid="home-intent-resolving"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {homeCreatorCopy.intent.resolving}
        </p>
      ) : chips.length === 0 ? (
        <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--g-text-muted)' }}>
          {homeCreatorCopy.intent.emptyHint}
        </p>
      ) : null}
    </HomeSection>
  );
}
