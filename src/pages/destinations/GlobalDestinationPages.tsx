import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
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
import {
  DestinationHero,
  DestinationSection,
  DestinationSectionHead,
} from '@/components/shared/destinationEditorial';
import { ShopCatalog } from '@/features/shop/ShopCatalog';
import { ShopCartCount } from '@/features/shop/ShopCartCount';
import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import { useHomeEntitlement } from '@/features/home-creator/useHomeEntitlement';
import { ShopOrdersPanel } from '@/features/shop/ShopOrdersPanel';
import { shopCopy } from '@/copy/shop';
import { FranchiseInquiryForm } from '@/features/franchise/FranchiseInquiryForm';
import { OwnerAssetImage } from '@/features/work-with-us/OwnerAssetImage';
import {
  FRANCHISE_CONCEPT_INITIAL,
  FRANCHISE_CONCEPT_ORDER,
  franchiseConceptLabelPl,
} from '@/features/franchise/franchiseConcepts';

/** One panel for each account concern — same card as the rest of the product. */
const ACCOUNT_PANEL =
  'rounded-[12px] border border-[var(--g-line)] bg-white px-5 [&>section]:py-0 [&>section]:first:pt-5 [&>section]:last:pb-5';

const quietLink =
  'flex min-h-14 items-center justify-between border-b border-[var(--g-line)] py-3 text-sm text-ink transition-opacity hover:opacity-55';

export function HowItWorksPage() {
  const steps = ['Pomysł', 'Składniki', 'Gellatti', 'Receptura', 'Produkcja'];
  return (
    <DestinationSurface
      eyebrow="GELLATTI"
      title="Jak to działa"
      blurb="Jedna logiczna droga od pomysłu do receptury i bezpiecznej produkcji."
    >
      {/* The same numbered rail Współpraca uses for „Jak to działa" — one
          pattern for one idea, rather than a second near-identical one. The
          steps keep their existing labels; no explanatory copy is invented
          here. */}
      <DestinationSectionHead
        eyebrow="Droga receptury"
        title="Pięć kroków, od pomysłu do gotowej partii."
      />
      <ol className="grid border-y border-[var(--g-line)] sm:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step}
            className="border-b border-[var(--g-line)] px-5 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
          >
            <span className="font-mono text-[12px] text-[var(--g-text-muted)]">0{index + 1}</span>
            <strong className="mt-3 block text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
              {step}
            </strong>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
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

export function ShopPage() {
  const entitlement = useHomeEntitlement();
  return (
    <DestinationSurface
      eyebrow={shopCopy.page.eyebrow}
      title={shopCopy.page.title}
      blurb={shopCopy.page.blurb}
      contextLabel={shopCopy.page.contextLabel}
      /* The Shop declares no header geometry of its own. It hands HOME | PRO
         to the shared shell, which since #76 places non-workbench actions at
         the trailing edge of the left work column — the one global position.
         The basket stays BELOW that row, on the Shop's own utility line.

         NEUTRAL: the Shop is a destination, not HOME. `activeView="home"` marked
         HOME as the current page while a visitor read a commercial page, which
         is the claim the owner ruled out for every global destination. Both
         segments stay visible; neither presents as current. */
      headerActions={<HomeProSwitch entitlement={entitlement} activeView={null} />}
      bare
    >
      {/* SHOP C3 (owner approved 2026-08-31, product emphasis 2026-09-01).
          Utility line → ONE Zestaw Startowy → W zestawie → Kup osobno.
          No hero, no duplicate product block, no Shop top navigation. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] leading-[1.25] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
            {shopCopy.page.introEyebrow}
          </p>
          <p className="mt-2 text-[15px] text-[var(--g-text-secondary)] md:text-[16.5px]">
            {shopCopy.page.introLine}
          </p>
        </div>
        <a
          href="#shop-cart"
          className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-[var(--g-line)] px-3.5 py-[7px] text-[12px] font-semibold text-[var(--g-ink)] transition-colors hover:border-[var(--g-line-strong)] md:px-4 md:py-2 md:text-[12.5px]"
          data-testid="shop-cart-link"
        >
          {shopCopy.page.cartLink}
          <b className="font-mono text-[12px] font-semibold text-[var(--g-text-secondary)] tabular-nums">
            <ShopCartCount />
          </b>
        </a>
      </div>
      <div className="mt-6 md:mt-12">
        <ShopCatalog />
      </div>
    </DestinationSurface>
  );
}

export function FranchisePage() {
  return (
    <DestinationSurface
      eyebrow="Ekosystem Gellatti"
      title="Franchise"
      blurb="Koncepty biznesowe Gellatti: lokal firmowy, przyczepa, wózek i punkt."
      contextLabel="Franchise"
      bare
    >
      {/* GELLATTI V2.1 §5 — the approved Franchise hero: 380 px band, 1.1 / 0.9
          split, 66 px inset, the four concepts as the right half. The concepts,
          the anchor CTA and the inquiry form below are unchanged. */}
      <DestinationHero
        variant="franchise"
        eyebrow="Ekosystem Gellatti"
        title="Franchise"
        blurb="Koncepty biznesowe Gellatti: lokal firmowy, przyczepa, wózek i punkt."
        note="Franchise jest niezależne od planu Home lub Pro. Ten kierunek prowadzi do zapytania biznesowego i nie miesza się z programem Współpraca."
        actions={
          <a href="#franchise-inquiry" className={buttonClasses('primary', 'md')}>
            Zapytaj o Franchise
          </a>
        }
        visual={
          /* F01 — the owner's Franchise hero. It replaces the four abstract
             initial tiles that stood here while no photograph existed: a real
             Gellatti interior says what the lane is faster than four lettered
             boxes, and the concepts keep their own section below. */
          <div className="h-full min-h-[240px] overflow-hidden bg-white">
            <OwnerAssetImage id="F01" priority sizes="(min-width: 1024px) 45vw, 100vw" />
          </div>
        }
      />
      <DestinationSection>
        <DestinationSectionHead
          eyebrow="Potwierdzone koncepty"
          title="Cztery formaty. Bez wymyślonych warunków."
          helper="Karty są kategoriami enquiry, nie ofertami cenowymi ani obietnicą dostępności."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {FRANCHISE_CONCEPT_ORDER.map((concept) => (
            <article
              key={concept}
              className="rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]"
            >
              <span className="grid size-11 place-items-center rounded-[10px] border border-[var(--g-line)] text-lg">
                {FRANCHISE_CONCEPT_INITIAL[concept]}
              </span>
              <h3 className="mt-4 text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                {franchiseConceptLabelPl(concept)}
              </h3>
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                Szczegóły wymagają rozmowy i potwierdzonego źródła.
              </p>
            </article>
          ))}
        </div>
      </DestinationSection>
      <DestinationSection>
        <div className="grid gap-px overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-line)] lg:grid-cols-2">
          <figure className="bg-white">
            <div className="aspect-[16/10] overflow-hidden">
              <OwnerAssetImage id="F03" sizes="(min-width: 1024px) 45vw, 100vw" />
            </div>
            <figcaption className="px-5 py-4 text-[12px] leading-relaxed text-[var(--g-text-muted)]">
              Lokal od ulicy. Wygląd i układ ustalamy przy konkretnym miejscu.
            </figcaption>
          </figure>
          <figure className="bg-white">
            <div className="aspect-[16/10] overflow-hidden">
              <OwnerAssetImage id="W04" sizes="(min-width: 1024px) 45vw, 100vw" />
            </div>
            <figcaption className="px-5 py-4 text-[12px] leading-relaxed text-[var(--g-text-muted)]">
              Sala i ogródek. Skalę dobieramy do lokalu, nie odwrotnie.
            </figcaption>
          </figure>
        </div>
      </DestinationSection>
      <DestinationSection>
        <FranchiseInquiryForm />
      </DestinationSection>
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
        /* This was a bare sentence between two hairlines that told the reader to
           choose a plan and then gave them no way to choose one. It is now the
           approved gate surface with the action it was missing. */
        <WorkflowNotice
          eyebrow="Produkty"
          title="Katalog produktów otwiera się w planach Home i Pro"
          description="Dodawaj własne produkty, swoje ceny i dane odżywcze — w jednym katalogu."
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <Link to="/subscription" className={buttonClasses('primary', 'sm')}>
              Zobacz plany
            </Link>
          }
          testId="products-plan-gate"
        />
      ) : (
        <>
          <GlobalCatalogSearchPanel />
          <p className="mt-8 max-w-xl text-xs leading-relaxed text-[var(--g-text-secondary)]">
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
        <WorkflowNotice
          eyebrow="Produkcja"
          title="Produkcja jest dostępna w planie Pro"
          description="Prowadzi przez ważenie, odchylenia i zakończenie partii — a potem wydaje etykietę."
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <Link to="/subscription" className={buttonClasses('primary', 'sm')}>
              Zobacz plany
            </Link>
          }
          testId="production-plan-gate"
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Sekcje produkcji"
            className="flex border-b border-[var(--g-line)]"
          >
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
                  active === tab.id
                    ? 'border-ink text-ink'
                    : 'border-transparent text-[var(--g-text-secondary)]',
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
                  <p className="mt-2 text-sm text-[var(--g-text-secondary)]">
                    {session.source.recipeName} · rozpoczęto{' '}
                    {new Date(session.startedAt).toLocaleString('pl-PL')}
                  </p>
                  <Link to="/pro/production" className={cn(buttonClasses('primary', 'md'), 'mt-6')}>
                    Wróć do bieżącej partii
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-2 max-w-xl text-sm text-[var(--g-text-secondary)]">
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
                <p className="mt-5 text-sm text-[var(--g-text-secondary)]" role="status">
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
                  className="mt-6 border-y border-[var(--g-line)] py-5"
                  data-production-run-id={run.runId}
                >
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <strong className="text-base text-ink">{snapshot.source.recipeName}</strong>
                      <p className="mt-1 text-xs text-[var(--g-text-secondary)]">
                        {new Date(snapshot.productionCompletedAt).toLocaleString('pl-PL')} · wersja{' '}
                        {snapshot.source.recipeVersionNumber ?? '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block font-mono text-lg font-semibold tabular-nums">
                        {snapshot.actualFinalMassG.toFixed(1)} g
                      </span>
                      <span className="text-xs text-[var(--g-text-secondary)]">
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
                <div className="mt-6 border border-[var(--g-line)]">
                  {/* Completed-batch VIEWER. Settings live on Etykiety
                      (`/labels`), so this instance points there rather than
                      opening a second copy of them. */}
                  <LabelWorkspace snapshot={labelSnapshot} settingsHome="production" />
                </div>
              ) : (
                <p className="mt-5 text-sm text-[var(--g-text-secondary)]">
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
      eyebrow="Gellatti Pro"
      title="Etykiety"
      blurb="Profil konta i etykiety zakończonych partii — w jednym, spójnym miejscu."
      contextLabel="Ustawienia etykiety"
      /* OWNER DECISION (2026-08-30): this page is the one home for persistent
         label settings, so it owes the reader a way back to the recipe they
         came from. `/pro/recipe` is the existing workbench route — no new
         navigation authority is introduced. */
      actions={
        <Link to="/pro/recipe" className={buttonClasses('ghost', 'sm')}>
          Wróć do receptury
        </Link>
      }
    >
      <LabelWorkspace profileOnly repository={repository} />

      <section className="mt-10 border-t border-[var(--g-line)] pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">Etykieta zakończonej partii</h2>
            <p className="mt-1 text-sm text-[var(--g-text-secondary)]">
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
        /* A dead end is not a state: the account page offers the way in rather
           than describing it — now on the approved gate surface instead of a
           sentence floating between two hairlines. */
        <WorkflowNotice
          eyebrow="Konto"
          title="Zaloguj się, aby zarządzać kontem"
          description="Twój profil, plan i ustawienia czekają po zalogowaniu."
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <button
              type="button"
              onClick={() => useAuthModalStore.getState().open()}
              className={buttonClasses('primary', 'sm')}
            >
              Zaloguj się
            </button>
          }
          testId="account-sign-in-gate"
        />
      ) : (
        /* Six unrelated concerns used to share ONE `divide-y` card: the profile
           rows, product markets, the invite code, product requests and recipe
           defaults all ran together as an endless list of hairlines. They are
           separate things a reader visits for separate reasons, so each now
           sits in its own panel on the standard rhythm — and each keeps its own
           action beside its own controls. */
        <div className="space-y-3">
          <div className="divide-y divide-[var(--g-line)] overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-white">
            <div className="flex items-center justify-between gap-4 px-5 py-5">
              <span className="text-sm text-[var(--g-text-secondary)]">Profil</span>
              <strong className="truncate text-sm font-medium">
                {user?.email ?? 'owner-review@pinguino.local'}
              </strong>
            </div>
            <Link to="/subscription" className={cn(quietLink, 'px-5')}>
              <span>
                <span className="block text-xs text-[var(--g-text-secondary)]">
                  Plan i płatności
                </span>
                <strong className="mt-1 block font-medium">{plan}</strong>
              </span>
              <span aria-hidden>→</span>
            </Link>
            <div className="flex items-center justify-between gap-4 px-5 py-5">
              <span className="text-sm text-[var(--g-text-secondary)]">Język</span>
              <strong className="text-sm font-medium">Polski</strong>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-5">
              <span className="text-sm text-[var(--g-text-secondary)]">Bezpieczeństwo</span>
              <span className="text-sm text-[var(--g-text-secondary)]">Ustawienia konta</span>
            </div>
          </div>
          <div className={ACCOUNT_PANEL}>
            <AccountProductMarkets />
          </div>
          <div className={ACCOUNT_PANEL}>
            <HomeInviteRedemption />
          </div>
          <div className={ACCOUNT_PANEL}>
            <ProductRequestAccountSections />
          </div>
          <div className={ACCOUNT_PANEL}>
            <AccountRecipeDefaults />
          </div>
        </div>
      )}
      {status === 'authed' ? (
        <section className="mt-[58px]" aria-labelledby="account-orders">
          <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
            Sklep
          </span>
          <h2
            id="account-orders"
            className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]"
          >
            {shopCopy.orders.title}
          </h2>
          <div className="mt-5">
            <ShopOrdersPanel />
          </div>
        </section>
      ) : null}
    </DestinationSurface>
  );
}
