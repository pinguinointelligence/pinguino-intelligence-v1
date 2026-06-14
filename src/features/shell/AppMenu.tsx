import { useState } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { copy } from '@/copy/en';
import { ACTIVE_ENGINE } from '@/data/engines';
import { cn } from '@/lib/cn';

const m = copy.menu;

const itemClass =
  'block rounded-md px-3 py-2 text-sm text-ink transition-colors hover:bg-ink/5';
const soonChip =
  'rounded border border-ink/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-stone-400 uppercase';

/** Top-left hamburger — New, Advanced Studio, and future subscriber items (Step 6A). */
export function AppMenu({ onNew }: { onNew?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={m.title}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-ink transition-colors hover:bg-ink/5"
      >
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full bg-ink/20"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 border-r border-ink/10 bg-paper p-5">
            <div className="mb-5 flex items-center gap-3">
              <IvoryLogoMark size={22} tone="ink" />
              <span className="text-sm font-light tracking-wordmark">{m.title}</span>
            </div>

            <Link
              to="/demo"
              className={itemClass}
              onClick={() => {
                onNew?.();
                setOpen(false);
              }}
            >
              {m.newRecipe}
            </Link>
            <Link to="/studio" className={itemClass} onClick={() => setOpen(false)}>
              {m.advancedStudio}
            </Link>

            <div className="mt-3 border-t border-ink/5 pt-3">
              {[m.items.myRecipes, m.items.production, m.items.saved].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-stone-400"
                >
                  <span>{label}</span>
                  <span className={soonChip}>{m.soon}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-ink/5 pt-3 text-xs text-stone-500">
              <span>{m.activeEngine}</span>
              <span className={cn('font-mono text-ink')}>{ACTIVE_ENGINE.label}</span>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
