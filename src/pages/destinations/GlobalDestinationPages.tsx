import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { UnverifiedProductsPanel } from '@/features/products/UnverifiedProductsPanel';
import { MyProductsPanel } from '@/features/products/MyProductsPanel';
import { ProductsFilterTabs } from '@/features/products/ProductsFilterTabs';
import { productFilterFromParam } from '@/features/products/productsFilter';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
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
import { ShopCatalog } from '@/features/shop/ShopCatalog';
import { ShopCartCount } from '@/features/shop/ShopCartCount';
import { ShopOrdersPanel } from '@/features/shop/ShopOrdersPanel';
import { shopCopy } from '@/copy/shop';
import { DestinationTop } from '@/components/shared/destinationEditorial';
import { FranchiseInquiryForm } from '@/features/franchise/FranchiseInquiryForm';
import { OwnerAssetImage } from '@/features/work-with-us/OwnerAssetImage';
import { franchiseSourceRouteFrom } from '@/features/franchise/franchiseConcepts';
import {
  FRANCHISE_FORMATS,
  franchiseFormat,
  franchiseFormatFromRoute,
  type FranchiseFormatId,
} from '@/features/franchise/franchiseFormats';
import { FRANCHISE_PAGE, FRANCHISE_SPLIT_LINE } from '@/copy/workWithUsLanes';
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
  const { hash } = useLocation();
  const fromRoute = params.get('from');
  const leadRef = useRef<HTMLDivElement>(null);

  /**
   * FRANCHISE — DESIGN F1 (owner correction 2026-09-18), implemented 1:1.
   *
   * The flow is: the shared dark top on the owner's facade photograph, the four
   * formats in one row, ONE opened format directly under that row, „Jak działa
   * Gellatti” in four small points with the one sentence about roles, and the
   * enquiry form — compact, on the page, last. Nothing follows it.
   *
   * What it replaces: the long editorial hero, four concept cards AND a second
   * grid of links to the same formats, two eight-item responsibility lists, two
   * captioned figures.
   *
   * Nothing behind the page changed. Same route, same form, same RPC, same
   * `?from=` attribution, same `#lead` anchor every lane CTA points at.
   */
  const [formatId, setFormatId] = useState<FranchiseFormatId | null>(
    () => franchiseFormatFromRoute(fromRoute) ?? null,
  );
  const format = formatId ? franchiseFormat(formatId) : null;

  /* `#lead` is the app's existing contract with every lane CTA and every old
     external link: it has to land on the enquiry, not on the top of the page.
     The design's contact frame opens scrolled to the form for the same reason. */
  useEffect(() => {
    if (hash === '#lead') leadRef.current?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <DestinationSurface
      eyebrow="Ekosystem Gellatti"
      title="Franchise"
      blurb={FRANCHISE_PAGE.intro}
      contextLabel="Franchise"
      bare
    >
      {/* 1 · THE shared destination top (DESIGN, owner correction 2026-09-18).
          Sklep, Affiliate and Franchise read as one family, so the body, the
          radius, the 6 px Gellatti bar and the way the photograph meets the
          ground live in ONE component. Franchise brings the owner's street
          facade to it and nothing else. */}
      <DestinationTop
        eyebrow="Ekosystem Gellatti"
        title="Franchise"
        lede={FRANCHISE_PAGE.intro}
        visual={
          <OwnerAssetImage
            id="F03"
            priority
            sizes="(min-width: 768px) 56vw, 100vw"
            className="h-full w-full object-cover"
          />
        }
      />

      {/* 2 · The four formats (DESIGN `.d-fmts`). The CLOSED card already shows
          what is behind the choice: the format's own photograph, dimmed under
          its name. 2 × 2 on a phone and iPad portrait breaks at 768 into one
          row of four — the design's own breakpoint. */}
      <div
        role="tablist"
        aria-label="Formaty"
        className="mt-5 grid grid-cols-2 gap-2 md:mt-[26px] md:grid-cols-4 md:gap-2.5"
      >
        {FRANCHISE_FORMATS.map((option) => {
          const active = option.id === formatId;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              id={`franchise-format-${option.id}`}
              aria-selected={active}
              aria-controls="franchise-format-panel"
              data-testid={`franchise-format-${option.id}`}
              onClick={() => setFormatId(option.id)}
              className={cn(
                'pro-focus-ring group relative h-[88px] min-w-0 overflow-hidden rounded-[12px] bg-[#101113] md:h-[104px]',
                active
                  ? 'shadow-[inset_0_0_0_2px_var(--g-orange)]'
                  : 'shadow-[inset_0_0_0_1px_#e4e0d9]',
              )}
            >
              <OwnerAssetImage
                id={option.image}
                sizes="(min-width: 768px) 25vw, 50vw"
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.03]',
                  active ? 'opacity-[0.68]' : 'opacity-[0.52] group-hover:opacity-[0.62]',
                )}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,15,17,0.1)_0%,rgba(14,15,17,0.72)_100%)]"
              />
              <span className="absolute inset-x-3 bottom-2.5 z-[1] block text-left text-[12.5px] leading-[1.2] font-semibold tracking-[0.05em] text-white uppercase">
                {active ? (
                  <i
                    aria-hidden="true"
                    className="mb-[7px] block h-[3px] w-[22px] rounded-[2px] bg-[var(--g-orange)]"
                  />
                ) : null}
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3 · Exactly ONE opened format, directly under the row that opened it,
          separated by the accent rule (DESIGN `.d-fdet`). Opening another one
          closes this. */}
      {format ? (
        <section
          id="franchise-format-panel"
          role="tabpanel"
          aria-labelledby={`franchise-format-${format.id}`}
          data-testid="franchise-format-panel"
          data-franchise-format={format.id}
          className="mt-3.5 grid gap-3.5 border-t-2 border-[var(--g-orange)] pt-4 md:mt-[18px] md:grid-cols-2 md:items-start md:gap-6"
        >
          <span className="block overflow-hidden rounded-[12px] bg-[#efe8dc]">
            <span className="block aspect-[16/10]">
              <OwnerAssetImage
                key={format.image}
                id={format.image}
                sizes="(min-width: 768px) 45vw, 100vw"
              />
            </span>
          </span>
          <div className="min-w-0">
            <h2 className="text-[21px] leading-[1.18] font-semibold tracking-[-0.02em] text-[var(--g-ink)] lg:text-[24px]">
              {format.label}
            </h2>
            <p className="mt-[5px] text-[13.5px] leading-[1.4] font-medium text-[var(--g-ink)]">
              {format.lead}
            </p>
            {format.body.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-[9px] max-w-[54ch] text-[13px] leading-[1.5] text-[#6f6b64]"
              >
                {paragraph}
              </p>
            ))}
            <ul className="mt-3 grid gap-1.5">
              {format.points.map((point) => (
                <li
                  key={point}
                  className="relative pl-[15px] text-[12.5px] leading-[1.4] text-[#3b3833] before:absolute before:top-[6px] before:left-0 before:size-[5px] before:rounded-full before:bg-[var(--g-orange)] before:content-['']"
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 4 · How Gellatti works — four small points shared by all four formats,
          and the one sentence left of „Podział ról” (DESIGN `.d-how`). */}
      <section className="mt-[26px]">
        <h2 className="text-[18px] leading-[1.2] font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
          {FRANCHISE_PAGE.headline}
        </h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-4 lg:gap-3.5">
          {FRANCHISE_PAGE.points.map((point) => (
            <article
              key={point.title}
              className="min-w-0 rounded-[12px] bg-white p-[13px_15px] shadow-[inset_0_0_0_1px_#efebe4]"
            >
              <b className="block text-[13.5px] leading-[1.25] font-semibold text-[var(--g-ink)]">
                {point.title}
              </b>
              <small className="mt-[5px] block text-[12px] leading-[1.4] text-[#6f6b64]">
                {point.body}
              </small>
            </article>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] leading-[1.45] text-[#8a857d]">{FRANCHISE_SPLIT_LINE}</p>
      </section>

      {/* 5 · The ONE contact on this page (owner decision 2026-09-03, rescaled
          by DESIGN F1): the form itself, compact, at the foot. The legacy
          general form wrote to a second table with its own Admin queue; the
          useful half of it — `?from=` context, concept preselection, route
          attribution and the #lead deep link — lives here instead, so a visitor
          produces exactly one lead in one place.

          `#lead` is carried by this wrapper because every in-app CTA and every
          old external link points at it. */}
      <section className="mt-[26px]">
        <div id="lead" ref={leadRef} className="scroll-mt-28">
          <FranchiseInquiryForm
            title="Kontakt"
            note={FRANCHISE_PAGE.next}
            /* The four cards above ARE the subject choice in the design, so the
               open format carries the concept. With none open the form keeps the
               same default it has always had. */
            concept={format?.concept ?? 'lokal'}
            /* A real arrival always owns the attribution: `?from=` says where
               the question actually started. Only a format that carries no
               stored concept — Maszyny — falls back to its own route, which is
               the signal `source_route` exists to carry. */
            sourceRoute={
              franchiseSourceRouteFrom(fromRoute) ??
              (format && !format.concept ? format.route : undefined)
            }
          />
        </div>
      </section>
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
