import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import {
  officialProductTypeLabelPl,
  officialRecipeCopy as c,
  officialStageLabelPl,
} from '@/copy/officialRecipeLibrary';
import {
  OFFICIAL_COLLECTIONS,
  OFFICIAL_RECIPE_IMAGE_WIDTHS,
  officialCollectionById,
  officialLibraryHref,
  officialRecipeAddonLines,
  officialRecipeAddonTotal,
  officialRecipeBaseLines,
  officialRecipeBaseTotal,
  officialRecipeFinalTotal,
  officialRecipeHasImage,
  officialRecipeImage,
  officialRecipeLineScope,
  officialRecipesInCollection,
  officialUnresolvedLines,
  type OfficialCollectionId,
  type OfficialRecipe,
  type OfficialRecipeLine,
} from '@/data/recipes/official/officialRecipeLibrary';
import {
  officialRecipeCanStart,
  officialRecipeReadiness,
} from '@/data/recipes/official/officialRecipeReadiness';
import { cn } from '@/lib/cn';
import { useCurrentMapperRows, useMarketProducts } from './useOfficialRecipeRuntime';

export type OfficialLibraryPersona = 'demo' | 'home' | 'pro';

const cardClasses =
  'group flex h-full flex-col overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-white text-left transition-colors hover:border-[var(--g-line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--g-ink)]';
const eyebrowClasses = 'text-[11px] font-semibold tracking-[0.14em] text-stone-500 uppercase';

function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'attention';
  children: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full rounded border px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase',
        tone === 'attention'
          ? 'border-attention/30 bg-attention/[0.06] text-attention'
          : 'border-ink/15 text-stone-600',
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-ink"
      data-testid="official-library-back"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}

function RecipeArtwork({ recipe, size }: { recipe: OfficialRecipe; size: 'card' | 'detail' }) {
  if (officialRecipeHasImage(recipe)) {
    const image = officialRecipeImage(recipe);
    return (
      <img
        src={image[size]}
        width={OFFICIAL_RECIPE_IMAGE_WIDTHS[size]}
        height={OFFICIAL_RECIPE_IMAGE_WIDTHS[size]}
        alt={recipe.name}
        loading={size === 'card' ? 'lazy' : undefined}
        decoding="async"
        className={cn(
          'aspect-square w-full bg-[var(--g-ivory)] object-cover',
          size === 'detail' && 'rounded-[12px] border border-[var(--g-line)]',
        )}
        data-testid={size === 'detail' ? 'official-recipe-image' : undefined}
      />
    );
  }
  const missing = officialUnresolvedLines(recipe).map((line) => line.label);
  const message =
    missing.length === 0
      ? c.photoPending
      : missing.length === 1
        ? c.photoMissingIngredient(missing[0]!)
        : c.photoMissingIngredients(missing);
  return (
    <div
      role="img"
      aria-label={`${recipe.name}: ${message}`}
      className={cn(
        'flex aspect-square w-full items-center justify-center bg-[var(--g-ivory)] p-6 text-center font-mono text-[11px] leading-relaxed text-stone-500',
        size === 'detail' && 'rounded-[12px] border border-[var(--g-line)]',
      )}
      data-testid="official-recipe-placeholder"
    >
      {message}
    </div>
  );
}

/** The five official collections, in the owner's order. */
export function OfficialCollectionsGrid() {
  return (
    <section aria-labelledby="official-collections-heading" data-testid="official-collections">
      <p className={eyebrowClasses}>{c.eyebrow}</p>
      <h2
        id="official-collections-heading"
        className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink"
      >
        {c.collectionsTitle}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">{c.collectionsBody}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {OFFICIAL_COLLECTIONS.map((collection) => {
          const recipes = officialRecipesInCollection(collection.id);
          const subcategories = [...new Set(recipes.map((recipe) => recipe.subcategory))];
          return (
            <Link
              key={collection.id}
              to={officialLibraryHref({ collection: collection.id })}
              className={cardClasses}
              data-testid={`official-collection-card-${collection.id}`}
            >
              <img
                src={collection.heroImage.small}
                srcSet={`${collection.heroImage.small} 960w, ${collection.heroImage.large} 1672w`}
                sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
                width={1672}
                height={941}
                alt={collection.name}
                loading="lazy"
                decoding="async"
                className="aspect-[1672/941] w-full bg-[var(--g-ivory)] object-cover"
              />
              <div className="flex flex-1 flex-col p-[18px]">
                <h3 className="text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                  {collection.name}
                </h3>
                <p className="mt-1 font-mono text-[12px] text-stone-500">
                  {c.recipeCount(recipes.length)}
                </p>
                <p className="mt-3 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                  {subcategories.join(' · ')}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecipeCard({ recipe }: { recipe: OfficialRecipe }) {
  const readiness = officialRecipeReadiness(recipe);
  const readinessChip = c.cardReadiness[readiness.state];
  return (
    <Link
      to={officialLibraryHref({ recipeId: recipe.recipeId })}
      className={cardClasses}
      data-testid={`official-recipe-card-${recipe.recipeId}`}
      data-recipe-number={recipe.number}
      data-readiness={readiness.state}
    >
      <RecipeArtwork recipe={recipe} size="card" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-[16px] leading-[1.25] font-semibold tracking-[-0.015em] text-ink">
          {recipe.name}
        </h3>
        <p className="text-[12px] leading-[1.45] text-stone-500">
          {officialProductTypeLabelPl(recipe.productType)} · {recipe.subcategory}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {readinessChip ? (
            <Chip tone={readiness.state === 'DYNAMIC_MAIN' ? 'neutral' : 'attention'}>
              {readinessChip}
            </Chip>
          ) : null}
          {recipe.degassingRequired ? <Chip>{c.cardDegassing}</Chip> : null}
        </div>
      </div>
    </Link>
  );
}

/** Every recipe of one collection, in source order. */
export function OfficialCollectionView({ collectionId }: { collectionId: OfficialCollectionId }) {
  const collection = officialCollectionById(collectionId);
  const recipes = officialRecipesInCollection(collectionId);
  return (
    <section
      aria-labelledby="official-collection-heading"
      data-testid={`official-collection-${collectionId}`}
    >
      <BackLink to={officialLibraryHref()} label={c.backToCollections} />
      <div className="mt-8 overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-white">
        <img
          src={collection.heroImage.large}
          srcSet={`${collection.heroImage.small} 960w, ${collection.heroImage.large} 1672w`}
          sizes="(min-width: 1280px) 1120px, 100vw"
          width={1672}
          height={941}
          alt={collection.name}
          decoding="async"
          className="aspect-[1672/941] w-full bg-[var(--g-ivory)] object-cover"
        />
      </div>
      <p className={cn(eyebrowClasses, 'mt-8')}>{c.eyebrow}</p>
      <h2
        id="official-collection-heading"
        className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink"
      >
        {collection.name}
      </h2>
      <p className="mt-2 font-mono text-[12px] text-stone-500">{c.recipeCount(recipes.length)}</p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.recipeId} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}

function IngredientIdentityLine({
  line,
  mapperName,
  mapperState,
  marketProduct,
}: {
  line: OfficialRecipeLine;
  mapperName: string | null;
  mapperState: 'idle' | 'loading' | 'ready' | 'unavailable';
  marketProduct: { name: string; country: string } | null;
}) {
  if (line.identity.kind === 'unresolved') {
    return (
      <p
        className="mt-1 text-[12px] leading-[1.45] text-attention"
        data-testid="official-line-unresolved"
      >
        {c.unresolvedLine}
      </p>
    );
  }
  if (line.identity.kind === 'dynamic_main') {
    return (
      <p
        className="mt-1 text-[12px] leading-[1.45] text-stone-600"
        data-testid="official-line-dynamic-main"
      >
        {c.dynamicMainLine}
      </p>
    );
  }
  if (line.publicLabelOnly) {
    return <p className="mt-1 text-[12px] leading-[1.45] text-stone-500">{c.genericLabelOnly}</p>;
  }
  // A PI the Mapper runtime does not serve (inactive or not approved for Base)
  // reads as unavailable — never as a silent blank.
  const lead = mapperName ? (
    <span data-testid="official-line-canonical-name">{mapperName}</span>
  ) : mapperState === 'loading' ? (
    c.canonicalLoading
  ) : mapperState === 'ready' || mapperState === 'unavailable' ? (
    <span className="text-attention" data-testid="official-line-canonical-unavailable">
      {c.canonicalUnavailable}
    </span>
  ) : null;
  return (
    <>
      <p className="mt-1 text-[12px] leading-[1.45] text-stone-500">
        {lead}
        {lead ? ' · ' : null}
        <span className="font-mono text-[11px]" data-testid="official-line-pi">
          {line.identity.mapperIngredientId}
        </span>
      </p>
      {marketProduct ? (
        <p
          className="mt-1 text-[12px] leading-[1.45] text-ink"
          data-testid="official-line-market-product"
        >
          {c.marketProduct(marketProduct.name, marketProduct.country)}
        </p>
      ) : null}
    </>
  );
}

/** One official recipe: the immutable source formula, its explicit readiness and the main action. */
export function OfficialRecipeDetail({
  recipe,
  persona,
  onUse,
}: {
  recipe: OfficialRecipe;
  persona: OfficialLibraryPersona;
  onUse: (recipeId: string) => void;
}) {
  const collection = officialCollectionById(recipe.collection);
  const showGrams = persona !== 'demo';
  const baseLines = officialRecipeBaseLines(recipe);
  const addonLines = officialRecipeAddonLines(recipe);
  const mappedIds = recipe.lines.flatMap((line) =>
    line.identity.kind === 'mapped' ? [line.identity.mapperIngredientId] : [],
  );
  const mapper = useCurrentMapperRows(mappedIds, persona !== 'demo');
  const market = useMarketProducts(mappedIds, persona !== 'demo');
  const marketCountry = market.status === 'ready' ? market.value.country : null;
  // Counted per recipe line, exactly like the working-copy banner in PRO.
  const matched =
    market.status === 'ready' ? mappedIds.filter((pi) => market.value.byPi.has(pi)).length : 0;
  // The same runtime gate the working-copy handoff applies: a mapped PI the Mapper runtime
  // does not serve can only make the recipe worse — it never makes one ready.
  const unavailablePis = new Set(
    mapper.status === 'ready' ? mappedIds.filter((pi) => !mapper.value.has(pi)) : [],
  );
  const readiness = officialRecipeReadiness(recipe, { unavailablePis });
  const canStart = officialRecipeCanStart(readiness);
  const reasonLabels = [
    ...new Set(
      readiness.blockingLines
        .filter((entry) => entry.state === readiness.state)
        .map((entry) => entry.line.label),
    ),
  ];

  const renderLine = (line: OfficialRecipeLine) => {
    const pi = line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : null;
    const row = pi && mapper.status === 'ready' ? (mapper.value.get(pi) ?? null) : null;
    const route = pi && market.status === 'ready' ? market.value.byPi.get(pi) : undefined;
    return (
      <li
        key={line.line}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3"
        data-testid="official-recipe-line"
        data-line-kind={line.identity.kind}
        data-line-scope={officialRecipeLineScope(line)}
        data-stage={line.stage}
      >
        <div className="min-w-0">
          <p className="text-[14px] leading-[1.35] font-medium text-ink">{line.label}</p>
          {line.stage !== 'MIX' ? (
            <div className="mt-1">
              <Chip>{officialStageLabelPl(line.stage)}</Chip>
            </div>
          ) : null}
          {persona === 'demo' && line.identity.kind === 'mapped' ? null : (
            <IngredientIdentityLine
              line={line}
              mapperName={row?.ingredient_name_display ?? null}
              mapperState={mapper.status}
              marketProduct={
                route && !line.publicLabelOnly
                  ? {
                      name: route.product.brand
                        ? `${route.product.brand} · ${route.product.displayName}`
                        : route.product.displayName,
                      country: route.country ?? marketCountry ?? '',
                    }
                  : null
              }
            />
          )}
        </div>
        {showGrams ? (
          <p
            className="w-20 text-right font-mono text-[13px] text-ink"
            data-testid="official-line-grams"
          >
            {line.grams} g
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <article
      aria-labelledby="official-recipe-heading"
      data-testid="official-recipe-detail"
      data-recipe-number={recipe.number}
      data-readiness={readiness.state}
    >
      <BackLink
        to={officialLibraryHref({ collection: recipe.collection })}
        label={c.backToCollection(collection.name)}
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <RecipeArtwork recipe={recipe} size="detail" />
        <div className="min-w-0">
          <p className={eyebrowClasses}>{collection.name}</p>
          <h2
            id="official-recipe-heading"
            className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink"
          >
            {recipe.name}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {[
              officialProductTypeLabelPl(recipe.productType),
              recipe.subcategory,
              recipe.origin,
              recipe.continent,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {recipe.description ? (
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone-700">
              {recipe.description}
            </p>
          ) : null}

          <div className="mt-6">
            <button
              type="button"
              className={cn(buttonClasses('primary', 'md'), 'w-full sm:w-auto')}
              disabled={!canStart}
              onClick={() => onUse(recipe.recipeId)}
              data-testid="official-recipe-use"
              data-readiness={readiness.state}
            >
              {c.use}
            </button>
            <p
              className={cn(
                'mt-3 text-[12px] leading-relaxed',
                canStart ? 'text-stone-500' : 'text-attention',
              )}
              data-testid="official-recipe-use-state"
              data-use-state={readiness.state}
            >
              {canStart
                ? persona === 'demo'
                  ? c.useDemo
                  : c.useHint
                : c.readinessReason(readiness.state, reasonLabels)}
            </p>
          </div>

          {recipe.instructions?.length ? (
            <section className="mt-6" data-testid="official-recipe-instructions">
              <h3 className={eyebrowClasses}>{c.instructionsTitle}</h3>
              {recipe.toolNotice ? (
                <p
                  className="mt-3 border-l-2 border-ink/30 pl-3 text-[13px] leading-relaxed text-ink"
                  data-testid="official-recipe-tool-notice"
                >
                  {recipe.toolNotice}
                </p>
              ) : null}
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-stone-700">
                {recipe.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>

      <section className="mt-10" aria-labelledby="official-recipe-ingredients">
        <h3
          id="official-recipe-ingredients"
          className="text-lg font-semibold tracking-[-0.02em] text-ink"
        >
          {c.ingredientsTitle}
        </h3>
        {market.status === 'ready' && marketCountry ? (
          <p
            className="mt-2 text-[12px] leading-relaxed text-stone-600"
            data-testid="official-recipe-market-summary"
          >
            {c.handoffMarket(matched, mappedIds.length, marketCountry)}
          </p>
        ) : null}
        {recipe.baseRecipeReference ? (
          <p
            className="mt-3 text-[12px] leading-relaxed text-stone-600"
            data-testid="official-base-reference"
          >
            {c.baseReference(
              recipe.baseRecipeReference.recipeId,
              recipe.baseRecipeReference.recipeVersion,
              recipe.baseRecipeReference.servingGrams,
            )}
          </p>
        ) : null}
        <ol className="mt-5 divide-y divide-ink/10 border-y border-ink/10">
          {baseLines.map(renderLine)}
        </ol>
        {showGrams ? (
          <p className="mt-3 flex justify-between text-[13px] font-semibold text-ink">
            <span>{c.mainTotal}</span>
            <span className="font-mono">{officialRecipeBaseTotal(recipe)} g</span>
          </p>
        ) : null}
        {addonLines.length > 0 ? (
          <>
            <h4 className="mt-8 text-[12px] font-semibold tracking-[0.08em] text-stone-600 uppercase">
              {c.addonPhase}
            </h4>
            <ol className="mt-2 divide-y divide-ink/10 border-y border-ink/10">
              {addonLines.map(renderLine)}
            </ol>
            {showGrams ? (
              <div className="mt-3 space-y-2 text-[13px] font-semibold text-ink">
                <p className="flex justify-between">
                  <span>{c.addonTotal}</span>
                  <span className="font-mono">{officialRecipeAddonTotal(recipe)} g</span>
                </p>
                <p className="flex justify-between border-t border-ink/10 pt-2">
                  <span>{c.finalTotal}</span>
                  <span className="font-mono">{officialRecipeFinalTotal(recipe)} g</span>
                </p>
              </div>
            ) : null}
          </>
        ) : null}
        {!showGrams ? <p className="mt-3 text-[12px] text-stone-500">{c.gramsHidden}</p> : null}
      </section>
    </article>
  );
}
