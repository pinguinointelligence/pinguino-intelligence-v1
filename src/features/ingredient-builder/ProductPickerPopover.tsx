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
import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import { markCatalogProductUsed } from '@/services/globalCatalog';
import { cn } from '@/lib/cn';
import { mappedCatalogIngredient, labelOnlyCatalogToppingIngredient } from '@/features/global-catalog/catalogIngredient';
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
  productPickerUnavailableReason,
} from './productPickerModel';

export type ProductPickerScope = 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';

export interface ProductPickerSelectionResult {
  /** Existing or newly-created row that should receive focus after close. */
  focusLineId?: string;
}

interface PickerOption {
  id: string;
  name: string;
  detail: string;
  local?: EngineIngredient;
  entityKind: 'pi_base' | 'commercial_product';
  status: 'pi_base' | 'verified' | 'manual_unverified' | 'blocked';
  favorite: boolean;
  market: string | null;
  originalName: string | null;
  catalog?: CatalogProductSearchHit;
  group: 'favorites_recent' | 'pi_base' | 'verified_markets' | 'manual' | 'global' | 'blocked';
  selectable: boolean;
}

const DESKTOP_PICKER_WIDTH = 499;
const DESKTOP_PICKER_HEIGHT = 480;
const DESKTOP_PICKER_GAP = 12;
const GROUP_LABELS: Record<PickerOption['group'], string> = {
  favorites_recent: 'Ulubione i ostatnio używane',
  pi_base: 'PINGÜINO Base',
  verified_markets: 'Zweryfikowane na Twoich rynkach',
  manual: 'Dodane manualnie',
  global: 'Pozostałe produkty światowe',
  blocked: 'Wymagają uzupełnienia',
};

interface PickerPosition {
  desktop: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

type ProductPickerPopoverProps = {
  library: IngredientLibrary;
  triggerLabel?: string;
  className?: string;
  behaviorContext?: Omit<ProductBehaviorContext, 'processScope' | 'requestedRole' | 'module'>;
} & (
  | { scope: 'BASE_FORMULATION'; onAdd: (ingredient: EngineIngredient, behavior?: ProductBehaviorSnapshot) => ProductPickerSelectionResult | void }
  | { scope: 'POST_PROCESS_ADDON'; onAdd: (ingredient: RecipeToppingIngredient, behavior?: ProductBehaviorSnapshot) => ProductPickerSelectionResult | void }
);

export function ProductPickerPopover({
  library,
  scope,
  onAdd,
  triggerLabel,
  className,
  behaviorContext,
}: ProductPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [marketFilter, setMarketFilter] = useState<string | null>(null);
  const [scrollThumb, setScrollThumb] = useState({ top: 0, height: 50, visible: false });
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pickerInstanceId = useId().replace(/:/g, '');
  const globalCatalog = useGlobalCatalogPicker({
    enabled: open && library.serverSearch,
    query,
    favoritesOnly,
    context: scope === 'BASE_FORMULATION' ? 'BASE' : 'TOPPING',
    productProfile: behaviorContext?.productProfile ?? null,
    selectedMarkets: marketFilter && marketFilter !== '__GLOBAL__' ? [marketFilter] : [],
    forceGlobal: marketFilter === '__GLOBAL__',
    limit: 500,
  });
  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const desktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!desktop) {
        setPosition({ desktop: false, left: 0, top: 0, width: 0, height: 0 });
        return;
      }
      const monitorLeft = document
        .querySelector<HTMLElement>('[data-testid="pro-monitor-panel"]')
        ?.getBoundingClientRect().left;
      const rightLimit = Math.min(window.innerWidth - 16, (monitorLeft ?? window.innerWidth) - 16);
      const width = Math.max(320, Math.min(DESKTOP_PICKER_WIDTH, rightLimit - trigger.left));
      const top = trigger.bottom + DESKTOP_PICKER_GAP;
      const height = Math.max(280, Math.min(DESKTOP_PICKER_HEIGHT, window.innerHeight - top - 16));
      setPosition({ desktop: true, left: trigger.left, top, width, height });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const options = useMemo<PickerOption[]>(() => {
    if (library.serverSearch) {
      // Never expose hits belonging to the previous debounced query. A quick
      // type -> Enter must not add a stale canonical ingredient.
      const catalog = globalCatalog.isSettled ? preserveServerProductRank(
        globalCatalog.hits,
        globalCatalog.preferences,
      ).map((hit) => ({
        id: hit.entityKind === 'pi_base'
          ? `mapper:${hit.mappedIngredientId ?? hit.id}`
          : `catalog:${hit.id}`,
        name: hit.displayName,
        detail: hit.productForm ?? hit.brand ?? hit.canonicalFamily ?? 'Produkt',
        entityKind: hit.entityKind,
        status: hit.status,
        favorite: hit.favorite,
        market: hit.markets[0] ?? null,
        originalName: hit.originalName,
        catalog: hit,
        group: hit.group,
        selectable: scope === 'BASE_FORMULATION' ? hit.usableInBase : hit.usableAsTopping,
      })) : [];
      // The RPC is relevance-first. Do not sort or filter by presentation group
      // afterwards: multilingual and typo hits must retain server authority.
      // Legacy owner-private `library.products` are deliberately absent here;
      // they are neither shared-catalog UUIDs nor automatically VERIFIED.
      const relevant = catalog
        .filter((option) => !favoritesOnly || option.favorite);
      return [...new Map(relevant.map((option) => [option.id, option])).values()];
    }
    return filterIngredients(library.ingredients, query, library.searchIndex).map((item) => ({
      id: item.id,
      name: item.name,
      detail: library.formIndex.get(item.id) ?? '',
      local: item,
      entityKind: 'pi_base' as const,
      status: 'pi_base' as const,
      favorite: false,
      market: null,
      originalName: null,
      group: 'pi_base' as const,
      selectable: true,
    }));
  }, [favoritesOnly, globalCatalog.hits, globalCatalog.isSettled, globalCatalog.preferences, library, query, scope]);
  const safeActiveIndex =
    options.length === 0 ? 0 : Math.min(Math.max(activeIndex, 0), options.length - 1);

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

  const close = (focusLineId?: string) => {
    setOpen(false);
    setUnavailableNotice(null);
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
      triggerRef.current?.focus();
    });
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setActiveIndex(0);
    setUnavailableNotice(null);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const choose = async (option: PickerOption | undefined) => {
    if (!option || adding) return;
    if (!option.selectable) {
      setUnavailableNotice(
        option.catalog
          ? productPickerUnavailableReason(scope, option.catalog)
          : 'Ten produkt nie jest dostępny w wybranym zakresie.',
      );
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
        if (option.catalog.entityKind === 'pi_base' && option.catalog.mappedIngredientId) {
          ingredient = await getEngineApprovedIngredientById(option.catalog.mappedIngredientId).then((row) =>
            row ? ingredientRowToEngineIngredient(row) : null,
          );
        } else if (scope === 'POST_PROCESS_ADDON') {
          ingredient = labelOnlyCatalogToppingIngredient(option.catalog);
        } else if (option.catalog.mappedIngredientId) {
          ingredient = await getEngineApprovedIngredientById(option.catalog.mappedIngredientId).then((row) =>
            row ? mappedCatalogIngredient(option.catalog!, row) : null,
          );
        }
      } else if (!ingredient) {
        ingredient = await getEngineApprovedIngredientById(option.id).then((row) =>
          row ? ingredientRowToEngineIngredient(row) : null,
        );
      }
      if (!ingredient) {
        setUnavailableNotice(
          'Produkt utracił aktualne zatwierdzenie PINGÜINO. Odśwież wyszukiwanie i wybierz ponownie.',
        );
        return;
      }
      let behavior: ProductBehaviorSnapshot | undefined;
      if (ingredient && behaviorContext) {
        const entity = option.catalog
          ? option.catalog.entityKind === 'pi_base' && option.catalog.mappedIngredientId
            ? { entityKind: 'mapper' as const, entityId: option.catalog.mappedIngredientId }
            : option.catalog.currentVersionId
            ? { entityKind: 'catalog_product_version' as const, entityId: option.catalog.currentVersionId }
            : null
          : {
              entityKind: 'mapper' as const,
              entityId: canonicalIngredientId(ingredient as EngineIngredient),
            };
        if (entity === null) {
          setUnavailableNotice('Produkt nie ma jeszcze niezmiennej wersji danych.');
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
            'Nie udało się potwierdzić aktualnego zachowania produktu. Spróbuj ponownie.',
          );
          return;
        }
        if (resolved?.state === 'blocked') {
          setUnavailableNotice(productBehaviorBlockedMessage(resolved));
          return;
        }
        if (!option.catalog && !library.serverSearch) {
          const mapperRow = await getEngineApprovedIngredientById(entity.entityId).catch(() => null);
          if (!mapperRow) {
            setUnavailableNotice('Składnik demonstracyjny nie ma zatwierdzonego odpowiednika PINGÜINO Base.');
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
        void markCatalogProductUsed({
          entityKind: option.entityKind,
          id: option.entityKind === 'pi_base'
            ? (option.catalog?.mappedIngredientId ?? option.id.replace(/^mapper:/,''))
            : (option.catalog?.id ?? option.id.replace(/^catalog:/,'')),
        }).catch(() => undefined);
      }
      close(selection?.focusLineId);
    } finally {
      setAdding(false);
    }
  };

  const label = triggerLabel ?? (scope === 'BASE_FORMULATION' ? 'Dodaj składnik' : 'Dodaj topping');
  const listId = `product-picker-${scope.toLowerCase()}-${pickerInstanceId}`;
  const dialogId = `${listId}-dialog`;
  const anchored = position?.desktop === true;
  const dialogStyle: CSSProperties | undefined = anchored
    ? {
        left: position.left,
        top: position.top,
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
          'pro-focus-ring relative inline-flex h-11 items-center justify-center rounded-xl px-4 text-xs font-semibold whitespace-nowrap transition-colors 2xl:h-[46px] 2xl:w-[125px] 2xl:p-0 2xl:text-[11px]',
          scope === 'BASE_FORMULATION'
            ? 'bg-ink text-white hover:bg-graphite 2xl:bg-transparent 2xl:shadow-none 2xl:hover:bg-transparent'
            : 'border border-status-ideal/30 bg-pro-sage text-ink hover:border-status-ideal/55',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={toggle}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center',
            scope === 'BASE_FORMULATION'
              ? '2xl:absolute 2xl:inset-1 2xl:rounded-lg 2xl:bg-ink 2xl:text-white 2xl:shadow-pro-e1'
              : '',
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
                className="fixed inset-0 z-[89] bg-black/10 lg:bg-transparent"
                aria-hidden="true"
                onPointerDown={() => close()}
              />
              <div
                id={dialogId}
                ref={dialogRef}
                className={cn(
                  'shadow-pro-e3 fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-ink/12 bg-white 2xl:border-[3px] 2xl:!border-transparent 2xl:bg-transparent 2xl:!shadow-none',
                  anchored
                    ? 'translate-x-0 translate-y-0'
                    : 'left-1/2 top-1/2 h-[min(29.75rem,calc(100dvh-2rem))] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
                )}
                style={dialogStyle}
                data-picker-position={anchored ? 'anchored' : 'modal'}
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
                    if (options.length > 0) {
                      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
                    }
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(0, index - 1));
                  } else if (event.key === 'Enter' && event.target === inputRef.current) {
                    event.preventDefault();
                    void choose(options[safeActiveIndex]);
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
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden 2xl:rounded-[14px] 2xl:border 2xl:border-ink/35 2xl:bg-white">
                  <div className="z-10 shrink-0 border-b border-ink/10 bg-white p-3 2xl:pb-[7px] 2xl:pl-[11px] 2xl:pr-[11px] 2xl:pt-[10px]">
                    <div className="relative">
                      <input
                        ref={inputRef}
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-activedescendant={options.length > 0 ? `${listId}-${options[safeActiveIndex]?.id}` : undefined}
                        aria-label={`Szukaj produktu — ${label}`}
                        placeholder="Szukaj produktu, marki lub ID…"
                        value={query}
                         onChange={(event) => {
                           setQuery(event.currentTarget.value);
                           setActiveIndex(0);
                           setUnavailableNotice(null);
                        }}
                        className="h-11 w-full rounded-xl border border-ink/15 bg-stone-50 px-3 pr-11 text-sm text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/18 2xl:h-[38px] 2xl:border-gold/55 2xl:ring-1 2xl:ring-gold/18"
                      />
                      {query ? (
                        <button
                          type="button"
                          aria-label="Wyczyść wyszukiwanie"
                          data-testid="product-picker-clear"
                           onClick={() => {
                             setQuery('');
                             setActiveIndex(0);
                             setUnavailableNotice(null);
                            inputRef.current?.focus();
                          }}
                          className="pro-focus-ring absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-base font-semibold text-stone-600 hover:bg-stone-100 hover:text-ink"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 flex min-h-7 items-center gap-1.5 overflow-x-auto 2xl:h-[18px] 2xl:min-h-0" aria-label={library.serverSearch ? 'Filtry katalogu' : undefined}>
                      <p className="mr-auto shrink-0 text-xs text-stone-600 2xl:text-[10px]" role="status" aria-live="polite">
                        {library.serverSearch && query.trim() && !globalCatalog.isSettled
                          ? 'Szukam…'
                          : `${options.length} wyników`}
                      </p>
                      {library.serverSearch ? (
                        <>
                        <button
                          type="button"
                          aria-pressed={favoritesOnly}
                          onClick={() => {
                            setFavoritesOnly((value) => !value);
                            setUnavailableNotice(null);
                          }}
                          className={cn(
                            "pro-focus-ring min-h-11 shrink-0 rounded-full border px-2.5 text-[10px] font-semibold 2xl:relative 2xl:min-h-[18px] 2xl:px-2 2xl:text-[9px] 2xl:after:absolute 2xl:after:-inset-y-[3px] 2xl:after:inset-x-0 2xl:after:content-['']",
                            favoritesOnly ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600',
                          )}
                        >
                          <span aria-hidden>★</span> Ulubione
                        </button>
                        {[globalCatalog.preferences.primaryMarket, ...globalCatalog.preferences.additionalMarkets]
                          .filter((value): value is string => Boolean(value))
                          .slice(0, 2)
                          .map((market) => (
                            <button
                              key={market}
                              type="button"
                              aria-pressed={marketFilter === market}
                              onClick={() => {
                                setMarketFilter((value) => value === market ? null : market);
                                setUnavailableNotice(null);
                              }}
                              className={cn(
                                "pro-focus-ring min-h-11 shrink-0 rounded-full border px-2.5 text-[10px] font-semibold 2xl:relative 2xl:min-h-[18px] 2xl:px-2 2xl:text-[9px] 2xl:after:absolute 2xl:after:-inset-y-[3px] 2xl:after:inset-x-0 2xl:after:content-['']",
                                marketFilter === market ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600',
                              )}
                            >
                              {market}
                            </button>
                          ))}
                        <Link
                          to="/account#product-markets-heading"
                          className="pro-focus-ring min-h-11 shrink-0 rounded-full px-2 text-[10px] font-semibold text-stone-600 2xl:relative 2xl:min-h-[18px] 2xl:text-[9px] 2xl:after:absolute 2xl:after:-inset-y-[3px] 2xl:after:inset-x-0 2xl:after:content-['']"
                          onClick={() => close()}
                        >
                          + Rynek
                        </Link>
                        <button
                          type="button"
                          aria-pressed={marketFilter === '__GLOBAL__'}
                          onClick={() => {
                            setMarketFilter((value) => value === '__GLOBAL__' ? null : '__GLOBAL__');
                            setUnavailableNotice(null);
                          }}
                          className={cn(
                            "pro-focus-ring min-h-11 shrink-0 rounded-full border px-2 text-[10px] font-semibold 2xl:relative 2xl:min-h-[18px] 2xl:text-[9px] 2xl:after:absolute 2xl:after:-inset-y-[3px] 2xl:after:inset-x-0 2xl:after:content-['']",
                            marketFilter === '__GLOBAL__' ? 'border-gold bg-gold/12 text-ink' : 'border-ink/12 text-stone-600',
                          )}
                        >
                          Cały świat
                        </button>
                        </>
                      ) : null}
                    </div>
                  </div>
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
                          Math.min(50, (list.clientHeight * list.clientHeight) / list.scrollHeight),
                        );
                        const top =
                          (list.scrollTop / maxScroll) * Math.max(0, list.clientHeight - height);
                        setScrollThumb({ top, height, visible: true });
                        if (
                          library.serverSearch
                          && globalCatalog.hasMore
                          && !globalCatalog.isFetching
                          && list.scrollTop + list.clientHeight >= list.scrollHeight - 80
                        ) {
                          globalCatalog.loadMore();
                        }
                      }}
                    >
                    {options.length === 0 ? (
                      <p className="px-3 py-5 text-sm text-stone-600">
                        {query.trim()
                          ? 'Brak wyników. Zmień wyszukiwanie.'
                          : 'Zacznij wpisywać nazwę produktu.'}
                      </p>
                    ) : (
                      options.map((option, index) => (
                        <Fragment key={option.id}>
                        {index === 0 || options[index - 1]?.group !== option.group ? (
                          <p role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                            {GROUP_LABELS[option.group]}
                          </p>
                        ) : null}
                        <div
                          role="presentation"
                          className={cn(
                            'flex min-h-11 w-full items-center rounded-xl lg:min-h-[38px] lg:rounded-lg',
                            index === safeActiveIndex
                              ? 'bg-education-ivory text-ink'
                              : 'hover:bg-stone-50',
                            !option.selectable ? 'cursor-not-allowed opacity-60' : '',
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                        >
                          <button
                            id={`${listId}-${option.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === safeActiveIndex}
                            aria-disabled={!option.selectable}
                            aria-label={
                              `${option.name}. ${
                                option.status === 'pi_base'
                                  ? 'PINGÜINO Base'
                                  : option.status === 'verified'
                                    ? 'GREEN, zweryfikowany'
                                    : option.status === 'manual_unverified'
                                      ? 'BLUE, manualny i niezweryfikowany'
                                      : 'RED, wymaga uzupełnienia'
                              }${!option.selectable && option.catalog
                                ? `. Niedostępny. ${productPickerUnavailableReason(scope, option.catalog)}`
                                : ''}`
                            }
                            data-option-index={index}
                            title={
                              !option.selectable && option.catalog
                                ? productPickerUnavailableReason(scope, option.catalog)
                              : option.status === 'pi_base'
                                ? 'PINGÜINO Base'
                                : option.status === 'verified'
                                  ? 'Zweryfikowany — dane etykiety potwierdzone'
                                  : option.status === 'manual_unverified'
                                    ? 'Dodany manualnie · Niezweryfikowany'
                                    : `Nie można zweryfikować${option.catalog && (option.catalog.missingFields.length + option.catalog.invalidFields.length) > 0 ? `: ${[...option.catalog.missingFields, ...option.catalog.invalidFields].join(', ')}` : ''}`
                            }
                            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left lg:py-1.5 2xl:pl-[11px] 2xl:pr-1"
                            onClick={() => void choose(option)}
                          >
                     <span
                            aria-label={
                              option.status === 'pi_base'
                                ? 'PINGÜINO Base'
                                : option.status === 'verified'
                                  ? 'Zweryfikowany'
                                  : option.status === 'manual_unverified'
                                    ? 'Dodany manualnie, niezweryfikowany'
                                    : 'Nie można zweryfikować'
                            }
                            className={cn(
                              'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                              option.status === 'pi_base' ? 'bg-gold/16 text-gold' :
                                option.status === 'verified' ? 'bg-status-ideal/12 text-status-ideal' :
                                  option.status === 'manual_unverified' ? 'bg-slate-200 text-slate-700' :
                                    'bg-red-100 text-red-700',
                            )}
                          >
                            <span aria-hidden>{option.status === 'pi_base' ? 'PI' : option.status === 'verified' ? '✓' : option.status === 'manual_unverified' ? '✎' : '!'}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{option.name}</span>
                            {option.originalName && option.originalName !== option.name ? (
                              <span className="block truncate text-[10px] text-stone-500">oryg. {option.originalName}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[10px] text-stone-600">{option.market ?? option.detail}</span>
                          </button>
                          {option.status !== 'blocked' ? <button
                            type="button"
                            aria-label={option.favorite ? `Usuń ${option.name} z Ulubionych` : `Dodaj ${option.name} do Ulubionych`}
                            aria-pressed={option.favorite}
                            className={cn('pro-focus-ring grid size-11 shrink-0 place-items-center rounded-lg text-base 2xl:size-8', option.favorite ? 'text-gold' : 'text-stone-500')}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              globalCatalog.toggleFavorite(
                                option.entityKind,
                                option.entityKind === 'pi_base'
                                  ? (option.catalog?.mappedIngredientId ?? option.id.replace(/^mapper:/,''))
                                  : (option.catalog?.id ?? option.id.replace(/^catalog:/,'')),
                                !option.favorite,
                              );
                            }}
                          >
                            <span aria-hidden>{option.favorite ? '★' : '☆'}</span>
                          </button> : <span className="px-2 text-[9px] font-semibold text-red-700">Uzupełnij</span>}
                        </div>
                        </Fragment>
                      ))
                    )}
                    {library.serverSearch && globalCatalog.isError ? (
                      <p className="px-3 py-3 text-xs text-status-error" role="alert">
                        Nie udało się pobrać produktów. Spróbuj ponownie.
                      </p>
                    ) : null}
                    </div>
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
                  <button
                    type="button"
                    className="min-h-11 border-t border-ink/10 text-xs font-semibold text-stone-600 2xl:h-[39px] 2xl:min-h-0"
                    onClick={() => close()}
                  >
                    Zamknij
                  </button>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
