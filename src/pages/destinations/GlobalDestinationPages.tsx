import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
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

export function ShopPage() {
  return (
    <DestinationSurface
      eyebrow="Ekosystem Gellatti"
      title="Sklep"
      blurb="Jedno miejsce na zestawy startowe, składniki i przyszłe produkty Gellatti."
    >
      <div className="border-y border-ink/10 py-8">
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          Katalog zakupowy nie jest jeszcze połączony z tym wydaniem. Nawigacja i własność sklepu są
          już jednoznaczne; aplikacja nie pokazuje fikcyjnych produktów ani cen.
        </p>
      </div>
    </DestinationSurface>
  );
}

export function FranchisePage() {
  return (
    <DestinationSurface
      eyebrow="Ekosystem Gellatti"
      title="Franchise"
      blurb="Koncepty biznesowe Gellatti: punkt, wózek, przyczepa i lokal firmowy."
    >
      <div className="border-y border-ink/10 py-8">
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          Franchise jest niezależne od planu Home lub Pro. Ten kierunek prowadzi do zapytania
          biznesowego i nie miesza się z programem Współpraca.
        </p>
        <a
          href="mailto:pinguinointelligence@gmail.com?subject=Franchise%20GELLATTI"
          className={cn(buttonClasses('ghost', 'md'), 'mt-6')}
        >
          Zapytaj o Franchise
        </a>
      </div>
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
    >
      {!capabilities.canSaveRecipe ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Katalog produktów jest dostępny w Gellatti Home i Pro.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">
                Katalog produktów
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Zatwierdzony katalog Gellatti. Nieznany produkt możesz przesłać do weryfikacji
                Admina.
              </p>
            </div>
            <Link
              to="/products/scan"
              className="min-h-11 px-2 py-3 text-xs font-medium tracking-label text-ink uppercase transition-opacity hover:opacity-55"
            >
              Skanuj produkt
            </Link>
          </div>
          <div className="mt-2">
            <Link to="/products/scan" className={quietLink}>
              <span>
                <strong className="block font-medium">Skanuj produkt</strong>
                <span className="mt-1 block text-xs text-stone-500">
                  Kamera, zdjęcia, kod kreskowy i bezpieczne uzupełnianie danych
                </span>
              </span>
              <span aria-hidden>→</span>
            </Link>
            {canAdmin ? (
              <Link to="/products/import" className={quietLink}>
                <span>
                  <strong className="block font-medium">Import administracyjny</strong>
                  <span className="mt-1 block text-xs text-stone-500">
                    Kontrolowana ścieżka back-office dostępna tylko w trybie Admin
                  </span>
                </span>
                <span aria-hidden>→</span>
              </Link>
            ) : null}
          </div>
          <GlobalCatalogSearchPanel />
          <p className="mt-8 max-w-xl text-xs leading-relaxed text-stone-500">
            Prywatna cena klienta pozostaje własnością istniejącego modelu danych. Ten hub nie
            tworzy drugiego magazynu cen.
          </p>
        </>
      )}
    </DestinationSurface>
  );
}

type ProductionTab = 'current' | 'history' | 'labels';
const productionTabs: readonly { id: ProductionTab; label: string }[] = [
  { id: 'current', label: 'BIEŻĄCA' },
  { id: 'history', label: 'HISTORIA' },
  { id: 'labels', label: 'ETYKIETY' },
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
      blurb="Bieżąca partia, zamrożona historia wykonania i etykiety z faktycznej produkcji."
    >
      {!capabilities.canUseProductionMode ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Produkcja jest funkcją planu Pro.
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
                  'min-h-12 border-b-2 px-4 text-xs font-semibold tracking-[0.08em]',
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
                    Otwórz recepturę i przejdź do jej zakładki Produkcja, aby rozpocząć nową partię.
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
                  title="Nie udało się odczytać pełnej historii produkcji"
                  description="Dane partii pozostały bez zmian. Spróbuj ponownie."
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
      eyebrow="Gellatti Pro"
      title="Etykiety"
      blurb="Jedno miejsce dla domyślnego profilu konta i niezmiennych etykiet z faktycznie zakończonych partii."
    >
      <LabelWorkspace profileOnly repository={repository} />

      <section className="mt-10 border-t border-ink/10 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">Etykieta zakończonej partii</h2>
            <p className="mt-1 text-sm text-stone-500">
              Etykieta korzysta wyłącznie z zatwierdzonych danych zakończonej partii.
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
      blurb="Profil, plan i ustawienia poziomu konta — bez duplikowania Maszyny, Produktów ani receptury."
    >
      {status !== 'authed' && !import.meta.env.DEV ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Zaloguj się, aby zarządzać kontem.
        </p>
      ) : (
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          <div className="flex items-center justify-between gap-4 py-5">
            <span className="text-sm text-stone-500">Profil</span>
            <strong className="truncate text-sm font-medium">
              {user?.email ?? 'owner-review@pinguino.local'}
            </strong>
          </div>
          <Link to="/subscription" className={quietLink}>
            <span>
              <span className="block text-xs text-stone-500">Plan i płatności</span>
              <strong className="mt-1 block font-medium">{plan}</strong>
            </span>
            <span aria-hidden>→</span>
          </Link>
          <div className="flex items-center justify-between gap-4 py-5">
            <span className="text-sm text-stone-500">Język</span>
            <strong className="text-sm font-medium">Polski</strong>
          </div>
          <div className="flex items-center justify-between gap-4 py-5">
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
