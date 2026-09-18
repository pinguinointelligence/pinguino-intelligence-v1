import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { UnverifiedProductsPanel } from '@/features/products/UnverifiedProductsPanel';
import { MyProductsPanel } from '@/features/products/MyProductsPanel';
import { ProductsFilterTabs } from '@/features/products/ProductsFilterTabs';
import { productFilterFromParam } from '@/features/products/productsFilter';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { CompactRunLabelSettings, LabelWorkspace } from '@/features/master-label/LabelWorkspace';
import {
  defaultAccountLabelProfile,
  resolveLabelRepository,
} from '@/services/labels/labelRepository';
import { AccountRecipeDefaults } from '@/features/pro-workbench/AccountRecipeDefaults';
import { AccountProductMarkets } from '@/features/global-catalog/AccountProductMarkets';
import { GlobalCatalogSearchPanel } from '@/features/global-catalog/GlobalCatalogSearchPanel';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { ProductRequestAccountSections } from '@/features/product-requests/ProductRequestAccountSections';
import { HomeInviteRedemption } from '@/features/account/HomeInviteRedemption';
import { HomeBatches, ProductionBatches } from '@/features/production-area/ProductionBatches';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import {
  DestinationHero,
  DestinationSection,
  DestinationSectionHead,
} from '@/components/shared/destinationEditorial';
import { ShopCatalog } from '@/features/shop/ShopCatalog';
import { ShopCartCount } from '@/features/shop/ShopCartCount';
import { ShopOrdersPanel } from '@/features/shop/ShopOrdersPanel';
import { shopCopy } from '@/copy/shop';
import { FranchiseInquiryForm } from '@/features/franchise/FranchiseInquiryForm';
import { OwnerAssetImage } from '@/features/work-with-us/OwnerAssetImage';
import {
  FRANCHISE_CONCEPT_INITIAL,
  FRANCHISE_CONCEPT_ORDER,
  franchiseConceptBlurbPl,
  franchiseConceptFromRoute,
  franchiseConceptLabelPl,
  franchiseSourceRouteFrom,
} from '@/features/franchise/franchiseConcepts';
import { FRANCHISE_FORMAT_LINKS, FRANCHISE_PAGE, FRANCHISE_SPLIT } from '@/copy/workWithUsLanes';
import { AppShell } from '@/features/shell/AppShell';
import { KnowledgeTour } from '@/features/knowledge-tour/KnowledgeTour';
import { useRecipeStore } from '@/stores/recipeStore';
import { readLabelSettingsReturn } from '@/features/master-label/labelSettingsNavigation';
import { RunLabelView } from '@/features/production-area/RunLabelView';
import { LabelHistorySection } from '@/features/production-area/LabelHistorySection';
import { productionBatchesLabelsCopy } from '@/copy/productionBatchesLabels';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildDraftLabelPreview } from '@/features/master-label/draftLabelPreview';
import {
  createRecipeLabelDraft,
  newRecipeLabelDraftId,
  type RecipeLabelDraft,
} from '@/features/master-label/labelDraftPersistence';

/** One panel for each account concern — same card as the rest of the product. */
const ACCOUNT_PANEL =
  'rounded-[12px] border border-[var(--g-line)] bg-white px-5 [&>section]:py-0 [&>section]:first:pt-5 [&>section]:last:pb-5';

const labelsCopy = productionBatchesLabelsCopy.labels;

const quietLink =
  'flex min-h-14 items-center justify-between border-b border-[var(--g-line)] py-3 text-sm text-ink transition-opacity hover:opacity-55';

export function HowItWorksPage() {
  return (
    <AppShell navigationPosition="trailing" contentClassName="bg-white">
      <KnowledgeTour />
    </AppShell>
  );
}

export function ShopPage() {
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
          className="inline-flex min-h-11 shrink-0 items-center gap-[7px] rounded-full border border-[var(--g-line)] px-3.5 py-[7px] text-[12px] font-semibold text-[var(--g-ink)] transition-colors hover:border-[var(--g-line-strong)] md:px-4 md:py-2 md:text-[12.5px]"
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
  const [params] = useSearchParams();
  const fromRoute = params.get('from');
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
      {/* The lane had a hero and an enquiry form with nothing in between: a
          reader could not learn what a Gellatti lodziarnia actually is before
          being asked to enquire. These points are the sourced answer — the
          production model, the app, and how the format is chosen. */}
      <DestinationSection>
        <DestinationSectionHead
          eyebrow="Czym jest Gellatti"
          title={FRANCHISE_PAGE.headline}
          helper={FRANCHISE_PAGE.intro}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {FRANCHISE_PAGE.points.map((point) => (
            <article
              key={point.title}
              className="rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]"
            >
              <h3 className="text-[19px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                {point.title}
              </h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
                {point.body}
              </p>
            </article>
          ))}
        </div>
      </DestinationSection>

      <DestinationSection>
        <DestinationSectionHead
          eyebrow="Potwierdzone koncepty"
          title="Cztery formaty. Bez wymyślonych warunków."
          helper="Karty opisują format. Zakres współpracy i koszty ustalamy przy konkretnym miejscu."
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
              <p className="mt-2 text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
                {franchiseConceptBlurbPl(concept)}
              </p>
            </article>
          ))}
        </div>
      </DestinationSection>
      {/* Who brings what (owner-approved 2026-09-03, non-financial).
          Same hairline grid the figures below already use, so this is one more
          instance of an established pattern rather than a new component.
          Charcoal for Gellatti, white for the operator: the anchor/working-space
          split the approved Affiliate page established. No number appears here —
          the commercial terms are deliberately absent, and the note says so. */}
      <DestinationSection>
        <DestinationSectionHead eyebrow={FRANCHISE_SPLIT.eyebrow} title={FRANCHISE_SPLIT.title} />
        <div className="grid gap-px overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-line)] lg:grid-cols-2">
          <div className="bg-[var(--g-graphite,#191a1d)] px-6 py-7 text-white sm:px-7">
            <h3 className="text-[19px] leading-[1.2] font-bold tracking-[-0.02em]">
              {FRANCHISE_SPLIT.gellatti.title}
            </h3>
            <p className="mt-2 text-[13px] leading-[1.55] text-[#c9c5bd]">
              {FRANCHISE_SPLIT.gellatti.lead}
            </p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {FRANCHISE_SPLIT.gellatti.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-[13px] leading-[1.5] text-[#efe8dc]">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-[3px] shrink-0 rounded-full bg-[var(--g-orange)]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white px-6 py-7 sm:px-7">
            <h3 className="text-[19px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
              {FRANCHISE_SPLIT.operator.title}
            </h3>
            <p className="mt-2 text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
              {FRANCHISE_SPLIT.operator.lead}
            </p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {FRANCHISE_SPLIT.operator.items.map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-[13px] leading-[1.5] text-[var(--g-text-secondary)]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-[3px] shrink-0 rounded-full bg-[var(--g-line-strong,#c9c5bd)]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--g-text-muted)]">
          {FRANCHISE_SPLIT.note}
        </p>
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
      {/* The formats that keep their own detail page. Franchise is the umbrella,
          so they are reached from here rather than from a second top-level
          menu. */}
      <DestinationSection>
        <DestinationSectionHead
          eyebrow="Formaty w szczegółach"
          title="Zobacz konkretny format."
          helper="Każdy z nich prowadzi do tego samego zapytania — wybierasz tylko, o czym rozmawiamy."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {FRANCHISE_FORMAT_LINKS.map((lane) => (
            <Link
              key={lane.href}
              to={lane.href}
              className="rounded-[12px] border border-[var(--g-line)] bg-white p-[18px] transition-colors hover:border-[var(--g-line-strong,#c9c5bd)]"
            >
              <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.16em] text-[var(--g-text-secondary)] uppercase">
                {lane.kicker}
              </span>
              <h3 className="mt-2.5 text-[19px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                {lane.title}
              </h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
                {lane.card}
              </p>
            </Link>
          ))}
        </div>
      </DestinationSection>

      {/* ONE Franchise enquiry (owner decision 2026-09-03). The legacy general
          form wrote to a second table with its own Admin queue; the useful half
          of it — `?from=` context, concept preselection, route attribution and
          the #lead deep link — lives here instead, so a visitor produces exactly
          one lead in one place.

          `#lead` is carried by this wrapper because every in-app CTA and every
          old external link points at it. */}
      <DestinationSection>
        <div id="lead" className="scroll-mt-28">
          <FranchiseInquiryForm
            initialConcept={franchiseConceptFromRoute(fromRoute) ?? 'lokal'}
            sourceRoute={franchiseSourceRouteFrom(fromRoute)}
          />
        </div>
      </DestinationSection>
    </DestinationSurface>
  );
}

export function ProductsHubPage() {
  const [productsParams] = useSearchParams();
  /*
    OWNER CORRECTION 2026-09-07 — the product area has ONE hamburger entry. „Skanuj produkt" is this
    page's action (in `actions` below) and Wszystkie / Moje produkty / Niezweryfikowane are this
    page's filters, not drawer destinations. `?filter=` is unchanged, so „Uzupełnij dane" and every
    saved link still land on the right list.
  */
  const productFilter = productFilterFromParam(productsParams.get('filter'));
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
          <ProductsFilterTabs />
          {productFilter === 'unverified' ? (
            <>
              <p className="mb-4 max-w-xl text-sm text-[var(--g-text-secondary)]">
                Produkty, którym brakuje jeszcze danych potrzebnych do receptury. Są widoczne tylko
                dla Ciebie. Uzupełnij je, kiedy chcesz — znikną stąd same, gdy będą gotowe.
              </p>
              <UnverifiedProductsPanel />
            </>
          ) : productFilter === 'mine' ? (
            <>
              <p className="mb-4 max-w-xl text-sm text-[var(--g-text-secondary)]">
                Produkty zapisane na Twoim koncie. Widzisz je tylko Ty.
              </p>
              <MyProductsPanel />
            </>
          ) : (
            <GlobalCatalogSearchPanel />
          )}
          <p className="mt-8 max-w-xl text-xs leading-relaxed text-[var(--g-text-secondary)]">
            Twoja cena, dostawca, notatki i stan magazynowy pozostają prywatne.
          </p>
        </>
      )}
    </DestinationSurface>
  );
}

/**
 * Produkcja → Partie (Production v3, Etap 1 §6). The in-progress list, the
 * production history (paged) and the way back to a batch live in
 * `ProductionBatches`; the hub's former „Etykiety” tab is the Etykiety section
 * (`/labels`), so `?tab=labels` lands there.
 */
export function ProductionHubPage() {
  const [params] = useSearchParams();
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  if (params.get('tab') === 'labels') return <Navigate to="/labels" replace />;

  return (
    <DestinationSurface
      eyebrow="Gellatti Pro"
      title="Produkcja"
      blurb="Bieżąca partia, zapis zakończonych produkcji i etykiety — zawsze oparte na tych samych danych."
      contextLabel="Produkcja"
    >
      {capabilities.canUseProductionMode ? (
        <ProductionBatches />
      ) : persona === 'home' ? (
        <HomeBatches />
      ) : (
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
      )}
    </DestinationSurface>
  );
}

type LabelsHubContext = 'defaults' | 'recipe' | 'run';

/**
 * Produkcja → Etykiety reads its context from the address (Production v3 §5):
 *  A `/labels` — the account defaults and „Historia etykiet” (no recipe draft is created);
 *  B `/labels?labelView=recipe` — the current recipe's label draft;
 *  C `/labels?run=…[&snapshot=…]` — the label of one completed run.
 */
const labelsHubContext = (params: URLSearchParams): LabelsHubContext =>
  params.get('run') || params.get('snapshot')
    ? 'run'
    : params.get('labelView') === 'recipe'
      ? 'recipe'
      : 'defaults';

export function LabelsHubPage() {
  const [params] = useSearchParams();
  const repository = useMemo(() => resolveLabelRepository(), []);
  const location = useLocation();
  const navigate = useNavigate();
  const persona = useProCorePersona();
  const context = labelsHubContext(params);
  const returnTarget = readLabelSettingsReturn(location.state);
  const labelSettingsReturn = returnTarget ?? {
    to: '/pro/recipe?panel=summary',
    scrollTop: 0,
  };
  const returnToOrigin = () =>
    navigate(labelSettingsReturn.to, {
      state: { labelSettingsRestore: labelSettingsReturn },
    });
  /* The return names where it goes. Without a named source it stays the plain
     „← Wróć” (GEL-P0-033). Reached from ☰ there is no origin, so the defaults
     screen shows no back action — a back to a place never visited would be a lie. */
  const backLabel =
    returnTarget?.origin === 'production-history'
      ? labelsCopy.backToProductionHistory
      : returnTarget?.origin === 'label-history'
        ? labelsCopy.backToLabelHistory
        : returnTarget?.origin === 'current-run'
          ? labelsCopy.backToRun
          : '← Wróć';
  const showBack = persona !== 'home' && (context !== 'defaults' || returnTarget !== null);

  return (
    <DestinationSurface
      eyebrow="Gellatti Pro"
      title="Etykiety"
      blurb="Profil konta i etykiety zakończonych partii — w jednym, spójnym miejscu."
      contextLabel="Ustawienia etykiety"
    >
      {showBack ? (
        <button
          type="button"
          onClick={returnToOrigin}
          className="pro-focus-ring -ml-1 mb-4 inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold text-ink transition-opacity hover:opacity-60"
          data-testid="labels-return"
        >
          {backLabel}
        </button>
      ) : null}
      {persona === 'home' ? (
        <WorkflowNotice
          eyebrow="Etykiety"
          title={labelsCopy.homeGateTitle}
          description={labelsCopy.homeGateBody}
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <Link to="/subscription" className={buttonClasses('primary', 'sm')}>
              {labelsCopy.seePlans}
            </Link>
          }
          testId="labels-plan-gate"
        />
      ) : context === 'recipe' ? (
        <RecipeLabelSettings onReturn={returnToOrigin} />
      ) : context === 'run' ? (
        <RunLabelView
          requestedRunId={params.get('run')}
          requestedSnapshotId={params.get('snapshot')}
          settingsView={params.get('labelView') === 'settings'}
          origin={returnTarget?.origin ?? null}
          repository={repository}
        />
      ) : (
        <>
          <LabelContextCard title={labelsCopy.defaultsTitle} body={labelsCopy.defaultsBody} />
          <div className="mt-4">
            <LabelWorkspace profileOnly repository={repository} />
          </div>
          <LabelHistorySection repository={repository} />
        </>
      )}
    </DestinationSurface>
  );
}

function LabelContextCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-l-2 border-[var(--g-line)] border-l-[var(--g-orange)] bg-white px-4 py-3.5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--g-text-secondary)]">{body}</p>
    </div>
  );
}

/**
 * Context B — the current recipe's label draft. „Zastosuj ustawienia” changes this
 * draft only; it never saves the account's default label profile.
 */
function RecipeLabelSettings({ onReturn }: { onReturn: () => void }) {
  const repository = useMemo(() => resolveLabelRepository(), []);
  const labelDraft = useRecipeStore((state) => state.labelDraft);
  const setLabelDraft = useRecipeStore((state) => state.setLabelDraft);
  const labelDraftContext = useRecipeStore((state) => state.draftContextSeq);
  const labelDraftRevision = useRecipeStore((state) => state.draftRevision);
  const currentVersionId = useRecipeStore((state) => state.currentVersionId);
  const currentVersionNumber = useRecipeStore((state) => state.currentVersionNumber);
  const currentRecipeName = useRecipeStore((state) => state.savedRecipeName);
  const ownerUserId = useAuthStore((state) => state.user?.id ?? 'label-settings-local');
  const generatedDraft = useRef<{
    context: number;
    value: RecipeLabelDraft;
  } | null>(null);
  const [saveDraftAsDefault, setSaveDraftAsDefault] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (generatedDraft.current?.context !== labelDraftContext) {
      generatedDraft.current = {
        context: labelDraftContext,
        value:
          labelDraft ??
          createRecipeLabelDraft({
            draftId: `${newRecipeLabelDraftId()}-${currentVersionId ?? labelDraftContext}`,
          }),
      };
    }
    const seed = labelDraft ?? generatedDraft.current.value;
    void repository
      .getAccountProfile()
      .then((savedProfile) => {
        if (cancelled) return;
        const state = useRecipeStore.getState();
        const activeDraft = state.labelDraft ?? seed;
        const input = buildRecipeInput(state);
        const preview = buildDraftLabelPreview({
          profile: savedProfile ?? defaultAccountLabelProfile(ownerUserId),
          recipeInput: input,
          composition: recipeCompositionFromState(state),
          productName: currentRecipeName,
          draft: activeDraft,
          recipeVersionId: currentVersionId,
          recipeVersionNumber: currentVersionNumber,
        });
        if (JSON.stringify(activeDraft.label) !== JSON.stringify(preview.label)) {
          setLabelDraft({ ...activeDraft, label: preview.label }, false);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    currentRecipeName,
    currentVersionId,
    currentVersionNumber,
    labelDraft,
    labelDraftContext,
    labelDraftRevision,
    ownerUserId,
    repository,
    setLabelDraft,
  ]);

  return (
    <>
      <LabelContextCard title={labelsCopy.recipeTitle} body={labelsCopy.recipeBody} />
      {labelDraft?.label ? (
        <section className="mt-6">
          <CompactRunLabelSettings
            label={labelDraft.label}
            saveAsDefault={saveDraftAsDefault}
            onSaveAsDefaultChange={setSaveDraftAsDefault}
            showSaveAsDefault={false}
            showDraftData
            onClose={onReturn}
            onSave={async (label) => {
              setLabelDraft(
                {
                  ...labelDraft,
                  productionDate: label.productionDate,
                  label,
                },
                true,
              );
              onReturn();
            }}
          />
        </section>
      ) : null}
    </>
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
