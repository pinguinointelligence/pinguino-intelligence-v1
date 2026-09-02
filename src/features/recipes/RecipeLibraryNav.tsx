import type { KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import {
  RECIPE_LIBRARY_LINKS,
  RECIPE_LIBRARY_TABS,
  recipeLibraryHref,
  type RecipeLibraryTab,
} from './recipeLibrary';

const stripClasses =
  'gellatti-library-tabs mb-8 flex max-w-full flex-wrap items-end justify-start gap-0 overflow-hidden border-b border-ink/15';
const entryClasses = (active: boolean) =>
  cn(
    'min-h-12 shrink-0 border-b-2 px-4 text-[13px] font-semibold tracking-normal',
    active ? 'border-[#ef8708] text-ink' : 'border-transparent text-stone-600 hover:text-ink',
  );

interface TabsModeProps {
  mode: 'tabs';
  activeTab: RecipeLibraryTab;
  onSelect: (tab: RecipeLibraryTab) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: RecipeLibraryTab) => void;
}

interface LinksModeProps {
  mode: 'links';
  /** The library route that is currently open, so it can carry `aria-current`. */
  activeHref: (typeof RECIPE_LIBRARY_LINKS)[number][0];
}

/**
 * The one Recipes library strip.
 *
 * `/community` and `/top100` are part of the Recipes experience, not separate
 * destinations the customer is thrown into: they keep this strip, so the way
 * back to the library is always where the way out was. Inside `/recipes` the
 * four library panels stay a real tablist; on the two public routes every
 * entry is a link, which is what a route change actually is.
 */
export function RecipeLibraryNav(props: TabsModeProps | LinksModeProps) {
  return (
    <div className={stripClasses}>
      {props.mode === 'tabs' ? (
        <div
          role="tablist"
          aria-label="Biblioteka receptur"
          className="flex w-full min-w-0 max-w-full overflow-x-auto lg:w-auto"
        >
          {RECIPE_LIBRARY_TABS.map(([id, label]) => (
            <button
              key={id}
              id={`recipes-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={props.activeTab === id}
              aria-controls={`recipes-panel-${id}`}
              tabIndex={props.activeTab === id ? 0 : -1}
              onClick={() => props.onSelect(id)}
              onKeyDown={(event) => props.onKeyDown(event, id)}
              className={entryClasses(props.activeTab === id)}
              data-testid={`recipes-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <nav
          aria-label="Biblioteka receptur"
          className="flex w-full min-w-0 max-w-full overflow-x-auto lg:w-auto"
        >
          {RECIPE_LIBRARY_TABS.map(([id, label]) => (
            <Link
              key={id}
              to={recipeLibraryHref(id)}
              className={cn(entryClasses(false), 'inline-flex items-center')}
              data-testid={`recipes-tab-${id}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <nav
        aria-label="Gellatti Community"
        className="flex w-full min-w-0 max-w-full overflow-x-auto lg:w-auto"
      >
        {RECIPE_LIBRARY_LINKS.map(([href, label]) => {
          const active = props.mode === 'links' && props.activeHref === href;
          return (
            <Link
              key={href}
              to={href}
              aria-current={active ? 'page' : undefined}
              className={cn(entryClasses(active), 'inline-flex items-center')}
              data-testid={`recipes-link-${href.slice(1)}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
