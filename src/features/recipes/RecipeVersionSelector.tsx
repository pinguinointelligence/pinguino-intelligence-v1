/**
 * WERSJA — the inline immutable-version selector on a „Moje receptury" row.
 *
 * NAVIGATION ONLY. Picking `v1` here changes nothing in the database: no restore, no parent update,
 * no `updated_at` touch, no new version. It records which immutable snapshot the row's „Otwórz"
 * should open, and nothing else — the whole component is local state over data the list already
 * loaded. The one write path for versions stays the explicit „Przywróć tę wersję" action in the
 * workbench, which appends a new latest version the way it always has.
 *
 * Version numbers and dates only. No UUID, no snapshot id, no internal identifier reaches the user.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { formatSavedRecipeDate } from './savedRecipeDate';
import type { SavedRecipeVersionRef } from './recipePayload';

export interface RecipeVersionSelectorProps {
  /** Newest first. A single-version recipe renders a one-item list, never an empty menu. */
  versions: readonly SavedRecipeVersionRef[];
  /** Currently chosen version number (defaults to the newest when absent). */
  selected: number;
  onSelect: (versionNumber: number) => void;
  /** Row name, for the accessible label — several selectors share one page. */
  recipeName: string;
}

export function RecipeVersionSelector({
  versions,
  selected,
  onSelect,
  recipeName,
}: RecipeVersionSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // A row whose history could not be read (legacy orphan) has nothing to choose between.
  const hasHistory = versions.length > 0;
  const latest = versions[0]?.versionNumber ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!hasHistory) {
    return <span className="text-sm text-ink">—</span>;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Wersja receptury ${recipeName}: v${selected}. Wybierz wersję do otwarcia.`}
        data-testid={`recipe-version-selector-${recipeName}`}
        onClick={() => setOpen((value) => !value)}
        className="pro-focus-ring inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-sm text-ink transition-colors hover:bg-education-ivory/70"
      >
        <span>v{selected}</span>
        <span aria-hidden className="text-[0.6rem] leading-none text-stone-400">
          ▾
        </span>
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-label={`Wersje receptury ${recipeName}`}
          className="absolute right-0 z-40 mt-1 min-w-[13rem] rounded-xl border border-ink/12 bg-white p-1 shadow-pro-e3"
        >
          {versions.map((version) => {
            const isSelected = version.versionNumber === selected;
            return (
              <li key={version.versionNumber}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`recipe-version-option-${recipeName}-v${version.versionNumber}`}
                  onClick={() => {
                    onSelect(version.versionNumber);
                    setOpen(false);
                  }}
                  className={`pro-focus-ring flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-education-ivory/70 ${
                    isSelected ? 'bg-education-ivory/55' : ''
                  }`}
                >
                  <span className="text-ink">v{version.versionNumber}</span>
                  <span className="text-stone-500">·</span>
                  <span className="text-stone-600">
                    {formatSavedRecipeDate(version.createdAt)}
                  </span>
                  {version.versionNumber === latest ? (
                    <span className="ml-auto text-xs text-stone-500">Aktualna</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The version a row opens by default: the newest one. Kept pure and exported so the default can be
 * asserted directly, and so a refreshed list resets to the newest rather than pinning a stale pick.
 */
export function defaultSelectedVersion(
  versions: readonly SavedRecipeVersionRef[],
  latestVersionNumber?: number,
): number | null {
  return versions[0]?.versionNumber ?? latestVersionNumber ?? null;
}

/**
 * The selection a row should render, given what the user picked earlier. A pick that no longer
 * exists in the freshly loaded history (row refreshed, recipe restored elsewhere) falls back to the
 * newest version rather than pointing at a version that is gone.
 */
export function resolveSelectedVersion(
  versions: readonly SavedRecipeVersionRef[],
  picked: number | undefined,
  latestVersionNumber?: number,
): number | null {
  if (picked !== undefined && versions.some((v) => v.versionNumber === picked)) return picked;
  return defaultSelectedVersion(versions, latestVersionNumber);
}
