import {
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
import type { EngineIngredient } from '@/engine';
import type { CarbonationStatus } from '@/data/products/carbonation';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import { markCatalogProductUsed, searchProducts } from '@/services/globalCatalog';
import {
  LiveProductScanner,
  type ResolvedScanProduct,
} from '@/features/product-scanner/LiveProductScanner';
import { cn } from '@/lib/cn';
import { preserveServerProductRank } from '@/features/global-catalog/ranking';
import { useGlobalCatalogPicker } from '@/features/global-catalog/useGlobalCatalogPicker';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
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
import { closeProductPickerForPointer } from './productPickerBackdrop';
import { mobileProductPickerRect } from './productPickerViewport';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import {
  ingredientCategoryMatchesFilter,
  ingredientCategorySymbolFor,
  type IngredientCategoryFilterId,
} from './ingredientCategorySymbols';
import {
  buildProductPickerSegments,
  canonicalCatalogProductId,
  catalogDataConfidencePercent,
  formatDataConfidencePercent,
  normalizeDataConfidencePercent,
  uniqueCatalogProductCount,
} from './productPickerCatalogPresentation';
import {
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
  market: string | null;
  originalName: string | null;
  catalog?: CatalogProductSearchHit;
  verification: ProductPickerVerificationView;
  canonicalId: string;
  confidencePercent: number | null;
  selectable: boolean;
  carbonationStatus: CarbonationStatus;
}

const PICKER_FILTERS: ReadonlyArray<{ id: IngredientCategoryFilterId; label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'favorites', label: 'Ulubione' },
  { id: 'fresh', label: 'Świeże' },
  { id: 'dairy', label: 'Mleczne' },
  { id: 'dry', label: 'Suche' },
  { id: 'chocolate', label: 'Czekolada' },
  { id: 'fruit', label: 'Owoce' },
  { id: 'nuts', label: 'Orzechy' },
  { id: 'paste', label: 'Pasty' },
];

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

const matchesPickerFilter = (option: PickerOption, filter: IngredientCategoryFilterId): boolean =>
  ingredientCategoryMatchesFilter(
    { category: option.category, form: option.detail, favorite: option.favorite },
    filter,
  );

interface PickerPosition {
  desktop: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  bottom?: number;
}

type ProductPickerPopoverProps = {
  library: IngredientLibrary;
  triggerLabel?: string;
  className?: string;
  behaviorContext?: Omit<ProductBehaviorContext, 'processScope' | 'requestedRole' | 'module'>;
  /** Read-only Base duplicate check before ProductBehavior/network work. The
   * store's atomic add remains the final race-safe authority. */
  onPreflightDuplicate?: (ingredient: EngineIngredient) => ProductPickerSelectionResult | void;
  intent?: 'ADD' | 'REPLACE';
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
  className,
  behaviorContext,
  onPreflightDuplicate,
  handoff,
  onRouteToScope,
  intent = 'ADD',
}: ProductPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  const [informationOption, setInformationOption] = useState<PickerOption | null>(null);
  const [handoffTargetProductId, setHandoffTargetProductId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<IngredientCategoryFilterId>('all');
  const [scanning, setScanning] = useState(false);
  const [scrollThumb, setScrollThumb] = useState({ top: 0, height: 50, visible: false });
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const informationCloseRef = useRef<HTMLButtonElement>(null);
  const lastHandoffKeyRef = useRef<number | null>(null);
  const pickerInstanceId = useId().replace(/:/g, '');
  const globalCatalog = useGlobalCatalogPicker({
    enabled: open && library.serverSearch,
    query,
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
    if (!handoff || handoff.scope !== scope || lastHandoffKeyRef.current === handoff.key) {
      return;
    }
    lastHandoffKeyRef.current = handoff.key;
    setQuery(handoff.query);
    setHandoffTargetProductId(handoff.productId);
    setActiveFilter('all');
    setActiveIndex(0);
    setUnavailableNotice(null);
    setInformationOption(null);
    setScanning(false);
    setOpen(true);
  }, [handoff, scope]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => inputRef.current?.focus({ preventScroll: true }));
  }, [handoff?.key, open]);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const desktop = window.matchMedia('(min-width: 1280px)').matches;
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
      const editor = document
        .querySelector<HTMLElement>('[data-testid="workbench-editor-pane"]')
        ?.getBoundingClientRect();
      if (!editor) return;
      const top = Math.max(84, editor.top);
      const height = Math.max(320, Math.min(editor.height, window.innerHeight - top - 16));
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
      const catalog = globalCatalog.isSettled
        ? preserveServerProductRank(eligible, globalCatalog.preferences).map((hit) => ({
            id:
              hit.entityKind === 'pi_base'
                ? `mapper:${hit.mappedIngredientId ?? hit.id}`
                : `catalog:${hit.id}`,
            name: hit.displayName,
            detail: hit.productForm ?? hit.brand ?? hit.canonicalFamily ?? 'Produkt',
            brand: hit.brand,
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
      // The RPC is relevance-first. Do not sort or filter by presentation group
      // afterwards: multilingual and typo hits must retain server authority.
      // Legacy owner-private `library.products` are deliberately absent here;
      // they are neither shared-catalog UUIDs nor automatically VERIFIED.
      const relevant = catalog.filter((option) => matchesPickerFilter(option, activeFilter));
      return [...new Map(relevant.map((option) => [option.id, option])).values()];
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
      .filter((option) => matchesPickerFilter(option, activeFilter));
  }, [
    activeFilter,
    globalCatalog.hits,
    globalCatalog.isSettled,
    globalCatalog.preferences,
    globalCatalog.recent,
    library,
    query,
    scope,
  ]);
  const segments = useMemo(() => {
    const primary = options.filter((option) => {
      if (!option.catalog) return true;
      return (
        getProductPickerCompatibility(option.catalog, scope).state !== 'AVAILABLE_IN_OTHER_CONTEXT'
      );
    });
    const contextual = (intent === 'ADD' ? options : [])
      .filter((option) => {
        if (!option.catalog) return false;
        return (
          getProductPickerCompatibility(option.catalog, scope).state ===
            'AVAILABLE_IN_OTHER_CONTEXT' && contextualPickerMatch(option.catalog, query)
        );
      })
      .slice(0, 5);
    return [
      ...buildProductPickerSegments(primary, { activeQuery: query.trim() !== '' }),
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
  }, [intent, options, query, scope]);
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
      if (!ingredient && option.catalog) {
        const resolvedSelection = await resolveCurrentMapperCatalogSelection(
          option.catalog,
          scope === 'BASE_FORMULATION' ? 'BASE' : 'TOPPING',
          getEngineApprovedIngredientById,
        );
        if (!resolvedSelection.ok) {
          setUnavailableNotice(resolvedSelection.message);
          return;
        }
        ingredient = engineIngredientForCatalogSelection(option.catalog, resolvedSelection);
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
      if (scope === 'BASE_FORMULATION' && onPreflightDuplicate) {
        const duplicate = onPreflightDuplicate(ingredient as EngineIngredient);
        if (duplicate?.focusLineId) {
          close(duplicate.focusLineId);
          return;
        }
      }
      let behavior: ProductBehaviorSnapshot | undefined;
      if (ingredient && behaviorContext) {
        const entity = option.catalog
          ? option.catalog.entityKind === 'pi_base' && option.catalog.mappedIngredientId
            ? { entityKind: 'mapper' as const, entityId: option.catalog.mappedIngredientId }
            : option.catalog.currentVersionId
              ? {
                  entityKind: 'catalog_product_version' as const,
                  entityId: option.catalog.currentVersionId,
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
        // Recent-use telemetry is private ranking metadata; an unavailable
        // backend must never turn a valid ingredient selection into an error.
        const relation = option.catalog
          ? {
              entityKind: option.catalog.entityKind,
              id:
                option.catalog.entityKind === 'pi_base'
                  ? option.catalog.mappedIngredientId!
                  : option.catalog.id,
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
      if (scope === 'BASE_FORMULATION' && onPreflightDuplicate) {
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
      {open
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[89] bg-black/10 xl:bg-transparent"
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
                      className="mt-2 flex flex-wrap items-center gap-1.5"
                      aria-label="Filtry katalogu"
                    >
                      {PICKER_FILTERS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          aria-pressed={activeFilter === filter.id}
                          onClick={() => {
                            setActiveFilter(filter.id);
                            setActiveIndex(0);
                            setUnavailableNotice(null);
                            setInformationOption(null);
                          }}
                          className={cn(
                            'pro-focus-ring inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold lg:min-h-8 lg:px-2',
                            activeFilter === filter.id
                              ? 'border-[#29a447]/50 bg-[#effaf1] text-[#14762d]'
                              : 'border-ink/10 bg-white text-stone-600 hover:border-ink/25 hover:text-ink',
                          )}
                        >
                          <IngredientCategoryIcon symbol={filter.id} />
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-stone-600" role="status" aria-live="polite">
                      {library.serverSearch && query.trim() && !globalCatalog.isSettled
                        ? 'Szukam…'
                        : `Znaleziono ${uniqueOptionCount} ${uniqueOptionCount === 1 ? 'składnik' : 'składników'}`}
                    </p>
                  </div>
                  {scanning ? (
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                      <LiveProductScanner
                        onResolved={(resolved) => void addScannedProduct(resolved)}
                        resolveLabel={
                          scope === 'BASE_FORMULATION' ? 'Dodaj do receptury' : 'Dodaj jako topping'
                        }
                        intro="Pokaż produkt kamerze. Znaleziony lub utworzony produkt wraca prosto do tej receptury."
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
                                        aria-label={`Dodaj ${option.name}`}
                                        disabled={!option.selectable || adding}
                                        className="pro-focus-ring mr-2 grid size-9 shrink-0 place-items-center rounded-xl border border-ink/10 bg-white text-xl leading-none text-ink shadow-sm hover:border-[#f58a07]/60 hover:text-[#f58a07] disabled:cursor-not-allowed disabled:opacity-40"
                                        onClick={() => void choose(option)}
                                      >
                                        +
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
