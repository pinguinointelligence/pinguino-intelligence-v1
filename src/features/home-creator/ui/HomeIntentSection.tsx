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
import { useCallback, useId, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { hasBaseIdea } from '../homeComposerGate';
import { ingestIdeaText } from '../homeIdeaIngest';
import { useHomeDraftStore, type IntentChip } from '../homeDraftStore';
import { useVoiceIntent } from '../useVoiceIntent';
import { HomeChip } from './HomeChip';
import { HomeIdentityChoice } from './HomeIdentityChoice';
import { HomeSection } from './HomeSection';
import { HomeVisionCapture } from './HomeVisionCapture';

/**
 * DESIGN V3.0 VI — „Rozpocznij recepturę” stands at the bottom of the start screen, outside
 * this section, so it reaches the composer through this handle: pressing it first turns the
 * text still in the field into chips — the same door Enter uses — exactly as the inline
 * CTA it replaces did.
 */
export interface HomeIntentSectionHandle {
  commitTyped: () => void;
}

/**
 * §27 — one control shape for the four ways into the composer.
 *
 * They live INSIDE the field, so they are icon-sized and quiet; the label is
 * carried by `aria-label` for assistive technology and by `title` as the
 * desktop tooltip the owner asked for. A 44 px hit area is kept even though the
 * glyph is 17 px, because these are thumb targets on the phone.
 *
 * DESIGN V3.0 IV-A/VI: HOME's controls are thin light OUTLINES without fills — a
 * 1 px #e4e0d9 ring drawn inside the 44 px circle. The send arrow is the same quiet
 * ring; it only darkens once there is something to add.
 */
function ComposerIconButton({
  testId,
  label,
  tooltip,
  onClick,
  children,
  disabled = false,
  pressed,
  dataState,
  variant = 'quiet',
}: {
  testId: string;
  label: string;
  tooltip: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  dataState?: string;
  variant?: 'quiet' | 'send';
}) {
  const active = pressed === true;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={tooltip}
      data-testid={testId}
      data-state={dataState}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full transition-colors',
        disabled && 'cursor-not-allowed',
        // The send arrow says „nothing to add” with its own quieter ring; any other
        // unavailable control (voice in a browser without speech) fades as before.
        disabled && variant !== 'send' && 'opacity-35',
        !disabled && !active && 'hover:bg-[var(--g-ivory-deep)]',
      )}
      style={
        active
          ? { background: 'var(--g-ink)', color: '#ffffff' }
          : variant === 'send'
            ? disabled
              ? { color: '#c9c4bc', boxShadow: 'inset 0 0 0 1px #efebe4' }
              : { color: '#3b3833', boxShadow: 'inset 0 0 0 1px #e4e0d9' }
            : { color: 'var(--g-text-secondary)', boxShadow: 'inset 0 0 0 1px #e4e0d9' }
      }
    >
      {children}
    </button>
  );
}

export function HomeIntentSection({
  ref,
  onScan,
  onChipClick,
  onChooseIdentity,
  resolving = false,
  onDraftTextChange,
}: {
  /** The start screen's „Rozpocznij recepturę” commits the typed idea through it. */
  ref?: Ref<HomeIntentSectionHandle>;
  onScan: () => void;
  onChipClick?: (chip: IntentChip) => void;
  /** §23: the user picked one of the offered real products. */
  onChooseIdentity?: (chip: IntentChip, candidate: { id: string; name: string }) => void;
  /** True while `Create my recipe` finishes resolution and matching. */
  resolving?: boolean;
  /** Whether an uncommitted idea is still in the field (suggestions wait for it). */
  onDraftTextChange?: (hasText: boolean) => void;
}) {
  const [value, setValue] = useState('');
  /** One place that changes the field, so the page learns about a draft without an effect. */
  const changeValue = (next: string) => {
    setValue(next);
    onDraftTextChange?.(next.trim().length > 0);
  };
  /* §31: the fruit camera is the composer's own, so HOME's page does not have to
     learn a fourth entry point — the recognised fruit lands through exactly the
     ingestion path voice already uses. */
  const [visionOpen, setVisionOpen] = useState(false);
  const fieldId = useId();
  const questionId = useId();
  const chips = useHomeDraftStore((state) => state.chips);
  const removeChip = useHomeDraftStore((state) => state.removeChip);
  /** OWNER FROZEN §4: one idea is enough to turn the prompt into „Jeszcze coś?". */
  const hasIdea = chips.length > 0;
  /* DESIGN V3.0 VI (replaces §28's hidden CTA): while there is no BASE idea, the empty
     field says what is missing — „Dodaj przynajmniej jeden składnik albo smak.” — and
     the start screen's „Rozpocznij recepturę” stays visibly inactive. */
  const showEmptyHint = !hasBaseIdea(chips);

  /** One ingestion path for all three inputs (§19). */
  const ingest = useCallback(
    (text: string, source: IntentChip['source']) => ingestIdeaText(text, source),
    [],
  );

  const voice = useVoiceIntent({ onTranscript: (transcript) => ingest(transcript, 'voice') });

  const commitTyped = () => {
    const text = value.trim();
    if (!text) return;
    ingest(text, 'text');
    changeValue('');
  };
  useImperativeHandle(ref, () => ({ commitTyped }));

  return (
    <HomeSection id="intent" data-testid="home-section-intent" bare>
      <h1
        className="text-[26px] leading-[1.18] font-semibold tracking-[-0.02em] sm:text-[32px]"
        style={{ color: 'var(--g-ink)' }}
      >
        {homeCreatorCopy.intent.headline}
      </h1>
      {/* BRIEF 6.2 / DESIGN V3.0: the question is the invitation that leads into the field —
          a visible 21 px heading, not a small grey line under the hero. */}
      <h2
        id={questionId}
        data-testid="home-intent-question"
        className="mt-[26px] text-[21px] leading-[1.25] font-bold tracking-[-0.01em]"
        style={{ color: 'var(--g-ink)' }}
      >
        {homeCreatorCopy.intent.question}
      </h2>

      {/* ── §27 THE COMPOSER ────────────────────────────────────────────────
          ONE central field, in the shape a modern chat composer has: the four
          ways in live INSIDE it — voice, barcode, AI fruit recognition and the
          send arrow — instead of standing beside it as separate buttons. The
          large `Powiedz` / `Zeskanuj` pills are gone (§27, §V): they competed
          with the field for the first decision, and the whole point of this
          screen is that there is only one place to start.

          §41: the wrapper is the focus surface. The field inside must never
          draw a second box — see `src/styles/home-composer.css` for the shell
          focus authority that used to paint one. */}
      {/* The resting border and the focus border BOTH live in the stylesheet.
          They used to be split — resting colour inline, focus colour in CSS —
          and an inline style beats any rule without `!important`, so the focus
          treatment was written, shipped and never painted. */}
      {/* DESIGN V3.0 IV-A: a white field with a light 1 px line (`home-composer.css`). */}
      <div
        className="home-composer mt-2.5 rounded-[22px] border pt-0.5 pr-2.5 pb-2.5 pl-1"
        data-testid="home-composer"
      >
        <label htmlFor={fieldId} className="sr-only">
          {homeCreatorCopy.intent.inputLabel}
        </label>
        {/* OWNER FROZEN §4: the composer never moves when the first idea lands. The dot
            keeps its slot in both states (invisible, not unmounted) and its own box
            repeats the field's type and vertical padding, so it centres on the first
            line without a hand-picked offset. Dot 6px + field 6px = the 12px text
            origin the empty screen already had. */}
        <div className="flex items-start">
          <span className="flex items-center py-2.5 text-[16px] leading-snug">
            <span
              aria-hidden
              data-testid="home-intent-dot"
              className={cn('size-1.5 rounded-full', !hasIdea && 'invisible')}
              style={{ background: 'var(--g-orange)' }}
            />
            {/* A box containing only a 6 px dot is 6 px tall, so it centred 8 px ABOVE
                the prompt and read as a floating mark (owner, served). The zero-width
                space gives this box a real text line of the field's own size and
                leading, so the dot now centres on the prompt's first line and the two
                read as one sentence. */}
            <span aria-hidden>{'​'}</span>
          </span>
          <textarea
            id={fieldId}
            data-testid="home-intent-input"
            value={value}
            onChange={(event) => changeValue(event.target.value)}
            onKeyDown={(event) => {
              // `key` is the normal identity, but some keyboards and input drivers send
              // the commit key with an empty `key` name; `code` still identifies it.
              // While an IME is composing, Enter confirms the composition and must not
              // commit the idea underneath it.
              const enter =
                event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
              if (enter && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                commitTyped();
              }
            }}
            onBlur={commitTyped}
            aria-describedby={questionId}
            rows={2}
            placeholder={
              hasIdea ? homeCreatorCopy.intent.anythingElse : homeCreatorCopy.intent.placeholder
            }
            /* `home-composer-field` is load-bearing, not decoration: it is the
               hook the §41 stylesheet uses to keep the shell's graphite focus
               outline off this field. */
            className="home-composer-field flex-1 resize-none border-0 bg-transparent py-2.5 pr-3 pl-1.5 text-[16px] leading-snug outline-none placeholder:opacity-60"
            style={{ color: 'var(--g-ink)' }}
          />
        </div>

        {/* The controls belong to the field, so they sit on its own baseline row
            — small, quiet, and always in the same place. */}
        <div className="mt-1.5 flex items-center gap-1.5 pl-3">
          <ComposerIconButton
            testId="home-intent-voice"
            label={
              voice.state === 'listening'
                ? homeCreatorCopy.intent.listening
                : homeCreatorCopy.intent.addByVoice
            }
            tooltip={homeCreatorCopy.intent.voiceTooltip}
            onClick={voice.toggle}
            disabled={voice.state === 'unavailable'}
            pressed={voice.state === 'listening'}
            dataState={voice.state}
          >
            <svg width="19" height="19" viewBox="0 0 16 16" aria-hidden="true" fill="none">
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
          </ComposerIconButton>

          <ComposerIconButton
            testId="home-intent-scan"
            label={homeCreatorCopy.intent.addByScan}
            tooltip={homeCreatorCopy.intent.scanTooltip}
            onClick={onScan}
          >
            <svg width="19" height="19" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M1.5 5V2.5A1 1 0 0 1 2.5 1.5H5M11 1.5h2.5a1 1 0 0 1 1 1V5M14.5 11v2.5a1 1 0 0 1-1 1H11M5 14.5H2.5a1 1 0 0 1-1-1V11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </ComposerIconButton>

          {/* §30: AI Vision v1 recognises FRUIT. The tooltip says exactly that,
              because a sparkle that promises "anything" is a promise the
              recogniser cannot keep. */}
          <ComposerIconButton
            testId="home-intent-vision"
            label={homeCreatorCopy.intent.addByVision}
            tooltip={homeCreatorCopy.intent.visionTooltip}
            onClick={() => setVisionOpen(true)}
          >
            <svg width="19" height="19" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M8 1.5 9.3 5 12.8 6.3 9.3 7.6 8 11.1 6.7 7.6 3.2 6.3 6.7 5 8 1.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M12.6 11.1 13.1 12.6 14.6 13.1 13.1 13.6 12.6 15.1 12.1 13.6 10.6 13.1 12.1 12.6 12.6 11.1Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </ComposerIconButton>

          <span aria-hidden className="flex-1" />

          {/* §27: ENTER and this arrow are the SAME action. It is disabled while
              the field is empty so the affordance is honest, and it commits on
              pointerdown-free click — the field's own blur has already run by
              then and `commitTyped` is a no-op on an empty value, so a single
              idea can never be added twice. */}
          <ComposerIconButton
            testId="home-intent-send"
            label={homeCreatorCopy.intent.sendIdea}
            tooltip={homeCreatorCopy.intent.sendTooltip}
            onClick={commitTyped}
            disabled={value.trim() === ''}
            variant="send"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M8 13V3m0 0L4 7m4-4 4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ComposerIconButton>
        </div>
      </div>

      {voice.state === 'unavailable' ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--g-text-muted)' }}>
          {homeCreatorCopy.intent.voiceUnavailable}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-[22px]" data-testid="home-intent-chips">
          <p
            className="text-[11px] font-bold tracking-[0.12em] uppercase"
            style={{ color: 'var(--g-text-muted)' }}
          >
            {homeCreatorCopy.intent.chipsLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
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

      {showEmptyHint ? (
        <p
          className="mt-3.5 text-[13.5px] leading-[1.4]"
          data-testid="home-intent-empty-hint"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {homeCreatorCopy.intent.emptyHint}
        </p>
      ) : null}
      {/* The resolving line stays, because it reports work that is actually happening.
          The CTA it used to stand under now lives at the bottom of the start screen. */}
      {resolving ? (
        <p
          className="mt-3 text-[12px]"
          data-testid="home-intent-resolving"
          style={{ color: 'var(--g-text-muted)' }}
        >
          {homeCreatorCopy.intent.resolving}
        </p>
      ) : null}

      {/* §31: full-screen fruit camera. Mounted from the composer so the
          recognised fruit re-enters through the SAME `ingest` every other input
          uses — one intent, four doors (§19). */}
      {visionOpen ? (
        <HomeVisionCapture
          onClose={() => setVisionOpen(false)}
          onRecognised={(names) => {
            for (const name of names) ingest(name, 'vision');
            setVisionOpen(false);
          }}
        />
      ) : null}
    </HomeSection>
  );
}
