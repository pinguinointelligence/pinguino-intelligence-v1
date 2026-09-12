/**
 * RL-17 — where a HOME recipe starts, and where the current one came from.
 *
 * `HomeRecipeSources` offers the three starting points: the customer's own idea (this page),
 * an official Gellatti recipe and a Community recipe. The other two open their browsing
 * surfaces; „Zrób te lody" there brings the chosen recipe back here as the customer's working
 * copy, through the same adoption every surface uses.
 *
 * `HomeRecipeOriginNotice` says what just happened to an official recipe opened in HOME, and
 * `HomeRecipeProvenanceLine` keeps a working copy's origin visible afterwards.
 */
import { Link } from 'react-router';
import { officialRecipeCopy } from '@/copy/officialRecipeLibrary';
import type { RecipeProvenance } from '@/features/recipes/recipeProvenance';
import { homeCreatorCopy } from '../homeCreatorCopy';

/** The same horizontal frame as every HOME section. */
const FRAME = 'mx-auto w-full max-w-[560px] px-5 sm:px-6 lg:max-w-[720px]';
const PILL =
  'inline-flex min-h-[40px] items-center rounded-full border px-4 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

export function HomeRecipeSources() {
  const c = homeCreatorCopy.sources;
  return (
    <nav
      aria-label={c.label}
      data-testid="home-recipe-sources"
      className={`${FRAME} flex flex-wrap items-center gap-2 pt-6`}
    >
      <span
        aria-current="page"
        className={PILL}
        style={{ borderColor: 'var(--g-ink)', color: 'var(--g-ink)' }}
      >
        {c.own}
      </span>
      <Link
        to="/recipes"
        data-testid="home-source-gellatti"
        className={PILL}
        style={{ borderColor: 'var(--g-line)', color: 'var(--g-text-secondary)' }}
      >
        {c.gellatti}
      </Link>
      <Link
        to="/community"
        data-testid="home-source-community"
        className={PILL}
        style={{ borderColor: 'var(--g-line)', color: 'var(--g-text-secondary)' }}
      >
        {c.community}
      </Link>
    </nav>
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
