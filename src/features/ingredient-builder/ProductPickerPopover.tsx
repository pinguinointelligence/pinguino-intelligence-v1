import {
  useCallback,
  useEffect,
  Fragment,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { copy } from '@/copy/en';
import { productDiscoveryCopy } from '@/copy/productDiscovery';
import type { EngineIngredient } from '@/engine';
import type { CarbonationStatus } from '@/data/products/carbonation';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import {
  markCatalogProductUsed,
  searchProducts,
  setUserPreferredExactProductForSlot,
} from '@/services/globalCatalog';
import type { ResolvedScanProduct } from '@/features/product-scanner/LiveProductScanner';
import { ScanFlow } from '@/features/scan-flow/ScanFlow';
import { cn } from '@/lib/cn';
import { iconButtonClasses } from '@/components/ui/buttonStyles';
import { preserveServerProductRank } from '@/features/global-catalog/ranking';
import { useGlobalCatalogPicker } from '@/features/global-catalog/useGlobalCatalogPicker';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { mappedCatalogIngredient } from '@/features/global-catalog/catalogIngredient';
import type { RecipeToppingIngredient } from '@/features/recipe-composition/labelTopping';
import {
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorContext,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import {
  productBehaviorBlockedMessage,
  resolveProductBehaviorForSelection,
} from '@/services/productIntelligence';
import { filterIngredients, type IngredientLibrary } from './ingredientLibrary';
import {
  isProductPickerSelectionCurrent,
  productPickerVerificationView,
  type ProductPickerVerificationView,
} from './productPickerModel';
import { PRO_DESKTOP_MEDIA_QUERY } from '@/features/shell/proFrameGeometry';
import {
  applicationViewportGeometry,
  applicationViewportSize,
  currentApplicationScale,
} from '@/features/shell/applicationScaleAuthority';
import { closeProductPickerForPointer } from './productPickerBackdrop';
import { mobileProductPickerRect } from './productPickerViewport';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import {
  PRODUCT_DISCOVERY_TOP_FILTERS,
  availableContextualSubfilters,
  matchesProductDiscoveryFamily,
  matchesProductDiscoveryFilter,
  matchesProductDiscoverySubfilter,
  projectCatalogHitsForDiscovery,
  resolveInitialProductDiscoveryFilter,
  type ProductDiscoveryReplaceContext,
  type ProductDiscoveryReplaceFamily,
  type ProductDiscoverySubfilter,
  type ProductDiscoveryTopFilter,
} from './canonicalProductDiscovery';
import {
  buildProductPickerSegments,
  canonicalCatalogProductId,
  catalogDataConfidencePercent,
  formatDataConfidencePercent,
  normalizeDataConfidencePercent,
  uniqueCatalogProductCount,
} from './productPickerCatalogPresentation';
import {
  catalogProductHasOwnEngineProfile,
  currentCatalogArticleId,
  engineIngredientForCatalogSelection,
  filterCurrentMapperCatalogHits,
  resolveCurrentMapperCatalogSelection,
  scannedProductRecipeTarget,
} from './mapperOnlyCatalog';
import { ProductPickerContextualRow } from './ProductPickerContextualRow';
import {
  contextualPickerMatch,
  getProductPickerCompatibility,
  type ProductPickerScope,
} from './productPickerCompatibility';

export interface ProductPickerRouteRequest {
  targetScope: ProductPickerScope;
  query: string;
  productId: string;
}

export interface ProductPickerHandoff extends ProductPickerRouteRequest {
  key: number;
  scope: ProductPickerScope;
}

export interface ProductPickerSelectionResult {
  /** Existing or newly-created row that should receive focus after close. */
  focusLineId?: string;
}

export interface ProductPickerReplaceInvocation {
  key: number;
  context: ProductDiscoveryReplaceContext;
}

interface PickerOption {
  id: string;
  name: string;
  detail: string;
  brand: string | null;
  category: string | null;
  articleNumber: string | null;
  local?: EngineIngredient;
  entityKind: 'pi_base' | 'commercial_product';
  status: 'pi_base' | 'verified' | 'manual_unverified' | 'blocked';
  favorite: boolean;
  recent: boolean;
  sortTitle: string;
  recentlyUsedAt: string | null;
  market: string | null;
  originalName: string | null;
  catalog?: CatalogProductSearchHit;
  verification: ProductPickerVerificationView;
  canonicalId: string;
  confidencePercent: number | null;
  selectable: boolean;
  carbonationStatus: CarbonationStatus;
}

const discoveryCopy = productDiscoveryCopy();

const discoveryFilterIcon = (
  filter: ProductDiscoveryTopFilter,
): Parameters<typeof IngredientCategoryIcon>[0]['symbol'] =>
  filter === 'technical' ? 'dry' : filter;

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  dairy: 'Mleczne',
  milk: 'Mleczne',
  sugar: 'Suche',
  stabilizer: 'Stabilizator',
  fruit: 'Owoce',
  chocolate_cocoa: 'Czekolada',
  nut_paste: 'Pasta orzechowa',
  paste: 'Pasta',
  alcohol: 'Alkohol',
  other: 'Inne',
};

const pickerCategoryLabel = (option: PickerOption): string => {
  const category = option.category ?? option.detail;
  return CATEGORY_LABELS[category.toLocaleLowerCase('en-US')] ?? category.replaceAll('_', ' ');
};

const publicPickerUnavailableReason = (option: PickerOption, scope: ProductPickerScope): string => {
  if (option.catalog?.entityKind === 'commercial_product') {
    return `${option.name} nie ma jeszcze kompletnego własnego profilu produktu. Uzupełnij brakujące dane i spróbuj ponownie.`;
  }
  return scope === 'BASE_FORMULATION'
    ? `${option.name} nie ma obecnie kompletnego zatwierdzenia do bazy receptury. Odśwież dane lub wybierz inny produkt.`
    : `${option.name} nie ma obecnie kompletnych danych do użycia jako topping. Uzupełnij dane lub wybierz inny produkt.`;
};

interface PickerPosition {
  desktop: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  bottom?: number;
}

const replaceContextQuery = (context: ProductDiscoveryReplaceContext): string => {
  if (context.family) return context.family;
  if (context.subfilter === 'sugars') return 'sugar';
  if (context.subfilter === 'stabilizers') return 'stabilizer';
  if (context.subfilter === 'inulin') return 'inulin';
  return '';
};

type ProductPickerPopoverProps = {
  library: IngredientLibrary;
  triggerLabel?: string;
  /**
   * How the trigger LOOKS. The picker itself is unchanged either way.
   *
   * `pill` (default) is the Pro workbench control and is what every existing caller
   * gets. `icon` is the Designbook round icon-button used where the affordance sits
   * against a list rather than in a toolbar — the label becomes the accessible name
   * instead of visible text, so callers that want a visible label render their own
   * beside it.
   */
  triggerVariant?: 'pill' | 'icon';
  /**
   * Icon-variant size. `md` (default) is the 44 px control used beside the recipe list;
   * `sm` is the more compact refinement control, which still clears 44 px on touch.
   */
  triggerSize?: 'sm' | 'md';
  className?: string;
  behaviorContext?: Omit<ProductBehaviorContext, 'processScope' | 'requestedRole' | 'module'>;
  /**
   * Opt-in presentation filter for the "cannot add this" notice (OWNER served QA
   * 2026-09-02). The pipeline writes those sentences for the PRO diagnosis view, where
   * naming ProductBehavior, the Mapper or a snapshot is the point; a HOME customer
   * cannot act on any of it. A surface that passes this gets the filtered sentence.
   *
   * It changes WORDING ONLY — the refusal itself is decided before this runs and is
   * never softened. PRO passes nothing and is unaffected.
   */
  sanitizeNotice?: (technical: string) => string | null;
  /** Read-only Base duplicate check before ProductBehavior/network work. The
   * store's atomic add remains the final race-safe authority. */
  onPreflightDuplicate?: (ingredient: EngineIngredient) => ProductPickerSelectionResult | void;
  intent?: 'ADD' | 'REPLACE';
  /** Explicit row-owned invocation. The normal visible trigger always keeps
   * its declared intent; this request only opens the same picker for Replace. */
  replaceInvocation?: ProductPickerReplaceInvocation | null;
  onClose?: () => void;
  /** Parent-owned transfer between the two recipe picker contexts. */
  handoff?: ProductPickerHandoff | null;
  onRouteToScope?: (request: ProductPickerRouteRequest) => void;
} & (
  | {
      scope: 'BASE_FORMULATION';
      onAdd: (
        ingredient: EngineIngredient,
        behavior?: ProductBehaviorSnapshot,
      ) => ProductPickerSelectionResult | void;
    }
  | {
      scope: 'POST_PROCESS_ADDON';
      onAdd: (
        ingredient: RecipeToppingIngredient,
        behavior?: ProductBehaviorSnapshot,
      ) => ProductPickerSelectionResult | void;
    }
);

export function ProductPickerPopover({
  library,
  scope,
  onAdd,
  triggerLabel,
  triggerVariant = 'pill',
  triggerSize = 'md',
  className,
  behaviorContext,
  sanitizeNotice,
  onPreflightDuplicate,
  handoff,
  onRouteToScope,
  intent = 'ADD',
  replaceInvocation,
  onClose,
}: ProductPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [activeIntent, setActiveIntent] = useState<'ADD' | 'REPLACE'>(intent);
  const [query, setQuery] = useState('');
  const [contextQuery, setContextQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [unavailableNotice, setUnavailableNoticeText] = useState<string | null>(null);
  /**
   * Every notice in this component goes through here, so a surface that opted into a
   * customer voice cannot be leaked past by a call site added later. Clearing (`null`)
   * is never filtered.
   */
  const setUnavailableNotice = useCallback(
    (text: string | null) =>
      setUnavailableNoticeText(text === null ? null : (sanitizeNotice?.(text) ?? text)),
    [sanitizeNotice],
  );
  const [informationOption, setInformationOption] = useState<PickerOption | null>(null);
  const [handoffTargetProductId, setHandoffTargetProductId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProductDiscoveryTopFilter>('all');
  const [activeSubfilter, setActiveSubfilter] = useState<ProductDiscoverySubfilter>('all');
  const [activeFamily, setActiveFamily] = useState<ProductDiscoveryReplaceFamily>(null);
  const [scanning, setScanning] = useState(false);
  const [scrollThumb, setScrollThumb] = useState({ top: 0, height: 50, visible: false });
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const informationCloseRef = useRef<HTMLButtonElement>(null);
  const lastHandoffKeyRef = useRef<number | null>(null);
  const lastReplaceInvocationKeyRef = useRef<number | null>(null);
  const defaultFilterAppliedRef = useRef(false);
  const pickerInstanceId = useId().replace(/:/g, '');
  const globalCatalog = useGlobalCatalogPicker({
    enabled: open && library.serverSearch,
    query: query.trim() === '' ? contextQuery : query,
    favoritesOnly: activeFilter === 'favorites',
    context: scope === 'BASE_FORMULATION' ? 'BASE' : 'TOPPING',
    productProfile: behaviorContext?.productProfile ?? null,
    selectedMarkets: [],
    forceGlobal: false,
    limit: 500,
    // The picker searches the whole eligible catalogue: Mapper reference rows
    // AND the commercial products the owner imported. Restricting the query to
    // pi_base meant an imported product could never be found, however exactly
    // its name was typed.
    mapperOnly: false,
  });
  useEffect(() => {
    if (!open) {
      defaultFilterAppliedRef.current = false;
      return;
    }
    if (defaultFilterAppliedRef.current || !globalCatalog.favoritesSettled) return;
    setActiveFilter(resolveInitialProductDiscoveryFilter(globalCatalog.favorites.size));
    setActiveSubfilter('all');
    setActiveFamily(null);
    setActiveIndex(0);
    defaultFilterAppliedRef.current = true;
  }, [globalCatalog.favorites.size, globalCatalog.favoritesSettled, open]);

  useEffect(() => {
    if (!handoff || handoff.scope !== scope || lastHandoffKeyRef.current === handoff.key) {
      return;
    }
    lastHandoffKeyRef.current = handoff.key;
    setQuery(handoff.query);
    setContextQuery('');
    setHandoffTargetProductId(handoff.productId);
    setActiveFilter('all');
    setActiveSubfilter('all');
    setActiveFamily(null);
    setActiveIntent(intent);
    setActiveIndex(0);
    defaultFilterAppliedRef.current = true;
    // Clearing needs no presentation filter, so this uses the raw setter and keeps the
    // effect's dependencies exactly what they were.
    setUnavailableNoticeText(null);
    setInformationOption(null);
    setScanning(false);
    setOpen(true);
  }, [handoff, intent, scope]);

  useEffect(() => {
    if (
      scope !== 'BASE_FORMULATION' ||
      !replaceInvocation ||
      lastReplaceInvocationKeyRef.current === replaceInvocation.key
    ) {
      return;
    }
    lastReplaceInvocationKeyRef.current = replaceInvocation.key;
    setQuery('');
    setContextQuery(replaceContextQuery(replaceInvocation.context));
    setHandoffTargetProductId(null);
    setActiveFilter(replaceInvocation.context.filter);
    setActiveSubfilter(replaceInvocation.context.subfilter);
    setActiveFamily(replaceInvocation.context.family);
    setActiveIntent('REPLACE');
    setActiveIndex(0);
    defaultFilterAppliedRef.current = true;
    setUnavailableNoticeText(null);
    setInformationOption(null);
    setScanning(false);
    setOpen(true);
  }, [replaceInvocation, scope]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => inputRef.current?.focus({ preventScroll: true }));
  }, [handoff?.key, open]);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const updatePosition = () => {
      const rawTrigger = triggerRef.current?.getBoundingClientRect();
      if (!rawTrigger) return;
      const scale = currentApplicationScale();
      const desktop = window.matchMedia(PRO_DESKTOP_MEDIA_QUERY).matches;
      if (!desktop) {
        const visualViewport = window.visualViewport;
        setPosition({
          desktop: false,
          ...mobileProductPickerRect({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            visualWidth: visualViewport?.width ?? window.innerWidth,
            visualHeight: visualViewport?.height ?? window.innerHeight,
            visualOffsetLeft: visualViewport?.offsetLeft ?? 0,
            visualOffsetTop: visualViewport?.offsetTop ?? 0,
          }),
        });
        return;
      }
      const rawEditor = document
        .querySelector<HTMLElement>('[data-testid="workbench-editor-pane"]')
        ?.getBoundingClientRect();
      if (!rawEditor) return;
      const editor = applicationViewportGeometry(rawEditor, scale);
      const viewport = applicationViewportSize(scale);
      const top = Math.max(84, editor.top);
      const height = Math.max(320, Math.min(editor.height, viewport.height - top - 16));
      setPosition({
        desktop: true,
        left: editor.left,
        top,
        width: editor.width,
        height,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open]);

  const options = useMemo<PickerOption[]>(() => {
    if (library.serverSearch) {
      // Never expose hits belonging to the previous debounced query. A quick
      // type -> Enter must not add a stale canonical ingredient.
      // Deduping by Mapper id is meaningful only for reference rows — several of
      // them can point at one Mapper ingredient. A commercial product is its own
      // identity, so it must pass through rather than be collapsed away.
      const context = scope === 'BASE_FORMULATION' ? 'BASE' : 'TOPPING';
      const referenceHits = new Set(
        filterCurrentMapperCatalogHits(
          globalCatalog.hits.filter((hit) => hit.entityKind === 'pi_base'),
          context,
        ),
      );
      const siblingReferenceHits = new Set(
        filterCurrentMapperCatalogHits(
          globalCatalog.hits.filter((hit) => hit.entityKind === 'pi_base'),
          context === 'BASE' ? 'TOPPING' : 'BASE',
        ),
      );
      const eligible = globalCatalog.hits.filter(
        (hit) =>
          hit.entityKind !== 'pi_base' || referenceHits.has(hit) || siblingReferenceHits.has(hit),
      );
      const filtered = eligible.filter(
        (hit) =>
          (activeFamily === null || matchesProductDiscoveryFamily(hit, activeFamily)) &&
          matchesProductDiscoveryFilter(hit, activeFilter) &&
          matchesProductDiscoverySubfilter(hit, activeFilter, activeSubfilter),
      );
      const catalog = globalCatalog.isSettled
        ? projectCatalogHitsForDiscovery({
            hits: preserveServerProductRank(filtered, globalCatalog.preferences),
            query: (activeFamily ?? query) || contextQuery,
          }).map(({ hit, primaryName, secondaryText }) => ({
            id:
              hit.entityKind === 'pi_base'
                ? `mapper:${hit.mappedIngredientId ?? hit.id}`
                : `catalog:${hit.id}`,
            name: primaryName,
            detail: hit.productForm ?? hit.brand ?? hit.canonicalFamily ?? 'Produkt',
            brand: secondaryText,
            category: hit.category ?? hit.productForm ?? hit.canonicalFamily,
            articleNumber: canonicalCatalogProductId(hit),
            entityKind: hit.entityKind,
            status: hit.status,
            favorite: hit.favorite,
            recent:
              Boolean(hit.recentlyUsedAt) ||
              globalCatalog.recent.has(
                `${hit.entityKind}:${
                  hit.entityKind === 'pi_base' ? hit.mappedIngredientId : hit.id
                }`,
              ),
            sortTitle: primaryName,
            recentlyUsedAt: hit.recentlyUsedAt,
            market: hit.markets[0] ?? null,
            originalName: hit.originalName,
            catalog: hit,
            verification: productPickerVerificationView(hit, scope),
            canonicalId: canonicalCatalogProductId(hit),
            confidencePercent: catalogDataConfidencePercent(hit),
            selectable: scope === 'BASE_FORMULATION' ? hit.usableInBase : hit.usableAsTopping,
            carbonationStatus: hit.carbonationStatus ?? 'UNKNOWN',
          }))
        : [];
      // Exact queries preserve the RPC order. Generic technological queries are
      // projected into canonical slots and use their family-specific ordering.
      // Legacy owner-private `library.products` are deliberately absent here;
      // they are neither shared-catalog UUIDs nor automatically VERIFIED.
      return [...new Map(catalog.map((option) => [option.id, option])).values()];
    }
    return filterIngredients(library.ingredients, query, library.searchIndex)
      .map((item) => ({
        id: item.id,
        name: item.name,
        detail: library.formIndex.get(item.id) ?? '',
        brand: null,
        category: item.category,
        articleNumber: null,
        local: item,
        entityKind: 'pi_base' as const,
        status: 'pi_base' as const,
        favorite: false,
        recent: false,
        sortTitle: item.name,
        recentlyUsedAt: null,
        market: null,
        originalName: null,
        canonicalId: canonicalIngredientId(item),
        // The Engine seam collapses unknown Mapper confidence to zero. Do not
        // present that fallback as a real 0% result in the local preview path.
        confidencePercent:
          item.confidence_score > 0 ? normalizeDataConfidencePercent(item.confidence_score) : null,
        selectable: true,
        carbonationStatus: item.carbonation_status ?? 'UNKNOWN',
        verification: { status: 'GELLATTI — SPRAWDZONY' as const, reason: null },
      }))
      .filter((option) =>
        activeFamily === null
          ? true
          : matchesProductDiscoveryFamily(
              {
                displayName: option.name,
                category: option.category,
                productForm: option.detail,
              },
              activeFamily,
            ),
      )
      .filter((option) =>
        matchesProductDiscoveryFilter(
          {
            displayName: option.name,
            category: option.category,
            productForm: option.detail,
            favorite: option.favorite,
          },
          activeFilter,
        ),
      )
      .filter((option) =>
        matchesProductDiscoverySubfilter(
          {
            displayName: option.name,
            category: option.category,
            productForm: option.detail,
          },
          activeFilter,
          activeSubfilter,
        ),
      );
  }, [
    activeFilter,
    activeFamily,
    activeSubfilter,
    globalCatalog.hits,
    globalCatalog.isSettled,
    globalCatalog.preferences,
    globalCatalog.recent,
    library,
    contextQuery,
    query,
    scope,
  ]);
  const contextualSubfilters = useMemo(
    () =>
      availableContextualSubfilters(
        globalCatalog.hits.filter((hit) => matchesProductDiscoveryFilter(hit, activeFilter)),
        activeFilter,
      ),
    [activeFilter, globalCatalog.hits],
  );
  const segments = useMemo(() => {
    const primary = options.filter((option) => {
      if (!option.catalog) return true;
      return (
        getProductPickerCompatibility(option.catalog, scope).state !== 'AVAILABLE_IN_OTHER_CONTEXT'
      );
    });
    const contextual = (activeIntent === 'ADD' ? options : [])
      .filter((option) => {
        if (!option.catalog) return false;
        return (
          getProductPickerCompatibility(option.catalog, scope).state ===
            'AVAILABLE_IN_OTHER_CONTEXT' && contextualPickerMatch(option.catalog, query)
        );
      })
      .slice(0, 5);
    return [
      ...buildProductPickerSegments(primary, {
        activeQuery: query.trim() !== '' || activeIntent === 'REPLACE',
      }),
      ...(contextual.length > 0
        ? [
            {
              id: 'otherContext' as const,
              label: copy.productPicker.otherContextSection,
              items: contextual,
            },
          ]
        : []),
    ];
  }, [activeIntent, options, query, scope]);
  const visibleOptions = useMemo(() => segments.flatMap((segment) => segment.items), [segments]);
  const uniqueOptionCount = uniqueCatalogProductCount(segments);
  const handoffTargetIndex = handoffTargetProductId
    ? visibleOptions.findIndex((option) => option.catalog?.id === handoffTargetProductId)
    : -1;
  const safeActiveIndex =
    handoffTargetIndex >= 0
      ? handoffTargetIndex
      : visibleOptions.length === 0
        ? 0
        : Math.min(Math.max(activeIndex, 0), visibleOptions.length - 1);

  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${safeActiveIndex}"]`,
    );
    option?.scrollIntoView({ block: 'nearest' });
  }, [safeActiveIndex]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!informationOption) return;
    queueMicrotask(() => informationCloseRef.current?.focus({ preventScroll: true }));
  }, [informationOption]);

  const close = (focusLineId?: string) => {
    setOpen(false);
    setUnavailableNotice(null);
    setInformationOption(null);
    onClose?.();
    queueMicrotask(() => {
      if (focusLineId) {
        const row = Array.from(document.querySelectorAll<HTMLElement>('[data-line-id]')).find(
          (candidate) => candidate.dataset.lineId === focusLineId,
        );
        if (row) {
          row.focus();
          row.scrollIntoView({ block: 'nearest' });
          return;
        }
      }
      triggerRef.current?.focus({ preventScroll: true });
    });
  };

  const closeInformation = () => {
    const canonicalId = informationOption?.canonicalId;
    setInformationOption(null);
    if (!canonicalId) return;
    queueMicrotask(() => {
      const trigger = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-info-product-id]'),
      ).find((candidate) => candidate.dataset.infoProductId === canonicalId);
      trigger?.focus({ preventScroll: true });
    });
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setActiveIntent(intent);
    setActiveFamily(null);
    setContextQuery('');
    defaultFilterAppliedRef.current = false;
    if (globalCatalog.favoritesSettled) {
      setActiveFilter(resolveInitialProductDiscoveryFilter(globalCatalog.favorites.size));
      setActiveSubfilter('all');
      defaultFilterAppliedRef.current = true;
    }
    setActiveIndex(0);
    setUnavailableNotice(null);
    setInformationOption(null);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const routeToOtherScope = (option: PickerOption) => {
    if (!option.catalog) return;
    const compatibility = getProductPickerCompatibility(option.catalog, scope);
    if (compatibility.state !== 'AVAILABLE_IN_OTHER_CONTEXT') return;
    if (!onRouteToScope) {
      setUnavailableNotice(
        compatibility.redirectScope === 'BASE_FORMULATION'
          ? copy.productPicker.contextual.openIngredientManually
          : copy.productPicker.contextual.openToppingManually,
      );
      return;
    }
    setOpen(false);
    setUnavailableNotice(null);
    setInformationOption(null);
    onRouteToScope({
      targetScope: compatibility.redirectScope,
      query,
      productId: option.catalog.id,
    });
  };

  const choose = async (option: PickerOption | undefined) => {
    if (!option || adding) return;
    if (!option.selectable) {
      setUnavailableNotice(publicPickerUnavailableReason(option, scope));
      return;
    }
    setUnavailableNotice(null);
    if (
      !isProductPickerSelectionCurrent({
        serverSearch: library.serverSearch,
        serverSettled: globalCatalog.isSettled,
        localOption: Boolean(option.local),
      })
    )
      return;
    setAdding(true);
    try {
      let ingredient: RecipeToppingIngredient | null = option.local ?? null;
      const canonicalCatalog = option.catalog;
      const resolvedExact =
        canonicalCatalog?.entityKind === 'pi_base'
          ? (canonicalCatalog.resolvedExactProduct ?? null)
          : null;
      if (
        resolvedExact &&
        (!canonicalCatalog ||
          !canonicalCatalog.mappedIngredientId ||
          resolvedExact.mappedIngredientId !== canonicalCatalog.mappedIngredientId)
      ) {
        setUnavailableNotice(
          `${option.name} wymaga odświeżenia powiązania produktu przed dodaniem.`,
        );
        return;
      }
      const catalogContext = scope === 'BASE_FORMULATION' ? 'BASE' : 'TOPPING';
      const resolvedExactHasSelectableOwnProfile =
        resolvedExact !== null &&
        catalogProductHasOwnEngineProfile(resolvedExact) &&
        currentCatalogArticleId(resolvedExact, catalogContext) !== null;
      // A country/default or CP-36 resolution owns the exact commercial
      // relationship, but it does not invent a second scientific profile. If
      // that exact SKU is not independently selectable with a complete
      // product-owned Engine profile and article identity, borrow the already-
      // approved Mapper row for the same server-resolved canonical slot while
      // retaining the exact SKU/version identity on the recipe line.
      const selectionCatalog =
        resolvedExact && !resolvedExactHasSelectableOwnProfile
          ? canonicalCatalog
          : (resolvedExact ?? canonicalCatalog);
      const relationshipCatalog = resolvedExact ?? canonicalCatalog;
      if (!ingredient && option.catalog) {
        const resolvedSelection = await resolveCurrentMapperCatalogSelection(
          selectionCatalog!,
          catalogContext,
          getEngineApprovedIngredientById,
        );
        if (!resolvedSelection.ok) {
          setUnavailableNotice(resolvedSelection.message);
          return;
        }
        ingredient =
          resolvedExact && resolvedSelection.kind === 'mapper'
            ? mappedCatalogIngredient(resolvedExact, resolvedSelection.row)
            : engineIngredientForCatalogSelection(selectionCatalog!, resolvedSelection);
      } else if (!ingredient) {
        ingredient = await getEngineApprovedIngredientById(option.id).then((row) =>
          row ? ingredientRowToEngineIngredient(row) : null,
        );
      }
      if (!ingredient) {
        setUnavailableNotice(
          `${option.name} nie jest już dostępny w aktualnych wynikach. Odśwież wyszukiwanie i wybierz produkt ponownie.`,
        );
        return;
      }
      if (activeIntent === 'ADD' && scope === 'BASE_FORMULATION' && onPreflightDuplicate) {
        const duplicate = onPreflightDuplicate(ingredient as EngineIngredient);
        if (duplicate?.focusLineId) {
          close(duplicate.focusLineId);
          return;
        }
      }
      let behavior: ProductBehaviorSnapshot | undefined;
      if (ingredient && behaviorContext) {
        const entity = relationshipCatalog
          ? relationshipCatalog.entityKind === 'pi_base' && relationshipCatalog.mappedIngredientId
            ? { entityKind: 'mapper' as const, entityId: relationshipCatalog.mappedIngredientId }
            : relationshipCatalog.currentVersionId
              ? {
                  entityKind: 'catalog_product_version' as const,
                  entityId: relationshipCatalog.currentVersionId,
                }
              : null
          : {
              entityKind: 'mapper' as const,
              entityId: canonicalIngredientId(ingredient as EngineIngredient),
            };
        if (entity === null) {
          setUnavailableNotice(`${option.name} wymaga odświeżenia danych produktu przed dodaniem.`);
          return;
        }
        const resolved = await resolveProductBehaviorForSelection({
          entity,
          context: {
            ...behaviorContext,
            processScope: scope,
            requestedRole: 'STANDARD',
            module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
          },
        }).catch(() => null);
        if (!resolved) {
          setUnavailableNotice(
            `Nie udało się potwierdzić aktualnych danych produktu ${option.name}. Spróbuj ponownie.`,
          );
          return;
        }
        if (resolved?.state === 'blocked') {
          setUnavailableNotice(productBehaviorBlockedMessage(resolved));
          return;
        }
        if (!option.catalog && !library.serverSearch) {
          const mapperRow = await getEngineApprovedIngredientById(entity.entityId).catch(
            () => null,
          );
          if (!mapperRow) {
            setUnavailableNotice(
              'Składnik demonstracyjny nie ma aktualnie dostępnego odpowiednika w katalogu składników.',
            );
            return;
          }
          ingredient = ingredientRowToEngineIngredient(mapperRow);
        }
        behavior = snapshotServerResolvedProductBehavior({
          lineId: '',
          processScope: scope,
          resolved,
        });
      }
      const selection = ingredient
        ? scope === 'POST_PROCESS_ADDON'
          ? onAdd(ingredient, behavior)
          : onAdd(ingredient as EngineIngredient, behavior)
        : undefined;
      if (ingredient) {
        if (
          option.catalog?.entityKind === 'commercial_product' &&
          option.catalog.mappedIngredientId
        ) {
          void setUserPreferredExactProductForSlot({
            mapperIngredientId: option.catalog.mappedIngredientId,
            productId: option.catalog.id,
          }).catch(() => undefined);
        }
        // Recent-use telemetry is private ranking metadata; an unavailable
        // backend must never turn a valid ingredient selection into an error.
        const relation = relationshipCatalog
          ? {
              entityKind: relationshipCatalog.entityKind,
              id:
                relationshipCatalog.entityKind === 'pi_base'
                  ? relationshipCatalog.mappedIngredientId!
                  : relationshipCatalog.id,
            }
          : { entityKind: 'pi_base' as const, id: option.id.replace(/^mapper:/, '') };
        void markCatalogProductUsed(relation).catch(() => undefined);
      }
      close(selection?.focusLineId);
    } finally {
      setAdding(false);
    }
  };

  const activateOption = (option: PickerOption | undefined) => {
    if (!option) return;
    const compatibility = option.catalog
      ? getProductPickerCompatibility(option.catalog, scope)
      : { state: 'ALLOWED' as const };
    if (compatibility.state === 'AVAILABLE_IN_OTHER_CONTEXT') {
      routeToOtherScope(option);
      return;
    }
    void choose(option);
  };

  /**
   * A scan that ends in the recipe (§37).
   *
   * The scanner resolves or creates the canonical product; this is the step that puts
   * it into the recipe the owner already had open, so nobody has to close the scanner
   * and search for the product they were just holding. The selection boundary is
   * unchanged: an existing PI/PR/PM article is added through the same fail-closed
   * selection and ProductBehavior path as a typed search result.
   */
  const addScannedProduct = async (resolved: ResolvedScanProduct) => {
    const context = scope === 'BASE_FORMULATION' ? 'BASE' : 'TOPPING';
    setAdding(true);
    try {
      const queries = [resolved.barcode, resolved.displayName].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );
      const hits = (
        await Promise.all(
          queries.map((search) =>
            searchProducts({ query: search, context, marketScope: 'global', limit: 20 }).catch(
              () => [],
            ),
          ),
        )
      ).flat();
      const hit = scannedProductRecipeTarget(hits, resolved, context);
      if (!hit) {
        // Never invent a recipe line for a product whose own profile is incomplete.
        setScanning(false);
        setUnavailableNotice(
          `${resolved.displayName} zapisano w katalogu produktów. Uzupełnij brakujące dane produktu, aby użyć go w recepturze.`,
        );
        return;
      }
      const selection = await resolveCurrentMapperCatalogSelection(
        hit,
        context,
        getEngineApprovedIngredientById,
      );
      if (!selection.ok) {
        setScanning(false);
        setUnavailableNotice(selection.message);
        return;
      }
      const ingredient = engineIngredientForCatalogSelection(hit, selection);
      if (!ingredient) {
        setScanning(false);
        setUnavailableNotice(
          `${hit.displayName} wymaga uzupełnienia danych produktu przed dodaniem do receptury.`,
        );
        return;
      }
      if (activeIntent === 'ADD' && scope === 'BASE_FORMULATION' && onPreflightDuplicate) {
        const duplicate = onPreflightDuplicate(ingredient as EngineIngredient);
        if (duplicate?.focusLineId) {
          setScanning(false);
          close(duplicate.focusLineId);
          return;
        }
      }
      let behavior: ProductBehaviorSnapshot | undefined;
      if (behaviorContext) {
        const entity =
          hit.entityKind === 'pi_base' && hit.mappedIngredientId
            ? { entityKind: 'mapper' as const, entityId: hit.mappedIngredientId }
            : hit.currentVersionId
              ? { entityKind: 'catalog_product_version' as const, entityId: hit.currentVersionId }
              : null;
        if (entity === null) {
          setScanning(false);
          setUnavailableNotice(
            `${hit.displayName} wymaga odświeżenia danych produktu przed dodaniem.`,
          );
          return;
        }
        const resolvedBehavior = await resolveProductBehaviorForSelection({
          entity,
          context: {
            ...behaviorContext,
            processScope: scope,
            requestedRole: 'STANDARD',
            module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
          },
        }).catch(() => null);
        if (!resolvedBehavior || resolvedBehavior.state === 'blocked') {
          setScanning(false);
          setUnavailableNotice(
            resolvedBehavior
              ? productBehaviorBlockedMessage(resolvedBehavior)
              : `Nie udało się potwierdzić aktualnych danych produktu ${hit.displayName}. Spróbuj ponownie.`,
          );
          return;
        }
        behavior = snapshotServerResolvedProductBehavior({
          lineId: '',
          processScope: scope,
          resolved: resolvedBehavior,
        });
      }
      const added =
        scope === 'POST_PROCESS_ADDON'
          ? onAdd(ingredient, behavior)
          : onAdd(ingredient as EngineIngredient, behavior);
      if (hit.entityKind === 'commercial_product' && hit.mappedIngredientId) {
        void setUserPreferredExactProductForSlot({
          mapperIngredientId: hit.mappedIngredientId,
          productId: hit.id,
        }).catch(() => undefined);
      }
      void markCatalogProductUsed({
        entityKind: hit.entityKind,
        id: hit.entityKind === 'pi_base' ? hit.mappedIngredientId! : hit.id,
      }).catch(() => undefined);
      setScanning(false);
      close(added?.focusLineId);
    } finally {
      setAdding(false);
    }
  };

  const label = triggerLabel ?? (scope === 'BASE_FORMULATION' ? 'Dodaj składnik' : 'Dodaj topping');
  const listId = `product-picker-${scope.toLowerCase()}-${pickerInstanceId}`;
  const dialogId = `${listId}-dialog`;
  const anchored = position?.desktop === true;
  const dialogStyle: CSSProperties | undefined = position
    ? anchored
      ? {
          left: position.left,
          top: position.top,
          width: position.width,
          height: position.height,
        }
      : {
          left: position.left,
          bottom: position.bottom,
          width: position.width,
          height: position.height,
        }
    : undefined;
  return (
    <div className={cn('relative', className)} data-picker-scope={scope}>
      {triggerVariant === 'icon' ? (
        <button
          ref={triggerRef}
          type="button"
          /* Designbook round icon button: neutral/graphite at rest, orange focus ring
             (`pro-focus-ring`), 44x44 so it clears the mobile touch target. */
          className={cn(
            iconButtonClasses(triggerSize),
            triggerSize === 'sm' && 'max-sm:size-11',
            'text-ink',
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          aria-label={label}
          onClick={toggle}
        >
          <span
            aria-hidden
            className="text-base leading-none"
            data-testid={scope === 'BASE_FORMULATION' ? 'ingredient-add-core' : undefined}
          >
            ＋
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            'pro-focus-ring relative inline-flex h-11 items-center justify-center rounded-xl px-4 text-xs font-semibold whitespace-nowrap transition-colors',
            scope === 'BASE_FORMULATION'
              ? 'border border-ink/20 bg-white text-ink hover:border-ink/40'
              : 'border border-ink/10 bg-[var(--g-ivory)] text-stone-700 hover:border-ink/25',
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          onClick={toggle}
        >
          <span
            className={cn(
              'inline-flex items-center justify-center',
              scope === 'BASE_FORMULATION' ? 'text-ink' : '',
            )}
            data-testid={scope === 'BASE_FORMULATION' ? 'ingredient-add-core' : undefined}
          >
            <span aria-hidden className="mr-1.5 text-base">
              ＋
            </span>
            {label}
          </span>
        </button>
      )}
      {open
        ? createPortal(
            <>
              <div
                className="pro-product-picker-backdrop fixed inset-0 z-[89] bg-black/10"
                aria-hidden="true"
                onPointerDown={(event) => {
                  // The anchored picker visually overlaps the workbench but PI
                  // remains a valid terminal action. If the pointer is exactly
                  // over the underlying PI control, close this dialog first and
                  // replay the single user action; every other backdrop click
                  // keeps the accepted close-only behavior.
                  closeProductPickerForPointer(event, close);
                }}
              />
              <div
                id={dialogId}
                ref={dialogRef}
                className={cn(
                  'shadow-pro-e3 fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-ink/12 bg-white',
                  anchored
                    ? 'translate-x-0 translate-y-0'
                    : 'inset-x-2 bottom-2 h-[calc(100dvh-1rem)] rounded-b-none rounded-t-[22px] pb-[env(safe-area-inset-bottom)] [padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)] [overscroll-behavior:contain]',
                )}
                style={dialogStyle}
                data-picker-position={anchored ? 'anchored' : 'keyboard-safe-sheet'}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (visibleOptions.length > 0) {
                      setHandoffTargetProductId(null);
                      setActiveIndex(Math.min(visibleOptions.length - 1, safeActiveIndex + 1));
                    }
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHandoffTargetProductId(null);
                    setActiveIndex(Math.max(0, safeActiveIndex - 1));
                  } else if (event.key === 'Enter' && event.target === inputRef.current) {
                    event.preventDefault();
                    activateOption(visibleOptions[safeActiveIndex]);
                  } else if (event.key === 'Tab') {
                    const focusable = Array.from(
                      dialogRef.current?.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
                      ) ?? [],
                    );
                    const first = focusable[0];
                    const last = focusable.at(-1);
                    if (event.shiftKey && document.activeElement === first && last) {
                      event.preventDefault();
                      last.focus();
                    } else if (!event.shiftKey && document.activeElement === last && first) {
                      event.preventDefault();
                      first.focus();
                    }
                  }
                }}
              >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
                  <div className="z-10 shrink-0 border-b border-ink/10 bg-white p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input
                          ref={inputRef}
                          type="text"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded="true"
                          aria-controls={listId}
                          aria-activedescendant={
                            visibleOptions.length > 0
                              ? `${listId}-${visibleOptions[safeActiveIndex]?.id}`
                              : undefined
                          }
                          aria-label={`Szukaj produktu — ${label}`}
                          placeholder="Szukaj produktu, marki lub numeru artykułu…"
                          value={query}
                          onChange={(event) => {
                            setQuery(event.currentTarget.value);
                            setHandoffTargetProductId(null);
                            setActiveIndex(0);
                            setUnavailableNotice(null);
                            setInformationOption(null);
                          }}
                          className="h-11 w-full rounded-xl border border-ink/15 bg-white px-4 pr-11 text-sm text-ink outline-none focus:border-[#f58a07] focus:ring-2 focus:ring-[#f58a07]/15"
                        />
                        {query ? (
                          <button
                            type="button"
                            aria-label="Wyczyść wyszukiwanie"
                            data-testid="product-picker-clear"
                            onClick={() => {
                              setQuery('');
                              setHandoffTargetProductId(null);
                              setActiveIndex(0);
                              setUnavailableNotice(null);
                              setInformationOption(null);
                              inputRef.current?.focus({ preventScroll: true });
                            }}
                            className="pro-focus-ring absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-base font-semibold text-stone-600 hover:bg-stone-100 hover:text-ink"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        data-testid="product-picker-scan"
                        aria-label={scanning ? 'Wróć do wyszukiwania' : 'Skanuj produkt'}
                        title={scanning ? 'Wróć do wyszukiwania' : 'Skanuj produkt'}
                        onClick={() => {
                          setScanning((current) => !current);
                          setUnavailableNotice(null);
                          setInformationOption(null);
                        }}
                        className="pro-focus-ring grid size-11 shrink-0 place-items-center rounded-full border border-ink/15 bg-white text-base font-semibold text-ink hover:border-ink/35 lg:size-10"
                      >
                        <span aria-hidden>▣</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Zamknij wyszukiwarkę produktów"
                        title="Zamknij"
                        className="pro-focus-ring grid size-11 shrink-0 place-items-center rounded-full border border-ink/15 bg-white text-lg font-semibold text-stone-600 hover:border-ink/35 hover:text-ink lg:size-10"
                        onClick={() => close()}
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </div>
                    <div
                      className="product-picker-filter-row mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      aria-label={discoveryCopy.filtersLabel}
                    >
                      {PRODUCT_DISCOVERY_TOP_FILTERS.map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          data-product-filter={filter}
                          aria-pressed={activeFilter === filter}
                          onClick={() => {
                            defaultFilterAppliedRef.current = true;
                            setActiveFilter(filter);
                            setActiveSubfilter('all');
                            setActiveFamily(null);
                            setContextQuery('');
                            setActiveIndex(0);
                            setUnavailableNotice(null);
                            setInformationOption(null);
                          }}
                          className={cn(
                            'pro-focus-ring inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold lg:min-h-8 lg:px-2',
                            activeFilter === filter
                              ? 'border-ink bg-ink text-white'
                              : 'border-ink/10 bg-white text-stone-600 hover:border-ink/25 hover:text-ink',
                          )}
                        >
                          <IngredientCategoryIcon symbol={discoveryFilterIcon(filter)} />
                          {discoveryCopy.topFilters[filter]}
                        </button>
                      ))}
                    </div>
                    {contextualSubfilters.length > 0 ? (
                      <div
                        className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-1 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        aria-label={discoveryCopy.subfiltersLabel}
                        data-testid="product-picker-contextual-filters"
                      >
                        {contextualSubfilters.map((subfilter) => (
                          <button
                            key={subfilter}
                            type="button"
                            data-product-subfilter={subfilter}
                            aria-pressed={activeSubfilter === subfilter}
                            onClick={() => {
                              setActiveSubfilter(subfilter);
                              setContextQuery('');
                              setActiveIndex(0);
                              setUnavailableNotice(null);
                              setInformationOption(null);
                            }}
                            className={cn(
                              'pro-focus-ring min-h-9 shrink-0 rounded-sm border px-2.5 text-[10px] font-semibold',
                              activeSubfilter === subfilter
                                ? 'border-[#f58a07]/55 bg-[#fff7ed] text-ink'
                                : 'border-ink/10 bg-white text-stone-500 hover:border-ink/25 hover:text-ink',
                            )}
                          >
                            {discoveryCopy.subfilters[subfilter]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-stone-600" role="status" aria-live="polite">
                      {library.serverSearch && query.trim() && !globalCatalog.isSettled
                        ? 'Szukam…'
                        : `Znaleziono ${uniqueOptionCount} ${uniqueOptionCount === 1 ? 'składnik' : 'składników'}`}
                    </p>
                  </div>
                  {scanning ? (
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                      <ScanFlow
                        mode="recipe"
                        onResolved={(resolved) => void addScannedProduct(resolved)}
                        resolveLabel={
                          activeIntent === 'REPLACE'
                            ? 'Zamień produkt'
                            : scope === 'BASE_FORMULATION'
                              ? 'Dodaj do receptury'
                              : 'Dodaj jako topping'
                        }
                        intro="Pokaż kod kreskowy produktu aparatowi. Znaleziony lub zapisany produkt wraca prosto do tej receptury."
                      />
                    </div>
                  ) : (
                    <div className="relative min-h-0 flex-1">
                      <div
                        id={listId}
                        ref={listRef}
                        role="listbox"
                        aria-label={`Produkty — ${label}`}
                        className="product-picker-results h-full overflow-y-auto scroll-smooth p-2 motion-reduce:scroll-auto 2xl:pr-[19px]"
                        onScroll={(event) => {
                          const list = event.currentTarget;
                          const maxScroll = list.scrollHeight - list.clientHeight;
                          if (maxScroll <= 0) {
                            setScrollThumb((current) =>
                              current.visible ? { ...current, visible: false } : current,
                            );
                            return;
                          }
                          const height = Math.max(
                            36,
                            Math.min(
                              50,
                              (list.clientHeight * list.clientHeight) / list.scrollHeight,
                            ),
                          );
                          const top =
                            (list.scrollTop / maxScroll) * Math.max(0, list.clientHeight - height);
                          setScrollThumb({ top, height, visible: true });
                          if (
                            library.serverSearch &&
                            globalCatalog.hasMore &&
                            !globalCatalog.isFetching &&
                            list.scrollTop + list.clientHeight >= list.scrollHeight - 80
                          ) {
                            globalCatalog.loadMore();
                          }
                        }}
                      >
                        {visibleOptions.length === 0 ? (
                          query.trim() && (!library.serverSearch || globalCatalog.isSettled) ? (
                            <div className="px-3 py-5 text-sm text-stone-600">
                              <p>Nie znaleziono produktu.</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {activeFilter === 'favorites' ? (
                                  <button
                                    type="button"
                                    data-testid="product-picker-search-all"
                                    className="pro-focus-ring min-h-11 rounded-sm border border-ink bg-ink px-4 text-xs font-semibold text-white"
                                    onClick={() => {
                                      defaultFilterAppliedRef.current = true;
                                      setActiveFilter('all');
                                      setActiveSubfilter('all');
                                      setActiveFamily(null);
                                      setContextQuery('');
                                      setActiveIndex(0);
                                    }}
                                  >
                                    {discoveryCopy.searchAll}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="pro-focus-ring min-h-11 rounded-full border border-ink/15 bg-white px-4 text-xs font-semibold text-ink"
                                  onClick={() => setScanning(true)}
                                >
                                  Skanuj
                                </button>
                                <Link
                                  to="/products/add"
                                  className="pro-focus-ring inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-4 text-xs font-semibold text-ink"
                                  onClick={() => close()}
                                >
                                  Dodaj ręcznie
                                </Link>
                              </div>
                            </div>
                          ) : (
                            <p className="px-3 py-5 text-sm text-stone-600">
                              {globalCatalog.isFetching
                                ? 'Wczytuję katalog…'
                                : 'Brak produktów w wybranym filtrze.'}
                            </p>
                          )
                        ) : (
                          segments.map((segment, segmentIndex) => {
                            const segmentOffset = segments
                              .slice(0, segmentIndex)
                              .reduce((count, previous) => count + previous.items.length, 0);
                            return (
                              <Fragment key={segment.id}>
                                <p
                                  role="presentation"
                                  data-picker-segment={segment.id}
                                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500"
                                >
                                  {segment.label}
                                </p>
                                {segment.items.map((option, itemIndex) => {
                                  const index = segmentOffset + itemIndex;
                                  const compatibility = option.catalog
                                    ? getProductPickerCompatibility(option.catalog, scope)
                                    : { state: 'ALLOWED' as const };
                                  if (
                                    option.catalog &&
                                    compatibility.state === 'AVAILABLE_IN_OTHER_CONTEXT'
                                  ) {
                                    return (
                                      <ProductPickerContextualRow
                                        key={option.canonicalId}
                                        product={option.catalog}
                                        compatibility={compatibility}
                                        optionId={`${listId}-${option.id}`}
                                        optionIndex={index}
                                        active={index === safeActiveIndex}
                                        onActivate={() => {
                                          setHandoffTargetProductId(null);
                                          setActiveIndex(index);
                                        }}
                                        onRoute={() => routeToOtherScope(option)}
                                      />
                                    );
                                  }
                                  return (
                                    <div
                                      key={option.canonicalId}
                                      role="presentation"
                                      className={cn(
                                        'relative flex min-h-16 w-full items-center rounded-xl border border-transparent',
                                        index === safeActiveIndex
                                          ? 'border-ink/10 bg-[var(--g-ivory)] text-ink'
                                          : 'hover:border-ink/8 hover:bg-[var(--g-ivory)]',
                                        !option.selectable ? 'cursor-not-allowed opacity-60' : '',
                                      )}
                                      onMouseEnter={() => {
                                        setHandoffTargetProductId(null);
                                        setActiveIndex(index);
                                      }}
                                    >
                                      <button
                                        id={`${listId}-${option.id}`}
                                        type="button"
                                        role="option"
                                        aria-selected={index === safeActiveIndex}
                                        aria-disabled={!option.selectable}
                                        aria-label={`${option.name}. ${
                                          option.selectable
                                            ? 'Dostępny w wybranym zakresie'
                                            : 'Wymaga uzupełnienia'
                                        }${
                                          !option.selectable && option.catalog
                                            ? `. Niedostępny. ${publicPickerUnavailableReason(option, scope)}`
                                            : ''
                                        }`}
                                        data-option-index={index}
                                        data-entity-kind={option.catalog?.entityKind}
                                        data-product-id={option.catalog?.id}
                                        data-product-version-id={
                                          option.catalog?.currentVersionId ?? undefined
                                        }
                                        data-mapper-id={
                                          option.catalog?.mappedIngredientId ?? undefined
                                        }
                                        data-picker-data-confidence={
                                          option.confidencePercent ?? undefined
                                        }
                                        data-product-form={option.catalog?.productForm ?? undefined}
                                        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                                        onClick={() => void choose(option)}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={cn(
                                            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                                            !option.selectable
                                              ? 'bg-red-100 text-red-700'
                                              : option.verification.status ===
                                                  'GELLATTI — SPRAWDZONY'
                                                ? 'bg-[#e8f7eb] text-[#1a9b3d]'
                                                : option.entityKind === 'pi_base'
                                                  ? 'bg-[#fff4e2] text-[#f58a07]'
                                                  : 'bg-slate-200 text-slate-700',
                                          )}
                                        >
                                          {option.selectable ? (
                                            <IngredientCategoryIcon
                                              symbol={ingredientCategorySymbolFor({
                                                category: option.category,
                                                form: option.detail,
                                              })}
                                              className="size-[18px]"
                                            />
                                          ) : (
                                            <span aria-hidden>!</span>
                                          )}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                                            <span className="truncate">{option.name}</span>
                                            <CarbonationBubbles status={option.carbonationStatus} />
                                          </span>
                                          <span className="block truncate text-[11px] text-stone-500">
                                            {[option.brand, pickerCategoryLabel(option)]
                                              .filter(Boolean)
                                              .join(' · ')}
                                          </span>
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Pokaż status danych produktu: ${option.name}`}
                                        data-info-product-id={option.canonicalId}
                                        className="pro-focus-ring grid size-9 shrink-0 place-items-center rounded-full border border-ink/10 text-xs font-semibold text-stone-600"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setInformationOption(option);
                                        }}
                                      >
                                        ?
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={
                                          option.favorite
                                            ? `Usuń ${option.name} z Ulubionych`
                                            : `Dodaj ${option.name} do Ulubionych`
                                        }
                                        aria-pressed={option.favorite}
                                        className={cn(
                                          'pro-focus-ring grid size-10 shrink-0 place-items-center rounded-lg text-base max-sm:size-9',
                                          option.favorite ? 'text-[#f58a07]' : 'text-stone-500',
                                        )}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          globalCatalog.toggleFavorite(
                                            option.entityKind,
                                            option.entityKind === 'pi_base'
                                              ? (option.catalog?.mappedIngredientId ??
                                                  option.id.replace(/^mapper:/, ''))
                                              : (option.catalog?.id ??
                                                  option.id.replace(/^catalog:/, '')),
                                            !option.favorite,
                                          );
                                        }}
                                      >
                                        <span aria-hidden>{option.favorite ? '★' : '☆'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`${activeIntent === 'REPLACE' ? discoveryCopy.replace : discoveryCopy.add}${
                                          activeIntent === 'REPLACE' ? ' na' : ''
                                        } ${option.name}`}
                                        disabled={!option.selectable || adding}
                                        className={cn(
                                          'pro-focus-ring mr-2 grid min-h-9 shrink-0 place-items-center rounded-lg border border-ink/10 bg-white leading-none text-ink shadow-sm hover:border-[#f58a07]/60 hover:text-[#f58a07] disabled:cursor-not-allowed disabled:opacity-40',
                                          activeIntent === 'REPLACE'
                                            ? 'px-3 text-[11px] font-semibold'
                                            : 'size-9 text-xl',
                                        )}
                                        onClick={() => void choose(option)}
                                      >
                                        {activeIntent === 'REPLACE' ? discoveryCopy.replace : '+'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </Fragment>
                            );
                          })
                        )}
                        {library.serverSearch && globalCatalog.isError ? (
                          <p className="px-3 py-3 text-xs text-status-error" role="alert">
                            Nie udało się pobrać produktów. Spróbuj ponownie.
                          </p>
                        ) : null}
                      </div>
                      {informationOption ? (
                        <div className="absolute inset-0 z-40 grid place-items-center bg-white/88 p-4 backdrop-blur-[2px]">
                          <section
                            role="dialog"
                            aria-modal="true"
                            aria-label={`Status danych produktu: ${informationOption.name}`}
                            data-testid="product-data-status-dialog"
                            className="w-full max-w-[420px] rounded-xl border border-ink/12 bg-white p-5 text-ink shadow-pro-e2"
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                event.stopPropagation();
                                closeInformation();
                              } else if (event.key === 'Tab') {
                                event.preventDefault();
                                informationCloseRef.current?.focus({ preventScroll: true });
                              }
                            }}
                          >
                            <h2 className="pr-10 text-base font-semibold leading-snug">
                              {informationOption.name}
                            </h2>
                            <dl className="mt-5 grid gap-4">
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                                  {informationOption.entityKind === 'commercial_product'
                                    ? 'ID produktu'
                                    : 'ID'}
                                </dt>
                                <dd className="mt-1 font-mono text-sm font-semibold">
                                  {informationOption.canonicalId}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                                  Pewność
                                </dt>
                                <dd className="mt-1 font-mono text-sm font-semibold">
                                  {formatDataConfidencePercent(informationOption.confidencePercent)}
                                </dd>
                              </div>
                            </dl>
                            <button
                              ref={informationCloseRef}
                              type="button"
                              className="pro-focus-ring mt-6 min-h-11 rounded-lg border border-ink/15 px-4 text-xs font-semibold text-ink"
                              onClick={closeInformation}
                            >
                              Zamknij
                            </button>
                          </section>
                        </div>
                      ) : null}
                      <span
                        aria-hidden="true"
                        data-testid="product-picker-scroll-thumb"
                        className={cn(
                          'pointer-events-none absolute right-[3px] top-0 z-20 hidden w-[7px] rounded-full bg-[rgb(193_193_193)] 2xl:block',
                          scrollThumb.visible ? 'opacity-100' : 'opacity-0',
                        )}
                        style={{
                          height: scrollThumb.height,
                          transform: `translateY(${scrollThumb.top}px)`,
                        }}
                      />
                    </div>
                  )}
                  {unavailableNotice ? (
                    <p
                      className="shrink-0 border-t border-attention/25 bg-pro-amber/35 px-3 py-2 text-xs leading-relaxed text-stone-700"
                      role="status"
                      aria-live="polite"
                      data-testid="product-picker-unavailable-reason"
                    >
                      {unavailableNotice}
                    </p>
                  ) : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
