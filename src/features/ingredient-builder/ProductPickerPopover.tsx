import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { getIngredientById } from '@/services/ingredients';
import { cn } from '@/lib/cn';
import { filterIngredients, type IngredientLibrary } from './ingredientLibrary';
import { useIngredientSearch } from './useIngredientSearch';
import { isProductPickerSelectionCurrent } from './productPickerModel';

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
}

export function ProductPickerPopover({
  library,
  scope,
  onAdd,
  triggerLabel,
  className,
}: {
  library: IngredientLibrary;
  scope: ProductPickerScope;
  onAdd: (ingredient: EngineIngredient) => ProductPickerSelectionResult | void;
  triggerLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pickerInstanceId = useId().replace(/:/g, '');
  const server = useIngredientSearch({ enabled: open && library.serverSearch, query });

  const options = useMemo<PickerOption[]>(() => {
    if (library.serverSearch) {
      // Never expose hits belonging to the previous debounced query. A quick
      // type -> Enter must not add a stale canonical ingredient.
      const hits = server.isSettled
        ? server.hits.map((hit) => ({ id: hit.id, name: hit.name, detail: hit.form }))
        : [];
      const q = query.trim().toLocaleLowerCase('pl');
      const products = library.products
        .filter((item) => !q || `${item.name} ${item.id}`.toLocaleLowerCase('pl').includes(q))
        .map((item) => ({ id: item.id, name: item.name, detail: 'Mój produkt', local: item }));
      return [...new Map([...hits, ...products].map((option) => [option.id, option])).values()];
    }
    return filterIngredients(library.ingredients, query, library.searchIndex).map((item) => ({
      id: item.id,
      name: item.name,
      detail: library.formIndex.get(item.id) ?? '',
      local: item,
    }));
  }, [library, query, server.hits, server.isSettled]);
  const safeActiveIndex = options.length === 0
    ? 0
    : Math.min(Math.max(activeIndex, 0), options.length - 1);

  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${safeActiveIndex}"]`);
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
    queueMicrotask(() => {
      if (focusLineId) {
        const row = Array.from(
          document.querySelectorAll<HTMLElement>('[data-line-id]'),
        ).find((candidate) => candidate.dataset.lineId === focusLineId);
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
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const choose = async (option: PickerOption | undefined) => {
    if (!option || adding) return;
    if (
      !isProductPickerSelectionCurrent({
        serverSearch: library.serverSearch,
        serverSettled: server.isSettled,
        localOption: Boolean(option.local),
      })
    ) return;
    setAdding(true);
    try {
      const ingredient = option.local ?? (await getIngredientById(option.id).then((row) =>
        row ? ingredientRowToEngineIngredient(row) : null,
      ));
      const selection = ingredient ? onAdd(ingredient) : undefined;
      close(selection?.focusLineId);
    } finally {
      setAdding(false);
    }
  };

  const label = triggerLabel ?? (scope === 'BASE_FORMULATION' ? 'Dodaj składnik' : 'Dodaj topping');
  const listId = `product-picker-${scope.toLowerCase()}-${pickerInstanceId}`;
  const dialogId = `${listId}-dialog`;
  return (
    <div className={cn('relative', className)} data-picker-scope={scope}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'pro-focus-ring inline-flex h-11 items-center justify-center rounded-xl px-4 text-xs font-semibold transition-colors',
          scope === 'BASE_FORMULATION'
            ? 'bg-ink text-white hover:bg-graphite'
            : 'border border-status-ideal/30 bg-pro-sage text-ink hover:border-status-ideal/55',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={toggle}
      >
        <span aria-hidden className="mr-1.5 text-base">＋</span>
        {label}
      </button>
      {open ? createPortal(<>
        <div
          className="fixed inset-0 z-[89] bg-black/10"
          aria-hidden="true"
          onPointerDown={() => close()}
        />
        <div
          id={dialogId}
          ref={dialogRef}
          className="shadow-pro-e3 fixed left-1/2 top-1/2 z-[90] flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-ink/12 bg-white"
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
          <div className="sticky top-0 z-10 border-b border-ink/10 bg-white p-3">
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-controls={listId}
              aria-expanded="true"
              aria-activedescendant={options[safeActiveIndex] ? `${listId}-${options[safeActiveIndex]!.id}` : undefined}
              aria-label={`Szukaj produktu — ${label}`}
              placeholder="Szukaj produktu, marki lub ID…"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              className="h-11 w-full rounded-xl border border-ink/15 bg-stone-50 px-3 text-sm text-ink outline-none focus:border-gold"
            />
            <p className="mt-2 text-xs text-stone-600" role="status" aria-live="polite">
              {library.serverSearch && query.trim() && !server.isSettled
                ? 'Szukam…'
                : `${options.length} wyników`}
            </p>
          </div>
          <div
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={`Produkty — ${label}`}
            className="max-h-[min(26rem,58vh)] scroll-smooth overflow-y-auto p-2 motion-reduce:scroll-auto"
          >
            {options.length === 0 ? (
              <p className="px-3 py-5 text-sm text-stone-600">
                {query.trim() ? 'Brak wyników. Zmień wyszukiwanie.' : 'Zacznij wpisywać nazwę produktu.'}
              </p>
            ) : (
              options.map((option, index) => (
                <button
                  id={`${listId}-${option.id}`}
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={index === safeActiveIndex}
                  data-option-index={index}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left',
                    index === safeActiveIndex ? 'bg-education-ivory text-ink' : 'hover:bg-stone-50',
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void choose(option)}
                >
                  <span className="min-w-0 truncate text-sm font-semibold">{option.name}</span>
                  <span className="shrink-0 text-xs text-stone-600">{option.detail}</span>
                </button>
              ))
            )}
            {library.serverSearch && server.hasMore ? (
              <button
                type="button"
                className="mt-1 min-h-11 w-full rounded-xl border border-ink/10 text-xs font-semibold text-ink"
                onClick={server.loadMore}
              >
                Pokaż więcej
              </button>
            ) : null}
            {library.serverSearch && server.isError ? (
              <p className="px-3 py-4 text-sm text-status-error" role="alert">
                Nie udało się pobrać wyników. Spróbuj ponownie.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="min-h-11 border-t border-ink/10 text-xs font-semibold text-stone-600"
            onClick={() => close()}
          >
            Zamknij
          </button>
        </div>
      </>, document.body) : null}
    </div>
  );
}
