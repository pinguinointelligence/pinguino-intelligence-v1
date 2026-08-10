import { Link, useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { MasterLabelEditor } from '@/features/master-label/MasterLabelEditor';

const quietLink =
  'flex min-h-14 items-center justify-between border-b border-ink/10 py-3 text-sm text-ink transition-opacity hover:opacity-55';

export function HowItWorksPage() {
  const steps = ['Pomysł', 'Składniki', 'PINGÜINO', 'Receptura', 'Produkcja'];
  return (
    <DestinationSurface
      eyebrow="PINGÜINO"
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
          Wypróbuj PINGÜINO
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
      eyebrow="Ekosystem PINGÜINO"
      title="Sklep"
      blurb="Jedno miejsce na zestawy startowe, składniki i przyszłe produkty PINGÜINO."
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
      eyebrow="Ekosystem PINGÜINO"
      title="Franchise"
      blurb="Koncepty biznesowe PINGÜINO: punkt, wózek, przyczepa i lokal firmowy."
    >
      <div className="border-y border-ink/10 py-8">
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          Franchise jest niezależne od planu Home lub Pro. Ten kierunek prowadzi do zapytania
          biznesowego i nie miesza się z programem Współpraca.
        </p>
        <a
          href="mailto:pinguinointelligence@gmail.com?subject=Franchise%20PINGUINO"
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
  return (
    <DestinationSurface
      eyebrow="Katalog klienta"
      title="Produkty"
      blurb="Produkty, dopasowanie Mapper, dostępność i prywatna cena — w jednym kanonicznym miejscu."
    >
      {!capabilities.canSaveRecipe ? (
        <p className="border-y border-ink/10 py-8 text-sm text-stone-600">
          Katalog produktów jest dostępny w PINGÜINO Home i Pro.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Twoje produkty</h2>
              <p className="mt-1 text-sm text-stone-500">
                Jedna biblioteka; wszystkie metody dodawania trafiają do tego samego procesu intake.
              </p>
            </div>
            <Link
              to="/create-ingredient"
              className="min-h-11 px-2 py-3 text-xs font-medium tracking-label text-ink uppercase transition-opacity hover:opacity-55"
            >
              + Dodaj produkt
            </Link>
          </div>
          <div className="mt-2">
            <Link to="/create-ingredient" className={quietLink}>
              <span>
                <strong className="block font-medium">Ręcznie lub ze zdjęcia etykiety</strong>
                <span className="mt-1 block text-xs text-stone-500">
                  Formularz produktu i istniejąca ścieżka OCR
                </span>
              </span>
              <span aria-hidden>→</span>
            </Link>
            <Link to="/products/import" className={quietLink}>
              <span>
                <strong className="block font-medium">Importuj tabelę lub plik</strong>
                <span className="mt-1 block text-xs text-stone-500">
                  Istniejąca walidowana ścieżka importu
                </span>
              </span>
              <span aria-hidden>→</span>
            </Link>
          </div>
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
  const session = useProductionSessionStore((state) => state.session);
  const snapshot = session?.status === 'completed' ? session.completionSnapshot : null;

  return (
    <DestinationSurface
      eyebrow="PINGÜINO Pro"
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
            {productionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active === tab.id}
                onClick={() => setParams(tab.id === 'current' ? {} : { tab: tab.id })}
                className={cn(
                  'min-h-12 border-b-2 px-4 text-xs font-semibold tracking-[0.08em]',
                  active === tab.id ? 'border-ink text-ink' : 'border-transparent text-stone-400',
                )}
                data-testid={`production-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {active === 'current' ? (
            <section className="py-8" data-testid="production-current">
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
                    Otwórz PINGÜINO Pro
                  </Link>
                </>
              )}
            </section>
          ) : null}

          {active === 'history' ? (
            <section className="py-8" data-testid="production-history">
              <h2 className="text-xl font-semibold text-ink">Historia produkcji</h2>
              {snapshot ? (
                <div className="mt-6 border-y border-ink/10 py-5">
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
                        plan {snapshot.originalBatchTargetG.toFixed(1)} g
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParams({ tab: 'labels' })}
                    className={cn(buttonClasses('ghost', 'sm'), 'mt-5')}
                  >
                    Otwórz finalną etykietę
                  </button>
                </div>
              ) : (
                <p className="mt-5 text-sm text-stone-500">
                  Brak zakończonej partii w bieżącym, lokalnym źródle danych.
                </p>
              )}
            </section>
          ) : null}

          {active === 'labels' ? (
            <section className="py-8" data-testid="production-labels">
              <h2 className="text-xl font-semibold text-ink">Etykiety z zakończonych partii</h2>
              {snapshot ? (
                <div className="mt-6 border border-ink/10">
                  <MasterLabelEditor snapshot={snapshot} printLabel="Drukuj ponownie" />
                </div>
              ) : (
                <p className="mt-5 text-sm text-stone-500">
                  Etykieta pojawi się dopiero po zakończeniu produkcji i zamrożeniu faktycznego
                  snapshotu.
                </p>
              )}
            </section>
          ) : null}
        </>
      )}
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
        </div>
      )}
    </DestinationSurface>
  );
}
