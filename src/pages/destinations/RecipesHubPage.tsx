import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { copy } from '@/copy/en';
import {
  candidateStartIntent,
  hasPublicCountryIdentity,
  isPublishableCandidate,
  publicCountryNavigation,
  visibleCuratedCandidates,
  type CuratedCollection,
  type CuratedRecipeCandidate,
} from '@/data/recipes/curatedCollections';
import {
  customerFacingInspirationFamilies,
  initialDiscoveryFamilies,
  searchInspirationFamilies,
  type InspirationFamily,
  type InspirationProductFilter,
} from '@/data/recipes/inspirationClustering';
import {
  flavorInspirationStartIntent,
  inspirationStartHref,
} from '@/data/recipes/inspirationHandoff';
import { NonProductionMarker } from '@/features/design-review/NonProductionMarker';
import { useReviewMode } from '@/features/design-review/useReviewMode';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { cn } from '@/lib/cn';
import { MyRecipesContent } from '@/pages/recipes/MyRecipesPage';

const r = copy.nav.recipes;
const d = r.discovery;
const MAX_FEATURED = 6;

type DiscoveryView = 'home' | 'lost' | 'natural' | 'inspiration' | 'countries';
type RecipeLibraryTab = 'mine' | 'pinguino' | 'inspiration';
type IconName = 'left' | 'right' | 'book' | 'globe' | 'leaf' | 'search' | 'sparkles';

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const paths: Readonly<Record<IconName, ReactNode>> = {
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-7 10-16Z" />
        <path d="M5 20c2-5 6-8 11-11" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" />
        <path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8ZM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6Z" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

const STATUS_LABELS: Readonly<Record<CuratedRecipeCandidate['status'], string>> = {
  authentic_reproducible: 'Oryginalna wersja',
  adaptable: 'Jawna adaptacja',
  not_suitable: 'Odrzucone',
  research_required: 'Research',
};

const STAGE_LABELS: Readonly<Record<CuratedRecipeCandidate['publicationStage'], string>> = {
  researched: 'RESEARCH',
  mapper_ready: 'NIEZWERYFIKOWANE PRODUKCYJNIE',
  formulated: 'Wymaga testu',
  engine_verified: 'Wymaga testu',
  kitchen_tested: 'Wymaga oceny sensorycznej',
  sensory_approved: 'Przed publikacją',
  published: 'Opublikowane',
};

function PinkReadiness({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded border border-nonprod/35 bg-nonprod/[0.07] px-2 py-1 text-[10px] font-semibold tracking-[0.08em] text-nonprod uppercase">
      {children}
    </span>
  );
}

function OwnerReviewFrame({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? (
    <NonProductionMarker itemId="recipes-hub-tiles" title="TRYB OWNER REVIEW">
      {children}
    </NonProductionMarker>
  ) : (
    <>{children}</>
  );
}

function ActionCard({
  icon,
  title,
  body,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-40 w-full border-t border-ink/12 py-6 text-left transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
    >
      <div className="flex items-start justify-between gap-6">
        <span className="mt-1 text-ink" aria-hidden>
          {icon}
        </span>
        <Icon
          name="right"
          className="h-4 w-4 text-stone-400 transition-transform group-hover:translate-x-1"
        />
      </div>
      <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-500">{body}</p>
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-ink"
    >
      <Icon name="left" />
      {d.back}
    </button>
  );
}

function CandidateCard({ entry }: { entry: CuratedRecipeCandidate }) {
  const intent = candidateStartIntent(entry);
  return (
    <Card
      padding="none"
      className="overflow-hidden"
      data-testid={`curated-candidate-${entry.id}`}
      data-feasibility={entry.status}
      data-publication-stage={entry.publicationStage}
    >
      <div className="flex min-h-28 items-end bg-[linear-gradient(125deg,#f5f1ea_0%,#e8e0d3_60%,#f8f6f2_100%)] p-4">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-stone-600 uppercase">
          {entry.region}
        </span>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-ink/15 px-2 py-1 text-[10px] font-medium tracking-[0.08em] uppercase">
            {STATUS_LABELS[entry.status]}
          </span>
          {entry.publicationStage !== 'published' ? (
            <PinkReadiness>{STAGE_LABELS[entry.publicationStage]}</PinkReadiness>
          ) : null}
        </div>
        <h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-ink">{entry.name}</h3>
        <p className="mt-1 text-xs text-stone-500">
          {entry.country} · {entry.difficulty} · {entry.cost_level}
        </p>
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-stone-600">
          {entry.identity_description}
        </p>
        <p className="mt-4 text-xs leading-relaxed text-stone-500">
          {entry.defining_ingredients.slice(0, 4).join(' · ')}
        </p>
        {entry.status === 'adaptable' && entry.substitutions[0] ? (
          <div className="mt-4 border-l-2 border-nonprod/45 pl-3 text-xs leading-relaxed text-stone-600">
            <strong className="font-medium text-ink">{d.original}:</strong>{' '}
            {entry.substitutions[0].original}
            <br />
            <strong className="font-medium text-ink">{d.adaptation}:</strong>{' '}
            {entry.substitutions[0].substitute}
          </div>
        ) : null}
        {intent ? (
          <Link
            className={cn(buttonClasses('primary', 'sm'), 'mt-5 w-full')}
            to={inspirationStartHref(intent)}
          >
            {entry.status === 'adaptable' ? 'Użyj adaptacji' : d.openRecipe}
          </Link>
        ) : (
          <p className="mt-5 text-xs font-medium text-nonprod">
            Niedostępne do czasu zamknięcia Mapper/process gate.
          </p>
        )}
      </div>
    </Card>
  );
}

function CuratedCollectionView({
  collection,
  ownerReviewMode,
}: {
  collection: CuratedCollection;
  ownerReviewMode: boolean;
}) {
  const entries = visibleCuratedCandidates({
    visibility: ownerReviewMode ? 'owner_review' : 'customer',
    collection,
  });
  const title = collection === 'lost_legendary' ? d.lostTitle : d.naturalTitle;
  const body = collection === 'lost_legendary' ? d.lostBody : d.naturalBody;
  return (
    <section aria-labelledby={`${collection}-heading`}>
      <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
        Kolekcja kuratorska
      </p>
      <h2
        id={`${collection}-heading`}
        className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink"
      >
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">{body}</p>
      {entries.length === 0 ? (
        <div className="mt-10 border-t border-ink/10 pt-8 text-sm text-stone-500">
          {d.noPublished}
        </div>
      ) : (
        <div className="mt-10">
          <OwnerReviewFrame enabled={ownerReviewMode}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {entries.slice(0, MAX_FEATURED).map((entry) => (
                <CandidateCard key={entry.id} entry={entry} />
              ))}
            </div>
          </OwnerReviewFrame>
        </div>
      )}
    </section>
  );
}

function FamilyCard({ family, onClick }: { family: InspirationFamily; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-32 flex-col justify-between rounded-md border border-ink/10 bg-paper p-5 text-left hover:border-ink/30"
    >
      <span className="text-xs tracking-[0.12em] text-stone-400 uppercase">
        {family.count} kierunków
      </span>
      <span className="flex items-end justify-between gap-3 text-xl font-semibold tracking-[-0.025em] text-ink">
        {family.label}
        <Icon
          name="right"
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
        />
      </span>
    </button>
  );
}

function InspirationView() {
  const [productType, setProductType] = useState<InspirationProductFilter>('all');
  const allFamilies = useMemo(() => customerFacingInspirationFamilies(productType), [productType]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<InspirationFamily | null>(null);
  const [showMore, setShowMore] = useState(false);
  const matches =
    query.trim() === ''
      ? initialDiscoveryFamilies(allFamilies)
      : searchInspirationFamilies(query, allFamilies).slice(0, MAX_FEATURED);

  if (selected !== null) {
    const directions = selected.directions.slice(0, showMore ? 10 : 6);
    return (
      <section>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setShowMore(false);
          }}
          className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-ink"
        >
          <Icon name="left" /> {d.families}
        </button>
        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">{selected.label}</h2>
        <p className="mt-2 text-sm text-stone-500">
          {d.directions} · {selected.count} pozycji w źródle
        </p>
        <div className="mt-8">
          <NonProductionMarker itemId="recipes-hub-tiles" title="Dane inspiracyjne — bez gramów">
            <div className="grid gap-3 sm:grid-cols-2">
              {directions.map((direction) => {
                const entry = direction.featuredEntry;
                return (
                  <Link
                    key={direction.id}
                    to={inspirationStartHref(flavorInspirationStartIntent(entry))}
                    className="group rounded-md border border-ink/10 bg-paper p-5 hover:border-ink/30"
                  >
                    <span className="text-xs text-stone-400">{direction.count} pomysłów</span>
                    <h3 className="mt-4 text-lg font-semibold text-ink">{direction.label}</h3>
                    <p className="mt-1 line-clamp-1 text-sm text-stone-500">{entry.flavorName}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-ink">
                      {d.use}
                      <Icon
                        name="right"
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
            {selected.directions.length > 6 ? (
              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                className={cn(buttonClasses('ghost', 'sm'), 'mt-4 w-full')}
              >
                {showMore ? d.showLess : d.showMore}
              </button>
            ) : null}
          </NonProductionMarker>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
        2 500 danych · {allFamilies.length} rodzin
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{d.inspirationTitle}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">{d.inspirationBody}</p>
      <label className="mt-6 block max-w-xs text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
        Typ produktu
        <select
          value={productType}
          onChange={(event) => {
            setProductType(event.target.value as InspirationProductFilter);
            setSelected(null);
            setShowMore(false);
          }}
          className="mt-2 min-h-11 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm font-medium tracking-normal text-ink normal-case"
        >
          <option value="all">Wszystkie typy</option>
          <option value="gelato">Gelato</option>
          <option value="sorbet">Sorbet</option>
          <option value="vegan">Vegan</option>
          <option value="protein">Proteinowe</option>
        </select>
      </label>
      <label className="mt-8 flex items-center gap-3 rounded-md border border-ink/15 bg-paper px-4 py-3 focus-within:border-ink/40">
        <Icon name="search" className="h-4 w-4 text-stone-400" />
        <span className="sr-only">{d.search}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={d.search}
          className="w-full bg-transparent text-base outline-none placeholder:text-stone-400"
        />
      </label>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {matches.map((family) => (
          <FamilyCard key={family.id} family={family} onClick={() => setSelected(family)} />
        ))}
      </div>
    </section>
  );
}

function CountriesView({ ownerReviewMode }: { ownerReviewMode: boolean }) {
  const [query, setQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const publicCountries = publicCountryNavigation();
  const previewCandidates = visibleCuratedCandidates({
    visibility: ownerReviewMode ? 'owner_review' : 'customer',
  });
  const previewCountries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of previewCandidates.filter(hasPublicCountryIdentity)) {
      counts.set(entry.country, (counts.get(entry.country) ?? 0) + 1);
    }
    return [...counts.entries()].map(([country, count]) => ({ country, count }));
  }, [previewCandidates]);
  const countries = ownerReviewMode ? previewCountries : publicCountries;
  const filtered = countries.filter((entry) =>
    entry.country.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')),
  );
  if (selectedCountry !== null) {
    const countryEntries = previewCandidates.filter(
      (entry) =>
        entry.country === selectedCountry && (ownerReviewMode || isPublishableCandidate(entry)),
    );
    return (
      <section>
        <button
          type="button"
          onClick={() => setSelectedCountry(null)}
          className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-ink"
        >
          <Icon name="left" /> {d.countries}
        </button>
        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">{selectedCountry}</h2>
        <div className="mt-8">
          {ownerReviewMode ? (
            <NonProductionMarker itemId="recipes-hub-tiles" title={d.developmentPreview}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {countryEntries.slice(0, MAX_FEATURED).map((entry) => (
                  <CandidateCard key={entry.id} entry={entry} />
                ))}
              </div>
            </NonProductionMarker>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {countryEntries.map((entry) => (
                <CandidateCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section>
      <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
        Tylko kraje z kandydatem, który przeszedł gate
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{d.countries}</h2>
      {ownerReviewMode ? (
        <div className="mt-4">
          <PinkReadiness>{d.developmentPreview}</PinkReadiness>
        </div>
      ) : null}
      <label className="mt-8 flex items-center gap-3 rounded-md border border-ink/15 px-4 py-3">
        <Icon name="search" className="h-4 w-4 text-stone-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szukaj kraju"
          className="w-full bg-transparent outline-none"
        />
      </label>
      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-stone-500">{d.countriesEmpty}</p>
      ) : (
        <div className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
          {filtered.slice(0, 20).map((entry) => (
            <button
              type="button"
              key={entry.country}
              onClick={() => setSelectedCountry(entry.country)}
              className="flex w-full items-center justify-between py-4 text-left text-sm hover:opacity-60"
            >
              <span>{entry.country}</span>
              <span className="inline-flex items-center gap-2 text-stone-400">
                {entry.count}
                <Icon name="right" />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function RecipesHubPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<DiscoveryView>('home');
  const ownerReviewMode = useReviewMode();
  const persona = useProCorePersona();
  const requestedTab = params.get('tab');
  const activeTab: RecipeLibraryTab =
    requestedTab === 'mine' || requestedTab === 'inspiration' || requestedTab === 'pinguino'
      ? requestedTab
      : 'pinguino';
  const newRecipeHref = persona === 'pro' ? '/pro/recipe' : persona === 'home' ? '/home' : '/start';
  const selectTab = (tab: RecipeLibraryTab) => {
    const next = new URLSearchParams(params);
    if (tab === 'pinguino') next.delete('tab');
    else next.set('tab', tab);
    setParams(next);
    setView('home');
  };

  return (
    <DestinationSurface
      eyebrow={d.eyebrow}
      title="Receptury"
      blurb="Twoje receptury, kolekcje PINGÜINO i inspiracje smakowe — w jednej bibliotece."
    >
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-ink/15">
        <div
          role="tablist"
          aria-label="Biblioteka receptur"
          className="flex min-w-0 overflow-x-auto"
        >
          {(
            [
              ['mine', 'MOJE'],
              ['pinguino', 'PINGÜINO'],
              ['inspiration', 'INSPIRACJE'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => selectTab(id)}
              className={cn(
                'min-h-12 shrink-0 border-b-2 px-4 text-xs font-semibold tracking-[0.08em]',
                activeTab === id ? 'border-ink text-ink' : 'border-transparent text-stone-400',
              )}
              data-testid={`recipes-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Link
          to={newRecipeHref}
          className="mb-2 text-sm font-medium text-ink transition-opacity hover:opacity-55"
        >
          + Nowa receptura
        </Link>
      </div>

      {activeTab === 'mine' ? <MyRecipesContent /> : null}
      {activeTab === 'inspiration' ? <InspirationView /> : null}
      {activeTab === 'pinguino' ? (
        <>
          {view !== 'home' ? <BackButton onClick={() => setView('home')} /> : null}
          <div className={view !== 'home' ? 'mt-10' : undefined}>
            {view === 'home' ? (
              <>
                <OwnerReviewFrame enabled={ownerReviewMode}>
                  <div className="grid gap-x-8 md:grid-cols-2">
                    <ActionCard
                      icon={<Icon name="book" className="h-5 w-5" />}
                      title={d.lostTitle}
                      body={d.lostBody}
                      onClick={() => setView('lost')}
                    />
                    <ActionCard
                      icon={<Icon name="leaf" className="h-5 w-5" />}
                      title={d.naturalTitle}
                      body={d.naturalBody}
                      onClick={() => setView('natural')}
                    />
                  </div>
                </OwnerReviewFrame>
                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setView('countries')}
                    className={buttonClasses('ghost', 'sm')}
                  >
                    <Icon name="globe" className="mr-2 h-4 w-4" />
                    {d.countries}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('natural')}
                    className={buttonClasses('ghost', 'sm')}
                  >
                    <Icon name="sparkles" className="mr-2 h-4 w-4" />
                    {d.recommended}
                  </button>
                </div>
                <p className="mt-12 border-t border-ink/10 pt-6 text-xs text-stone-400">
                  {r.gelato} · {r.sorbet} · {r.vegan} · {r.protein}
                </p>
              </>
            ) : null}
            {view === 'lost' ? (
              <CuratedCollectionView
                collection="lost_legendary"
                ownerReviewMode={ownerReviewMode}
              />
            ) : null}
            {view === 'natural' ? (
              <CuratedCollectionView collection="natural_icon" ownerReviewMode={ownerReviewMode} />
            ) : null}
            {view === 'countries' ? <CountriesView ownerReviewMode={ownerReviewMode} /> : null}
          </div>
        </>
      ) : null}
    </DestinationSurface>
  );
}
