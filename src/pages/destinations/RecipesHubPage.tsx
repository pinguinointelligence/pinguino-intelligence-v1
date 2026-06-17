import { Link } from 'react-router';
import { DestinationSection, DestinationSurface } from '@/components/shared/DestinationSurface';
import { ImagePlaceholder } from '@/features/shell/MegaMenuItem';
import { copy } from '@/copy/en';

const r = copy.nav.recipes;

/** A recipe tile — a real link when routable, else a decorative placeholder. */
function RecipeTile({ label, to }: { label: string; to?: string }) {
  const body = (
    <div className="group flex flex-col gap-2.5">
      <ImagePlaceholder className="aspect-[4/3] w-full transition-colors group-hover:bg-ivory/[0.08]" />
      <span className="text-sm text-ivory/70 transition-colors group-hover:text-ivory">{label}</span>
    </div>
  );
  return to ? (
    <Link to={to}>{body}</Link>
  ) : (
    <div className="cursor-default">{body}</div>
  );
}

/**
 * Recipes hub (Phase 6C Slice 3) — the dark premium browse destination at /recipes.
 * "My Recipes" links to the saved-recipes page (/my-recipes); everything else is a
 * decorative placeholder. No Pro-only exact content is exposed to Free Preview.
 */
export function RecipesHubPage() {
  return (
    <DestinationSurface title={r.title} blurb={r.blurb}>
      <p className="max-w-2xl text-sm leading-relaxed text-ivory/55">{r.note}</p>

      <DestinationSection label={r.browse} className="mt-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          <RecipeTile label={r.mine} to="/my-recipes" />
          <RecipeTile label={r.pinguino} />
          <RecipeTile label={r.featured} />
          <RecipeTile label={r.recent} />
          <RecipeTile label={r.startFrom} />
        </div>
      </DestinationSection>

      <DestinationSection label={r.categories} className="mt-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          <RecipeTile label={r.gelato} />
          <RecipeTile label={r.sorbet} />
          <RecipeTile label={r.vegan} />
          <RecipeTile label={r.protein} />
        </div>
      </DestinationSection>
    </DestinationSurface>
  );
}
