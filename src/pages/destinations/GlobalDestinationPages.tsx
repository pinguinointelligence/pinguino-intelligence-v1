import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import {
  CommerceLock,
  DestinationEyebrow,
  DestinationSectionHead,
  ImageDirection,
  SplitHero,
} from '@/components/shared/destinationEditorial';
import { OfficialProLogo } from '@/components/shared/OfficialProLogo';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { LabelWorkspace } from '@/features/master-label/LabelWorkspace';
import { resolveLabelRepository, type RunLabelSnapshot } from '@/services/labels/labelRepository';
import { AccountRecipeDefaults } from '@/features/pro-workbench/AccountRecipeDefaults';
import { AccountProductMarkets } from '@/features/global-catalog/AccountProductMarkets';
import { GlobalCatalogSearchPanel } from '@/features/global-catalog/GlobalCatalogSearchPanel';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { ProductRequestAccountSections } from '@/features/product-requests/ProductRequestAccountSections';
import { HomeInviteRedemption } from '@/features/account/HomeInviteRedemption';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import { loadCanonicalProductionHistory } from '@/services/productionHistoryTruth';
import type { CanonicalProductionHistoryEntry } from '@/services/productionHistoryTruth';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { EmptyState } from '@/components/shared/EmptyState';

const quietLink =
  'flex min-h-14 items-center justify-between border-b border-ink/10 py-3 text-sm text-ink transition-opacity hover:opacity-55';

export function HowItWorksPage() {
  const steps = ['Pomysł', 'Składniki', 'Gellatti', 'Receptura', 'Produkcja'];
  return (
    <DestinationSurface
      eyebrow="GELLATTI"
      title="Jak to działa"
      blurb="Jedna logiczna droga od pomysłu do receptury i bezpiecznej produkcji."
    >
      <ol className="grid border-y border-ink/10 sm:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step}
            className="border-b border-ink/10 px-4 py-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <span className="font-mono text-xs text-stone-400">0{index + 1}</span>
            <strong className="mt-3 block text-sm font-medium text-ink">{step}</strong>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/start" className={buttonClasses('primary', 'md')}>
          Wypróbuj Gellatti
        </Link>
        <Link to="/subscription" className={buttonClasses('ghost', 'md')}>
          Porównaj Home i Pro
        </Link>
      </div>
    </DestinationSurface>
  );
}

/**
 * Sklep — the approved Starter Pack destination (Gellatti V2.1 §5).
 *
 * The approved design is deliberately AUTHORITY-GATED: it shows the one
 * ingredient the owner brief actually confirms and states, in the page itself,
 * that nothing else has a published Starter Pack source. Nothing here invents
 * a product, a price, a weight or an availability date, and no commerce path
 * is wired — the closing note says so in as many words.
 */
const STARTER_PACK_CONFIRMED = Object.freeze({
  name: 'Inulina',
  mass: '500 g',
  status: 'Potwierdzone',
  note: 'Neutralny koncept opakowania; bez ceny i obietnicy dostępności.',
});

function PackBox({ label, caption }: { label: string; caption?: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 bg-[var(--g-graphite)] p-8">
      <div className="flex h-[333px] w-[260px] flex-col justify-between rounded-[8px] bg-[#efe8dc] p-6 text-[var(--g-ink)]">
        <OfficialProLogo className="max-h-8" />
        <strong className="text-[22px] leading-tight font-bold whitespace-pre-line">{label}</strong>
        <span className="font-mono text-[9px] tracking-[0.08em] text-[var(--g-text-secondary)]">
          NEUTRAL PACKAGING PREVIEW
        </span>
      </div>
      {caption ? (
        <p className="max-w-[575px] text-center text-[9px] leading-[1.5] text-[#a9a69f]">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export function ShopPage() {
  return (
    <DestinationSurface title="Sklep" contextLabel="Sklep" bare>
      <SplitHero
        ratio="shop"
        eyebrow="Gellatti Shop · design concept"
        title="Gellatti Starter Pack"
        blurb="Pierwszy zestaw składników Gellatti. Zawartość jest pokazywana tylko tam, gdzie istnieje potwierdzona authority."
        note="Cena, dostępność, płatność i dostawa nie są potwierdzone."
        actions={
          <>
            <span className="inline-flex h-6 items-center rounded-full border border-[#ef8708]/35 bg-[#fff8ee] px-3 text-[9px] font-bold text-[#9a5700]">
              Wkrótce
            </span>
            <Link to="#starter-pack-content" className={buttonClasses('primary', 'sm')}>
              Zobacz zawartość
            </Link>
          </>
        }
        visual={
          <PackBox
            label={'Starter\nPack'}
            caption="Neutralny placeholder · brak zatwierdzonego zdjęcia lub packaging assetu"
          />
        }
      />

      <section className="mt-12" id="starter-pack-content">
        <DestinationSectionHead
          eyebrow="Potwierdzona zawartość"
          title="Zestaw bez wymyślonej listy."
          helper="Inulina jest jedynym składnikiem nazwanym w aktualnym owner brief. Repozytorium nie posiada potwierdzonego Starter Pack membership dla pozostałych produktów."
          trailing={
            <span className="inline-flex h-6 items-center rounded-full bg-[#f4f8f4] px-3 text-[9px] font-bold text-[#2f6b40]">
              1 potwierdzona pozycja
            </span>
          }
        />
        <div className="grid gap-3 lg:grid-cols-3">
          <article className="flex min-w-0 flex-col rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]">
            <ImageDirection
              lines={[STARTER_PACK_CONFIRMED.name, STARTER_PACK_CONFIRMED.mass]}
              className="h-[150px] w-full"
            />
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <strong className="text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
                {STARTER_PACK_CONFIRMED.name}
              </strong>
              <span className="font-mono text-[12px] text-[var(--g-text-secondary)]">
                {STARTER_PACK_CONFIRMED.mass}
              </span>
            </div>
            <span className="mt-2 inline-flex h-6 w-fit items-center rounded-full bg-[#f4f8f4] px-3 text-[9px] font-bold text-[#2f6b40]">
              {STARTER_PACK_CONFIRMED.status}
            </span>
            <p className="mt-3 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
              {STARTER_PACK_CONFIRMED.note}
            </p>
            <button type="button" className={`${buttonClasses('ghost', 'sm')} mt-4 w-fit`} disabled>
              Powiadom mnie
            </button>
          </article>

          <article className="min-w-0 rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory-deep)] p-[18px] lg:col-span-2">
            <DestinationEyebrow>Owner input required</DestinationEyebrow>
            <h3 className="mt-1 text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
              Pozostała zawartość nie została opublikowana.
            </h3>
            <p className="mt-2 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
              Nie pokazujemy nazw, gramatur, cen ani opakowań bez potwierdzonego źródła Starter
              Pack.
            </p>
          </article>
        </div>
      </section>

      {/* The approved product-detail CONCEPT: it states plainly that only the
          name and the individual-pack mass are confirmed, and that description,
          composition, claims, price and availability need their own authority. */}
      <section className="mt-12">
        <DestinationSectionHead
          eyebrow="Product-detail concept"
          title={`${STARTER_PACK_CONFIRMED.name} · ${STARTER_PACK_CONFIRMED.mass}`}
          trailing={
            <span className="inline-flex h-6 items-center rounded-full border border-[#ef8708]/35 bg-[#fff8ee] px-3 text-[9px] font-bold text-[#9a5700]">
              Preview · Wkrótce
            </span>
          }
        />
        <article className="grid min-w-0 gap-5 rounded-[12px] border border-[var(--g-line)] bg-white p-[18px] lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
          <ImageDirection
            lines={[STARTER_PACK_CONFIRMED.name, STARTER_PACK_CONFIRMED.mass]}
            className="min-h-[277px] w-full"
          />
          <div className="min-w-0">
            <DestinationEyebrow>Gellatti ingredient</DestinationEyebrow>
            <h3 className="mt-1 text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
              {STARTER_PACK_CONFIRMED.name}
            </h3>
            <p className="mt-2 max-w-[62ch] text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
              Karta pokazuje wyłącznie potwierdzoną nazwę i gramaturę individual pack. Opis
              handlowy, skład, claims, cena i dostępność wymagają osobnej authority.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['Masa', STARTER_PACK_CONFIRMED.mass],
                  ['Cena', 'Niepotwierdzona'],
                  ['Dostępność', 'Wkrótce · concept'],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-[9px] bg-[var(--g-ivory)] px-3 py-2">
                  <dt className="text-[9px] text-[var(--g-text-field-label)]">{label}</dt>
                  <dd className="mt-1 text-[12px] font-bold text-[var(--g-ink)]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={buttonClasses('ghost', 'sm')} disabled>
                Powiadom mnie
              </button>
              <Link to="#starter-pack-content" className={buttonClasses('ghost', 'sm')}>
                Wróć do Starter Pack
              </Link>
            </div>
          </div>
        </article>

        <CommerceLock>
          <b className="block text-[14px] font-bold text-[var(--g-ink)]">
            Future commerce — nieaktywne.
          </b>
          {/* The approved note names the payment provider. This repository has
              a hard boundary contract (`studioBoundary.test.ts`) forbidding that
              literal anywhere in the UI layer, and the contract wins: the same
              statement is made without naming the provider. */}
          <p className="mt-1">
            Brak checkoutu, płatności i koszyka — ta strona jest konceptem produktowym.
          </p>
        </CommerceLock>
      </section>
    </DestinationSurface>
  );
}

/**
 * Franchise — the approved ecosystem destination (Gellatti V2.1 §5).
 *
 * The four formats are enquiry CATEGORIES, and the approved page says so on
 * the page: no price, no terms and no availability promise appears anywhere.
 * Franchise stays independent of the Home/Pro plan and of the Współpraca
 * programme; both destinations remain the same mailto they already were.
 */
const FRANCHISE_CONCEPTS = [
  { mark: 'P', name: 'Punkt' },
  { mark: 'W', name: 'Wózek' },
  { mark: 'T', name: 'Przyczepa' },
  { mark: 'L', name: 'Lokal firmowy' },
] as const;

const FRANCHISE_MAILTO = 'mailto:pinguinointelligence@gmail.com?subject=Franchise%20GELLATTI';

export function FranchisePage() {
  return (
    <DestinationSurface title="Franchise" contextLabel="Franchise" bare>
      <SplitHero
        ratio="franchise"
        eyebrow="Ekosystem Gellatti"
        title="Franchise"
        blurb="Koncepty biznesowe Gellatti: punkt, wózek, przyczepa i lokal firmowy."
        actions={
          <>
            <a href={FRANCHISE_MAILTO} className={buttonClasses('primary', 'sm')}>
              Zapytaj o Franchise
            </a>
            <span className="inline-flex h-6 items-center rounded-full bg-[var(--g-ivory-deep)] px-3 text-[9px] font-bold text-[var(--g-text-secondary)]">
              Zapytanie biznesowe
            </span>
          </>
        }
        visual={
          <div className="grid grid-cols-2 bg-white">
            {FRANCHISE_CONCEPTS.map(({ mark, name }) => (
              <div
                key={name}
                className="grid min-h-[140px] place-items-center border-b border-l border-[var(--g-line)] p-5 text-center last:border-b-0"
              >
                <span>
                  <span className="mx-auto grid size-12 place-items-center rounded-[12px] border border-[var(--g-line)] text-[20px] font-medium text-[var(--g-ink)]">
                    {mark}
                  </span>
                  <strong className="mt-3 block text-[11px] font-bold text-[var(--g-ink)]">
                    {name}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        }
      />

      <section className="mt-12">
        <DestinationSectionHead
          eyebrow="Potwierdzone koncepty"
          title="Cztery formaty. Bez wymyślonych warunków."
          helper="Karty są kategoriami enquiry, nie ofertami cenowymi ani obietnicą dostępności."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {FRANCHISE_CONCEPTS.map(({ mark, name }) => (
            <article
              key={name}
              className="min-w-0 rounded-[12px] border border-[var(--g-line)] bg-white p-5"
            >
              <span className="grid size-11 place-items-center rounded-[10px] border border-[var(--g-line)] text-[18px] font-medium text-[var(--g-ink)]">
                {mark}
              </span>
              <h3 className="mt-4 text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                {name}
              </h3>
              <p className="mt-2 max-w-[62ch] text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                Kategoria obecna w aktualnym projekcie. Szczegóły wymagają rozmowy i potwierdzonej
                authority.
              </p>
              <a href={FRANCHISE_MAILTO} className={`${buttonClasses('ghost', 'sm')} mt-4 w-fit`}>
                Zapytaj o ten koncept
              </a>
            </article>
          ))}
        </div>
      </section>
    </DestinationSurface>
  );
}

export function ProductsHubPage() {
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  const canAdmin = useProCoreAccessStore((state) => state.effectiveAccess?.canAdmin === true);
  return (
    <DestinationSurface
      eyebrow="Katalog Gellatti"
      title="Produkty"
      blurb="Produkty, ich zastosowanie, dostępność i Twoja cena — wszystko w jednym miejscu."
      contextLabel="Produkty"
      actions={
        capabilities.canSaveRecipe ? (
          <div className="flex flex-wrap items-center gap-2">
            {canAdmin ? (
              <Link to="/products/import" className={buttonClasses('ghost', 'sm')}>
                Import administracyjny
              </Link>
            ) : null}
            <Link to="/products/scan" className={applicationPrimaryClasses()}>
              Skanuj produkt
            </Link>
          </div>
        ) : null
      }
    >
      {!capabilities.canSaveRecipe ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Katalog produktów otwiera się w planach Home i Pro. Wybierz plan, aby dodać własne
          produkty
        </p>
      ) : (
        <>
          <GlobalCatalogSearchPanel />
          <p className="mt-8 max-w-xl text-xs leading-relaxed text-stone-500">
            Twoja cena, dostawca, notatki i stan magazynowy pozostają prywatne.
          </p>
        </>
      )}
    </DestinationSurface>
  );
}

type ProductionTab = 'current' | 'history' | 'labels';
const productionTabs: readonly { id: ProductionTab; label: string }[] = [
  { id: 'current', label: 'Bieżąca' },
  { id: 'history', label: 'Historia' },
  { id: 'labels', label: 'Etykiety' },
];

export function ProductionHubPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active: ProductionTab = productionTabs.some((tab) => tab.id === requested)
    ? (requested as ProductionTab)
    : 'current';
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  const user = useAuthStore((state) => state.user);
  const session = useProductionSessionStore((state) => state.session);
  const activeSnapshot = session?.status === 'completed' ? session.completionSnapshot : null;
  const productionRepositoryState = useMemo(() => resolveProductionRepository(), []);
  const labelRepository = useMemo(() => resolveLabelRepository(), []);
  const [historyLoad, setHistoryLoad] = useState<{
    ownerUserId: string | null;
    entries: CanonicalProductionHistoryEntry[];
    state: 'loading' | 'ready' | 'error';
  }>({ ownerUserId: null, entries: [], state: 'loading' });
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    if (!capabilities.canUseProductionMode) return;
    if (!user?.id || !productionRepositoryState.repository) return;
    let cancelled = false;
    void loadCanonicalProductionHistory({
      productionRepository: productionRepositoryState.repository,
      labelRepository,
      ownerUserId: user.id,
    })
      .then((result) => {
        if (cancelled) return;
        setHistoryLoad({
          ownerUserId: user.id,
          entries: result.entries,
          state: result.unresolvedRunIds.length > 0 ? 'error' : 'ready',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryLoad({ ownerUserId: user.id, entries: [], state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [
    capabilities.canUseProductionMode,
    historyRevision,
    labelRepository,
    productionRepositoryState.repository,
    user?.id,
  ]);

  const history = historyLoad.ownerUserId === user?.id ? historyLoad.entries : [];
  const historyState =
    !user?.id || !productionRepositoryState.repository
      ? 'error'
      : historyLoad.ownerUserId === user.id
        ? historyLoad.state
        : 'loading';
  const labelSnapshot = activeSnapshot ?? history[0]?.snapshot ?? null;

  return (
    <DestinationSurface
      eyebrow="Gellatti Pro"
      title="Produkcja"
      blurb="Bieżąca partia, zapis zakończonych produkcji i etykiety — zawsze oparte na tych samych danych."
      contextLabel="Produkcja"
    >
      {!capabilities.canUseProductionMode ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Produkcja jest dostępna w planie Pro
        </p>
      ) : (
        <>
          <div role="tablist" aria-label="Sekcje produkcji" className="flex border-b border-ink/15">
            {productionTabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`production-hub-${tab.id}-tab`}
                aria-controls={`production-hub-${tab.id}-panel`}
                aria-selected={active === tab.id}
                tabIndex={active === tab.id ? 0 : -1}
                onClick={() => setParams(tab.id === 'current' ? {} : { tab: tab.id })}
                onKeyDown={(event) => {
                  let nextIndex: number | null = null;
                  if (event.key === 'ArrowRight') nextIndex = (index + 1) % productionTabs.length;
                  else if (event.key === 'ArrowLeft')
                    nextIndex = (index - 1 + productionTabs.length) % productionTabs.length;
                  else if (event.key === 'Home') nextIndex = 0;
                  else if (event.key === 'End') nextIndex = productionTabs.length - 1;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  const next = productionTabs[nextIndex]!;
                  setParams(next.id === 'current' ? {} : { tab: next.id });
                  queueMicrotask(() =>
                    document.getElementById(`production-hub-${next.id}-tab`)?.focus(),
                  );
                }}
                className={cn(
                  'min-h-11 border-b-2 px-4 text-xs font-semibold sm:min-h-10',
                  active === tab.id ? 'border-ink text-ink' : 'border-transparent text-stone-600',
                )}
                data-testid={`production-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {active === 'current' ? (
            <section
              id="production-hub-current-panel"
              role="tabpanel"
              aria-labelledby="production-hub-current-tab"
              className="py-8"
              data-testid="production-current"
            >
              <h2 className="text-xl font-semibold text-ink">Bieżąca produkcja</h2>
              {session?.status === 'in_progress' ? (
                <>
                  <p className="mt-2 text-sm text-stone-600">
                    {session.source.recipeName} · rozpoczęto{' '}
                    {new Date(session.startedAt).toLocaleString('pl-PL')}
                  </p>
                  <Link to="/pro/production" className={cn(buttonClasses('primary', 'md'), 'mt-6')}>
                    Wróć do bieżącej partii
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-2 max-w-xl text-sm text-stone-600">
                    Otwórz recepturę i przejdź do jej zakładki Produkcja, aby rozpocząć nową partię
                  </p>
                  <Link to="/pro/recipe" className={cn(buttonClasses('primary', 'md'), 'mt-6')}>
                    Otwórz Gellatti Pro
                  </Link>
                </>
              )}
            </section>
          ) : null}

          {active === 'history' ? (
            <section
              id="production-hub-history-panel"
              role="tabpanel"
              aria-labelledby="production-hub-history-tab"
              className="py-8"
              data-testid="production-history"
            >
              <h2 className="text-xl font-semibold text-ink">Historia produkcji</h2>
              {historyState === 'loading' ? (
                <p className="mt-5 text-sm text-stone-500" role="status">
                  Sprawdzamy zakończone partie…
                </p>
              ) : null}
              {historyState === 'error' ? (
                <WorkflowNotice
                  className="mt-5"
                  variant="blocking"
                  role="alert"
                  title="Nie mamy teraz pełnej historii produkcji"
                  description="Dane partii są bezpieczne. Spróbuj ponownie."
                  action={
                    <button
                      type="button"
                      className={buttonClasses('ghost', 'sm')}
                      onClick={() => {
                        setHistoryLoad((current) => ({ ...current, state: 'loading' }));
                        setHistoryRevision((current) => current + 1);
                      }}
                    >
                      Spróbuj ponownie
                    </button>
                  }
                />
              ) : null}
              {history.map(({ run, snapshot }) => (
                <div
                  key={run.runId}
                  className="mt-6 border-y border-ink/10 py-5"
                  data-production-run-id={run.runId}
                >
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <strong className="text-base text-ink">{snapshot.source.recipeName}</strong>
                      <p className="mt-1 text-xs text-stone-500">
                        {new Date(snapshot.productionCompletedAt).toLocaleString('pl-PL')} · wersja{' '}
                        {snapshot.source.recipeVersionNumber ?? '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block font-mono text-lg font-semibold tabular-nums">
                        {snapshot.actualFinalMassG.toFixed(1)} g
                      </span>
                      <span className="text-xs text-stone-500">
                        planowano {snapshot.originalBatchTargetG.toFixed(1)} g
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/labels?run=${encodeURIComponent(run.runId)}`}
                    className={cn(buttonClasses('ghost', 'sm'), 'mt-5')}
                  >
                    Otwórz etykietę
                  </Link>
                </div>
              ))}
              {historyState === 'ready' && history.length === 0 ? (
                <EmptyState
                  className="mt-5"
                  title="Nie masz jeszcze zakończonych partii"
                  body="Po zakończeniu produkcji partia pojawi się tutaj."
                />
              ) : null}
            </section>
          ) : null}

          {active === 'labels' ? (
            <section
              id="production-hub-labels-panel"
              role="tabpanel"
              aria-labelledby="production-hub-labels-tab"
              className="py-8"
              data-testid="production-labels"
            >
              <h2 className="text-xl font-semibold text-ink">Etykiety z zakończonych partii</h2>
              {labelSnapshot ? (
                <div className="mt-6 border border-ink/10">
                  <LabelWorkspace snapshot={labelSnapshot} />
                </div>
              ) : (
                <p className="mt-5 text-sm text-stone-500">
                  Etykieta pojawi się dopiero po zakończeniu produkcji i zatwierdzeniu danych
                  partii.
                </p>
              )}
            </section>
          ) : null}
        </>
      )}
    </DestinationSurface>
  );
}

export function LabelsHubPage() {
  const [params, setParams] = useSearchParams();
  const requestedRunId = params.get('run');
  const requestedSnapshotId = params.get('snapshot');
  const repository = useMemo(() => resolveLabelRepository(), []);
  const session = useProductionSessionStore((state) => state.session);
  const activeSnapshot = session?.status === 'completed' ? session.completionSnapshot : null;
  const [history, setHistory] = useState<RunLabelSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    void repository
      .listRunLabelSnapshots()
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const selectedActive =
    activeSnapshot && (!requestedRunId || requestedRunId === activeSnapshot.sessionId)
      ? activeSnapshot
      : null;
  const requestedHistoryItem = requestedSnapshotId
    ? (history.find((item) => item.snapshotId === requestedSnapshotId) ?? null)
    : null;
  const selectedRunId =
    requestedHistoryItem?.runId ??
    requestedRunId ??
    selectedActive?.sessionId ??
    history[0]?.runId ??
    null;
  const selectedSnapshotId =
    requestedHistoryItem?.snapshotId ??
    (!requestedRunId && !selectedActive ? (history[0]?.snapshotId ?? null) : null);

  return (
    <DestinationSurface
      eyebrow="Konto / Etykiety"
      title="Ustawienia etykiety"
      blurb="Domyślny profil, dane firmy, układ i drukarka — niezależnie od trwającej receptury lub Produkcji."
      contextLabel="Ustawienia etykiety"
    >
      <LabelWorkspace profileOnly repository={repository} />

      <section className="mt-10 border-t border-ink/10 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">Etykieta zakończonej partii</h2>
            <p className="mt-1 text-sm text-stone-500">
              Dane etykiety pochodzą wyłącznie z zatwierdzonego wyniku tej partii
            </p>
          </div>
          {history.length > 0 ? (
            <nav
              aria-label="Historia etykiet"
              className="flex max-w-full gap-2 overflow-x-auto pb-1"
            >
              {history.map((item) => (
                <Link
                  key={item.snapshotId}
                  to={`/labels?run=${encodeURIComponent(item.runId)}&snapshot=${encodeURIComponent(item.snapshotId)}`}
                  className={cn(
                    buttonClasses(
                      item.snapshotId === selectedSnapshotId ? 'primary' : 'ghost',
                      'sm',
                    ),
                    'min-h-11 shrink-0',
                  )}
                >
                  {new Date(item.createdAt).toLocaleDateString('pl-PL')} · v{item.version}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
        <div className="mt-6">
          <LabelWorkspace
            snapshot={selectedActive}
            runId={selectedRunId}
            savedSnapshotId={selectedSnapshotId}
            repository={repository}
            onSaved={(item) => {
              setHistory((current) => [
                item,
                ...current.filter((entry) => entry.snapshotId !== item.snapshotId),
              ]);
              setParams({ run: item.runId, snapshot: item.snapshotId });
            }}
          />
        </div>
      </section>
    </DestinationSurface>
  );
}

export function AccountSettingsPage() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const persona = useProCorePersona();
  const plan =
    persona === 'pro' ? 'Plan Pro' : persona === 'home' ? 'Plan Home' : 'Brak aktywnego planu';
  return (
    <DestinationSurface
      eyebrow="Konto"
      title="Konto i ustawienia"
      blurb="Twój profil, plan i najważniejsze ustawienia konta."
      contextLabel="Konto"
    >
      {status !== 'authed' && !import.meta.env.DEV ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Zaloguj się, aby zarządzać kontem
        </p>
      ) : (
        <div className="divide-y divide-ink/10 overflow-hidden rounded-[12px] border border-ink/12 bg-white shadow-pro-e0">
          <div className="flex items-center justify-between gap-4 px-5 py-5">
            <span className="text-sm text-stone-500">Profil</span>
            <strong className="truncate text-sm font-medium">
              {user?.email ?? 'owner-review@pinguino.local'}
            </strong>
          </div>
          <Link to="/subscription" className={cn(quietLink, 'px-5')}>
            <span>
              <span className="block text-xs text-stone-500">Plan i płatności</span>
              <strong className="mt-1 block font-medium">{plan}</strong>
            </span>
            <span aria-hidden>→</span>
          </Link>
          <div className="flex items-center justify-between gap-4 px-5 py-5">
            <span className="text-sm text-stone-500">Język</span>
            <strong className="text-sm font-medium">Polski</strong>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-5">
            <span className="text-sm text-stone-500">Bezpieczeństwo</span>
            <span className="text-sm text-stone-600">Ustawienia konta</span>
          </div>
          <AccountProductMarkets />
          <HomeInviteRedemption />
          <ProductRequestAccountSections />
          <AccountRecipeDefaults />
        </div>
      )}
    </DestinationSurface>
  );
}
