import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import {
  officialProductTypeLabelPl,
  officialRecipeCopy as c,
  officialSourceStatusLabelPl,
  officialStageLabelPl,
} from '@/copy/officialRecipeLibrary';
import {
  OFFICIAL_COLLECTIONS,
  OFFICIAL_RECIPE_IMAGE_WIDTHS,
  officialCollectionById,
  officialLibraryHref,
  officialRecipeImage,
  officialRecipesInCollection,
  officialRecipeUseState,
  officialUnresolvedLines,
  type OfficialCollectionId,
  type OfficialRecipe,
  type OfficialRecipeLine,
} from '@/data/recipes/official/officialRecipeLibrary';
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
  const image = officialRecipeImage(recipe);
  const useState = officialRecipeUseState(recipe);
  return (
    <Link
      to={officialLibraryHref({ recipeId: recipe.recipeId })}
      className={cardClasses}
      data-testid={`official-recipe-card-${recipe.recipeId}`}
      data-recipe-number={recipe.number}
    >
      <img
        src={image.card}
        width={OFFICIAL_RECIPE_IMAGE_WIDTHS.card}
        height={OFFICIAL_RECIPE_IMAGE_WIDTHS.card}
        alt={recipe.name}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full bg-[var(--g-ivory)] object-cover"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-mono text-[11px] text-stone-500">
          {c.number(recipe.photoId, recipe.number)}
        </p>
        <h3 className="text-[16px] leading-[1.25] font-semibold tracking-[-0.015em] text-ink">
          {recipe.name}
        </h3>
        <p className="text-[12px] leading-[1.45] text-stone-500">
          {officialProductTypeLabelPl(recipe.productType)} · {recipe.subcategory}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {useState.kind === 'unresolved_identity' ? (
            <Chip tone="attention">{c.cardUnresolved}</Chip>
          ) : null}
          {useState.kind === 'dynamic_main_required' ? <Chip>{c.cardTemplate}</Chip> : null}
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
          sizes="(min-width: 1024px) 60vw, 100vw"
          width={1672}
          height={941}
          alt={collection.name}
          decoding="async"
          className="aspect-[1672/941] max-h-[320px] w-full bg-[var(--g-ivory)] object-cover"
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
  return (
    <>
      <p className="mt-1 text-[12px] leading-[1.45] text-stone-500">
        {mapperName ? (
          <span data-testid="official-line-canonical-name">{mapperName}</span>
        ) : mapperState === 'loading' ? (
          c.canonicalLoading
        ) : mapperState === 'unavailable' ? (
          c.canonicalUnavailable
        ) : null}
        {mapperName || mapperState !== 'idle' ? ' · ' : null}
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

/** One official recipe: the immutable source formula and its honest state. */
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
  const image = officialRecipeImage(recipe);
  const useState = officialRecipeUseState(recipe);
  const showGrams = persona !== 'demo';
  const mappedIds = recipe.lines.flatMap((line) =>
    line.identity.kind === 'mapped' && !line.publicLabelOnly
      ? [line.identity.mapperIngredientId]
      : [],
  );
  const mapper = useCurrentMapperRows(mappedIds, persona !== 'demo');
  const market = useMarketProducts(mappedIds, persona !== 'demo');
  const marketCountry = market.status === 'ready' ? market.value.country : null;
  const matched =
    market.status === 'ready'
      ? mappedIds.filter((pi, index, all) => all.indexOf(pi) === index && market.value.byPi.has(pi))
          .length
      : 0;
  const uniqueMapped = new Set(mappedIds).size;
  const pending = officialUnresolvedLines(recipe).length;

  return (
    <article
      aria-labelledby="official-recipe-heading"
      data-testid="official-recipe-detail"
      data-recipe-number={recipe.number}
    >
      <BackLink
        to={officialLibraryHref({ collection: recipe.collection })}
        label={c.backToCollection(collection.name)}
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <img
          src={image.detail}
          width={OFFICIAL_RECIPE_IMAGE_WIDTHS.detail}
          height={OFFICIAL_RECIPE_IMAGE_WIDTHS.detail}
          alt={recipe.name}
          decoding="async"
          className="aspect-square w-full rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] object-cover"
          data-testid="official-recipe-image"
        />
        <div className="min-w-0">
          <p className={eyebrowClasses}>
            {collection.name} · {c.number(recipe.photoId, recipe.number)}
          </p>
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

          <section className="mt-6" aria-labelledby="official-recipe-status">
            <h3 id="official-recipe-status" className={eyebrowClasses}>
              {c.statusTitle}
            </h3>
            <dl className="mt-3 divide-y divide-ink/10 border-y border-ink/10 text-[13px]">
              {(
                [
                  [c.sourceRecipe, c.sourceRecipeValue, 'source'],
                  [c.engineRow, officialSourceStatusLabelPl(recipe.sourceStatus), 'engine'],
                  [
                    c.ingredientsRow,
                    pending === 0 ? c.ingredientsComplete : c.ingredientsPending(pending),
                    'ingredients',
                  ],
                  [c.productionRow, c.productionValue, 'production'],
                ] as const
              ).map(([term, value, id]) => (
                <div
                  key={id}
                  className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-4"
                  data-testid={`official-recipe-status-${id}`}
                  data-source-status={id === 'engine' ? recipe.sourceStatus : undefined}
                >
                  <dt className="text-stone-500">{term}</dt>
                  <dd
                    className={cn(
                      'text-ink',
                      id === 'ingredients' && pending > 0 && 'text-attention',
                    )}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {recipe.processNotice || recipe.degassingRequired ? (
            <section className="mt-6" data-testid="official-recipe-process-notice">
              <h3 className={eyebrowClasses}>
                {recipe.degassingRequired ? c.degassingTitle : c.processNoticeTitle}
              </h3>
              {recipe.processNotice ? (
                <p className="mt-2 text-[13px] leading-relaxed text-stone-700">
                  {recipe.processNotice}
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-8">
            {persona === 'pro' ? (
              <>
                <button
                  type="button"
                  className={cn(buttonClasses('primary', 'md'), 'w-full sm:w-auto')}
                  disabled={useState.kind !== 'ready'}
                  onClick={() => onUse(recipe.recipeId)}
                  data-testid="official-recipe-use"
                >
                  {c.use}
                </button>
                <p
                  className={cn(
                    'mt-3 text-[12px] leading-relaxed',
                    useState.kind === 'ready' ? 'text-stone-500' : 'text-attention',
                  )}
                  data-testid="official-recipe-use-state"
                  data-use-state={useState.kind}
                >
                  {useState.kind === 'ready'
                    ? c.useHint
                    : useState.kind === 'unresolved_identity'
                      ? c.useBlockedUnresolved(useState.lines.map((line) => line.label))
                      : c.useBlockedDynamicMain}
                </p>
              </>
            ) : (
              <p
                className="text-[12px] leading-relaxed text-stone-500"
                data-testid="official-recipe-use-state"
                data-use-state={useState.kind}
              >
                {persona === 'home' ? c.useHome : c.gramsHidden}
              </p>
            )}
          </div>
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
            {c.handoffMarket(matched, uniqueMapped, marketCountry)}
          </p>
        ) : null}
        <ol className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
          {recipe.lines.map((line) => {
            const pi = line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : null;
            const row = pi && mapper.status === 'ready' ? (mapper.value.get(pi) ?? null) : null;
            const route = pi && market.status === 'ready' ? market.value.byPi.get(pi) : undefined;
            return (
              <li
                key={line.line}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3"
                data-testid="official-recipe-line"
                data-line-kind={line.identity.kind}
                data-stage={line.stage}
              >
                <div className="min-w-0">
                  <p className="text-[14px] leading-[1.35] font-medium text-ink">{line.label}</p>
                  {line.stage !== 'MIX' ? (
                    <div className="mt-1">
                      <Chip>{officialStageLabelPl(line.stage)}</Chip>
                    </div>
                  ) : null}
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
          })}
        </ol>
        {showGrams ? (
          <p className="mt-3 flex justify-between text-[13px] font-semibold text-ink">
            <span>{c.total}</span>
            <span className="font-mono">{recipe.sourceTotalGrams} g</span>
          </p>
        ) : (
          <p className="mt-3 text-[12px] text-stone-500">{c.gramsHidden}</p>
        )}
      </section>
    </article>
  );
}
