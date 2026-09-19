/**
 * RL-17 — where a HOME recipe starts, and where the current one came from.
 *
 * DESIGN V3.0 VI/IX: `HomeStartModes` offers the TWO starting points — „Twój pomysł” (this
 * page's composer) and „Receptury” (the collections, their carousels and the search, shown
 * on this page). Community is the sixth collection inside „Receptury”, no longer a third
 * mode, and neither mode leaves HOME: a chosen recipe opens through the same adoption
 * every surface uses.
 *
 * `HomeRecipeOriginNotice` says what just happened to an official recipe opened in HOME, and
 * `HomeRecipeProvenanceLine` keeps a working copy's origin visible afterwards.
 */
import type { KeyboardEvent } from 'react';
import { officialRecipeCopy } from '@/copy/officialRecipeLibrary';
import type { RecipeProvenance } from '@/features/recipes/recipeProvenance';
import type { HomeStartMode } from '../homeComposerGate';
import { homeCreatorCopy } from '../homeCreatorCopy';

/** The same horizontal frame as every HOME section. */
const FRAME = 'mx-auto w-full max-w-[560px] px-5 sm:px-6 lg:max-w-[720px]';
const PILL =
  'inline-flex min-h-[44px] items-center rounded-full border px-4 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

const START_MODES: readonly HomeStartMode[] = ['idea', 'library'];

/** „Twój pomysł” | „Receptury” — one choice, two pills (styled by `homeStart.css`). */
export function HomeStartModes({
  mode,
  onChange,
}: {
  mode: HomeStartMode;
  onChange: (mode: HomeStartMode) => void;
}) {
  const c = homeCreatorCopy.sources;
  const label = (entry: HomeStartMode) => (entry === 'idea' ? c.own : c.library);
  // A radio group moves with the arrow keys and keeps ONE tab stop.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = START_MODES[(START_MODES.indexOf(mode) + 1) % START_MODES.length]!;
    onChange(next);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-testid="home-start-mode-${next}"]`)
      ?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={c.label}
      data-testid="home-recipe-sources"
      className="home-start-modes"
      onKeyDown={onKeyDown}
    >
      {START_MODES.map((entry) => (
        <button
          key={entry}
          type="button"
          role="radio"
          aria-checked={mode === entry}
          tabIndex={mode === entry ? 0 : -1}
          className="home-start-mode"
          data-testid={`home-start-mode-${entry}`}
          onClick={() => onChange(entry)}
        >
          {label(entry)}
        </button>
      ))}
    </div>
  );
}

export type HomeOfficialAdoption =
  | { readonly state: 'loading' }
  | {
      readonly state: 'ready';
      readonly message: string;
      readonly notices: readonly string[];
      /** Adopted by §35 without a question — the customer gets a way back to their own idea. */
      readonly automatic: boolean;
    }
  | { readonly state: 'blocked'; readonly message: string };

export function HomeRecipeOriginNotice({
  adoption,
  onCreateOwn,
}: {
  adoption: HomeOfficialAdoption;
  onCreateOwn: () => void;
}) {
  if (adoption.state === 'loading') {
    return (
      <p
        role="status"
        data-testid="home-official-adoption"
        data-state="loading"
        className={`${FRAME} pt-6 text-[14px]`}
        style={{ color: 'var(--g-text-secondary)' }}
      >
        {officialRecipeCopy.handoffLoading}
      </p>
    );
  }
  if (adoption.state === 'blocked') {
    return (
      <p
        role="alert"
        data-testid="home-official-adoption"
        data-state="blocked"
        className={`${FRAME} pt-6 text-[14px] font-medium text-attention`}
      >
        {adoption.message}
      </p>
    );
  }
  return (
    <div
      role="status"
      data-testid="home-official-adoption"
      data-state="ready"
      className={`${FRAME} pt-6 text-[14px]`}
      style={{ color: 'var(--g-ink)' }}
    >
      <p className="font-medium">{adoption.message}</p>
      {adoption.notices.map((notice) => (
        <p key={notice} className="mt-1 text-[13px]" style={{ color: 'var(--g-text-secondary)' }}>
          {notice}
        </p>
      ))}
      {adoption.automatic ? (
        <button
          type="button"
          onClick={onCreateOwn}
          data-testid="home-official-create-own"
          className={`${PILL} mt-3`}
          style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
        >
          {homeCreatorCopy.match.continueCreating}
        </button>
      ) : null}
    </div>
  );
}

export function HomeRecipeProvenanceLine({ provenance }: { provenance: RecipeProvenance }) {
  const c = homeCreatorCopy.match;
  const [title, author] =
    provenance.kind === 'official'
      ? [provenance.sourceName, c.byGellatti]
      : [provenance.sourceTitle, provenance.sourceCreatorDisplayName];
  return (
    <p
      data-testid="home-recipe-provenance"
      data-provenance={provenance.kind}
      className={`${FRAME} pt-6 text-[13px]`}
      style={{ color: 'var(--g-text-secondary)' }}
    >
      {c.basedOnOriginal} „{title}” — {author}
    </p>
  );
}
