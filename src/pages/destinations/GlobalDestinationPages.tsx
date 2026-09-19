import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { UnverifiedProductsPanel } from '@/features/products/UnverifiedProductsPanel';
import { MyProductsPanel } from '@/features/products/MyProductsPanel';
import { ProductsFilterTabs } from '@/features/products/ProductsFilterTabs';
import { productFilterFromParam } from '@/features/products/productsFilter';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { useTutorialStore } from '@/features/tutorial/tutorialState';
import { CUSTOMER_HOME_PATH } from '@/app/redirectState';
import { ProductionAreaSurface } from '@/features/production-area/ProductionAreaSurface';
import { productionAreaCopy } from '@/copy/productionArea';
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
import {
  readLabelSettingsRestore,
  readLabelSettingsReturn,
} from '@/features/master-label/labelSettingsNavigation';
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

/**
 * DESIGN V3.0 GLOBAL MENU: the tutorial belongs HERE, not in the drawer. The
 * menu used to carry its own „Uruchom samouczek ponownie" row beside this very
 * destination — two doors onto one action. The knowledge page explains, and
 * the tutorial shows; they answer the same need, so they live together.
 *
 * Starting it from here navigates to the workspace first: the spotlight lands
 * on the real controls (add, primary, gear), which exist on the creator screen
 * and not on this page.
 */
export function HowItWorksPage() {
  const navigate = useNavigate();
  const startTutorial = useTutorialStore((state) => state.start);
  return (
    <AppShell navigationPosition="trailing" contentClassName="bg-white">
      <KnowledgeTour />
      <div className="px-5 pb-10">
        <button
          type="button"
          onClick={() => {
            startTutorial();
            navigate(CUSTOMER_HOME_PATH);
          }}
          className="inline-flex min-h-12 items-center rounded-full border border-[var(--g-line)] px-5 text-sm text-ink transition-opacity hover:opacity-70"
          data-testid="how-it-works-start-tutorial"
        >
          Uruchom samouczek
        </button>
      </div>
    </AppShell>
  );
}

/**
 * DESIGN V3.0 GLOBAL MENU: „Pomoc" is the support door — contact and reporting a
 * problem. It is deliberately NOT the knowledge destination („Dlaczego to
 * dziala?"), which explains why a recipe works; the accepted menu carries both,
 * separated, because they answer different questions.
 *
 * This page invents no support system: it routes to `info@gellatti.com`, the
 * mailbox the app already uses for partner applications and cooperation, and
 * points at the knowledge destination for the questions that are not problems.
 * What else Pomoc should offer is an OWNER DECISION, recorded in
 * docs/OWNER-DECISION-LIST.md.
 */
export function HelpPage() {
  return (
    <DestinationSurface
      eyebrow="Gellatti"
      title="Pomoc"
      blurb="Napisz do nas, jesli cos nie dziala albo czegos brakuje."
      contextLabel="Pomoc"
    >
      <div className={ACCOUNT_PANEL}>
        <section>
          <h2 className="text-base font-medium text-ink">Zglos problem</h2>
          <p className="mt-2 max-w-[56ch] text-sm text-ink/70">
            Opisz, co sie stalo i na ktorym ekranie. Jesli to blad w partii albo w
            recepturze, dodaj jej nazwe i wersje — odpowiemy szybciej.
          </p>
          <a
            href="mailto:info@gellatti.com"
            className="mt-4 inline-flex min-h-12 items-center rounded-full bg-ink px-5 text-sm text-white"
            data-testid="help-contact"
          >
            Napisz na info@gellatti.com
          </a>
        </section>
        <section className="border-t border-[var(--g-line)]">
          <h2 className="text-base font-medium text-ink">Szukasz wyjasnienia?</h2>
          <p className="mt-2 max-w-[56ch] text-sm text-ink/70">
            Jak dzialaja skladniki, dlaczego receptura sie udaje i samouczek — to
            wszystko jest w „Dlaczego to dziala?”.
          </p>
          <Link to="/how-it-works" className={cn(quietLink, 'mt-3')} data-testid="help-knowledge">
            <span>Dlaczego to dziala?</span>
          </Link>
        </section>
      </div>
    </DestinationSurface>
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

/** Produkty's own sub-views (package PRODUKCJA V3 §4): the account's product settings. */
type ProductsPanel = 'markets' | 'requests';
const productsPanelFromParam = (value: string | null): ProductsPanel | null =>
  value === 'markets' || value === 'requests' ? value : null;

const productsCopy = productionAreaCopy().products;

const productsRow =
  'pro-focus-ring flex min-h-12 items-center justify-between gap-4 border-b border-[var(--g-line)] text-[14px] text-[var(--g-ink)] transition-opacity hover:opacity-70';

export function ProductsHubPage() {
  const [productsParams] = useSearchParams();
  /*
    OWNER CORRECTION 2026-09-07 — the product area has ONE hamburger entry. „Skanuj produkt" is this
    page's action (in `actions` below) and Wszystkie / Moje produkty / Niezweryfikowane are this
    page's filters, not drawer destinations. `?filter=` is unchanged, so „Uzupełnij dane" and every
    saved link still land on the right list.

    Produkcja v3 §4 — Produkty is a section of the one Produkcja area. Its state lives in the
    address (`filter`, `q`, `fav`, `market`, `retailer`, `product`, `panel`), and the account's
    product settings moved here from Konto: `?panel=markets` is „Rynki produktów”
    (AccountProductMarkets) and `?panel=requests` is „Zgłoszenia produktów”
    (ProductRequestAccountSections) — the same components, the same data.
  */
  const productFilter = productFilterFromParam(productsParams.get('filter'));
  const panel = productsPanelFromParam(productsParams.get('panel'));
  const productOpen = productsParams.has('product');
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  const canAdmin = useProCoreAccessStore((state) => state.effectiveAccess?.canAdmin === true);
  const authStatus = useAuthStore((state) => state.status);
  // The account's product settings follow the account page's rule: any signed-in account.
  const signedIn = authStatus === 'authed' || import.meta.env.DEV;
  // „‹ Produkty” returns to the same list — filter and search kept, panel closed.
  const listParams = new URLSearchParams(productsParams);
  listParams.delete('panel');
  listParams.delete('request');
  const listSearch = listParams.toString();
  const listPath = listSearch ? `/products?${listSearch}` : '/products';

  if (panel !== null && signedIn) {
    return (
      <ProductionAreaSurface section="products">
        <Link
          to={listPath}
          className="pro-focus-ring -ml-1 inline-flex min-h-11 items-center gap-1 rounded-[9px] px-1 text-[14px] font-semibold text-[var(--g-ink)]"
          data-testid="products-panel-back"
        >
          <span aria-hidden>‹</span> {productsCopy.back}
        </Link>
        <div className={cn(ACCOUNT_PANEL, 'mt-3')} data-testid={`products-panel-${panel}`}>
          {panel === 'markets' ? <AccountProductMarkets /> : <ProductRequestAccountSections />}
        </div>
      </ProductionAreaSurface>
    );
  }

  return (
    <ProductionAreaSurface
      section="products"
      // On a phone an open product is its own view: the section action steps aside.
      headingClassName={productOpen ? 'max-lg:hidden' : undefined}
      actions={
        capabilities.canSaveRecipe ? (
          <Link to="/products/scan" className={applicationPrimaryClasses()}>
            Skanuj produkt
          </Link>
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
          <div className={productOpen ? 'max-lg:hidden' : undefined}>
            <ProductsFilterTabs />
          </div>
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
            /* „Moja cena” is a PRO price — HOME's catalogue shows no price column or row. */
            <GlobalCatalogSearchPanel showPrivatePrice={capabilities.canUseProductionMode} />
          )}
          <div className={productOpen ? 'max-lg:hidden' : undefined}>
            <nav
              aria-label={productsCopy.marketsLink}
              className="mt-8 max-w-3xl border-t border-[var(--g-line)]"
              data-testid="products-settings-links"
            >
              <Link to="/products?panel=markets" className={productsRow}>
                <span>{productsCopy.marketsLink}</span>
                <span aria-hidden className="text-[var(--g-text-secondary)]">
                  ›
                </span>
              </Link>
              <Link to="/products?panel=requests" className={productsRow}>
                <span>{productsCopy.requestsLink}</span>
                <span aria-hidden className="text-[var(--g-text-secondary)]">
                  ›
                </span>
              </Link>
              {canAdmin ? (
                <Link to="/products/import" className={productsRow}>
                  <span>{productsCopy.adminImportLink}</span>
                  <span aria-hidden className="text-[var(--g-text-secondary)]">
                    ›
                  </span>
                </Link>
              ) : null}
            </nav>
            <p className="mt-6 max-w-xl text-xs leading-relaxed text-[var(--g-text-secondary)]">
              Twoja cena, dostawca, notatki i stan magazynowy pozostają prywatne.
            </p>
          </div>
        </>
      )}
    </ProductionAreaSurface>
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
    /* Partie opens directly on its content under the section bar (the accepted v3
       renders): the history shortcut, the work in progress, the history. */
    <ProductionAreaSurface section="batches">
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
    </ProductionAreaSurface>
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
     „← Wróć” with today's fallback route. GEL-P0-033 keeps „← Wróć” on `/labels`
     in every context — also when Etykiety is reached from ☰ with no origin (the v3
     preview shows none there; that difference waits for an Owner decision). */
  const backLabel =
    returnTarget?.origin === 'production-history'
      ? labelsCopy.backToProductionHistory
      : returnTarget?.origin === 'label-history'
        ? labelsCopy.backToLabelHistory
        : returnTarget?.origin === 'current-run'
          ? labelsCopy.backToRun
          : '← Wróć';

  /* A new context (or another run) opens at its top, where its back action is — the
     page it came from may have been scrolled far down. Choosing another version of the
     same run keeps the place; a return to the label history restores its own place. */
  const arrival = `${context}:${params.get('run') ?? ''}`;
  const arrivedAt = useRef<string | null>(null);
  useEffect(() => {
    if (arrivedAt.current === arrival) return;
    arrivedAt.current = arrival;
    if (readLabelSettingsRestore(location.state)) return;
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0 });
  }, [arrival, location.state]);

  /* Etykiety is the Pro-only section of Produkcja: for HOME and signed-out visitors
     the area surface says where the tools live instead of rendering them. */
  return (
    <ProductionAreaSurface section="labels">
      <button
        type="button"
        onClick={returnToOrigin}
        className="pro-focus-ring -ml-1 mb-4 inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold text-ink transition-opacity hover:opacity-60"
        data-testid="labels-return"
      >
        {backLabel}
      </button>
      {context === 'recipe' ? (
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
    </ProductionAreaSurface>
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
