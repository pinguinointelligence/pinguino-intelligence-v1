/**
 * PINGÜINO Pro — the sticky top WORKBAR (owner binding decision: primary actions always visible).
 *
 * One bar at the top of the Pro recipe workspace holds: the recipe name (an inline field for a NEW
 * recipe / the name + inline rename for a saved one), the canonical SAVE directly beside it
 * („Zapisz recepturę" → v1 / „Zapisz nową wersję" → v(n+1)), the compact recipe context, the
 * `DD.MM.YYYY · vN` version label, the save/dirty status, and the two top-priority actions
 * „Monitor PI" + „Przelicz z PI" (dark primary). No scrolling to the bottom to save/recalc; no
 * second save handler — it delegates to `useCanonicalRecipeSave`. Responsive: rows wrap on mobile.
 */
import { useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';

const w = copy.proWorkbar;

const PRODUCT: Record<string, string> = {
  milk_gelato: 'Gelato', fruit_gelato: 'Sorbet owocowy', nut_gelato: 'Gelato orzechowe',
  chocolate_gelato: 'Gelato czekoladowe', alcohol_gelato: 'Gelato alkoholowe', sorbet: 'Sorbet',
  vegan_gelato: 'Gelato wegańskie', custom: 'Custom',
};
const TIER: Record<string, string> = { eco: 'Eco', classic: 'Classic', premium: 'Premium', signature: 'Signature' };

/** Customer-facing version label: `DD.MM.YYYY · vN` from the stored ISO date (timezone-independent). */
function versionLabel(versionNumber: number | null, iso: string | null): string | null {
  if (versionNumber == null) return null;
  if (!iso) return `v${versionNumber}`;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y} · v${versionNumber}` : `v${versionNumber}`;
}

export function ProWorkbar({ onMonitor, onRecalc }: { onMonitor: () => void; onRecalc: () => void }) {
  const savedRecipeId = useRecipeStore((s) => s.savedRecipeId);
  const savedRecipeName = useRecipeStore((s) => s.savedRecipeName);
  const currentVersionNumber = useRecipeStore((s) => s.currentVersionNumber);
  const currentVersionDate = useRecipeStore((s) => s.currentVersionDate);
  const dirty = useRecipeStore((s) => s.dirty);
  const category = useRecipeStore((s) => s.category);
  const mode = useRecipeStore((s) => s.mode);
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);

  const save = useCanonicalRecipeSave();
  const linked = Boolean(savedRecipeId);

  const [name, setName] = useState(savedRecipeName ?? '');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [saveAsNew, setSaveAsNew] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const context = `${PRODUCT[category] ?? category} · ${TIER[mode] ?? mode} · ${temperatureC} °C · ${batchGrams} g`;
  const label = versionLabel(currentVersionNumber, currentVersionDate);

  const statusKey: keyof typeof w.status = save.error
    ? 'error'
    : save.busy
      ? 'saving'
      : !linked
        ? 'newUnsaved'
        : dirty
          ? 'dirty'
          : 'clean';
  const statusTone =
    statusKey === 'error' ? 'text-status-risky' : statusKey === 'dirty' ? 'text-amber-700' : 'text-stone-500';

  const blockedMsg = save.blocked ? w.blocked[save.blocked] : null;

  const doCreate = async () => {
    if (!name.trim()) {
      setNameError(w.emptyNameError);
      return;
    }
    setNameError(null);
    const ok = await save.createNew(name.trim(), showNote ? note : undefined);
    if (ok) {
      setSaveAsNew(false);
      setShowNote(false);
      setNote('');
    }
  };
  const doVersion = async () => {
    const ok = await save.saveVersion(showNote ? note : undefined);
    if (ok) {
      setShowNote(false);
      setNote('');
    }
  };
  const doRename = async () => {
    if (!renameValue.trim()) return;
    const ok = await save.rename(renameValue.trim());
    if (ok) setRenaming(false);
  };

  // NEW recipe (or explicit „save as new") → inline name field + primary save.
  const showNameField = !linked || saveAsNew;

  return (
    <section
      aria-label="PINGÜINO Pro — pasek narzędzi receptury"
      data-testid="pro-workbar"
      className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur sm:px-6"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
    >
      {/* Row 1 — name + save (beside the name) + more */}
      <div className="flex flex-wrap items-center gap-2">
        {showNameField ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <label className="sr-only" htmlFor="pro-workbar-name">{w.nameLabel}</label>
            <input
              id="pro-workbar-name"
              value={name}
              placeholder={w.namePlaceholder}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              data-testid="pro-workbar-name"
              className="min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:border-ink/40 focus:outline-none"
            />
          </div>
        ) : renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              data-testid="pro-workbar-rename-input"
              className="min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none"
            />
            <button type="button" className={buttonClasses('primary', 'sm')} onClick={() => void doRename()} disabled={save.busy}>
              {w.confirm}
            </button>
            <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => setRenaming(false)}>
              {w.cancel}
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-base font-medium text-ink" data-testid="pro-workbar-recipe-name">
              {savedRecipeName ?? '—'}
            </span>
            <button
              type="button"
              aria-label={w.rename}
              onClick={() => {
                setRenameValue(savedRecipeName ?? '');
                setRenaming(true);
              }}
              className="rounded p-1 text-stone-400 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                <path d="M4 20h4L18 10l-4-4L4 16v4zM14 6l4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Primary save — directly beside the name */}
        {showNameField ? (
          <button
            type="button"
            onClick={() => void doCreate()}
            disabled={save.busy || save.blocked !== null}
            data-testid="pro-workbar-save"
            className={cn(buttonClasses('primary', 'sm'), (save.busy || save.blocked !== null) && 'opacity-50')}
          >
            {save.busy ? w.status.saving : saveAsNew ? w.saveAsNew : w.saveNew}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void doVersion()}
            disabled={save.busy || save.blocked !== null}
            data-testid="pro-workbar-save"
            className={cn(buttonClasses('primary', 'sm'), (save.busy || save.blocked !== null) && 'opacity-50')}
          >
            {save.busy ? w.status.saving : w.saveVersion((currentVersionNumber ?? 0) + 1)}
          </button>
        )}

        {/* Secondary menu (saved recipe only) */}
        {linked && !saveAsNew && !renaming ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label={w.more}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="pro-workbar-more"
              className="grid h-9 w-9 place-items-center rounded-md border border-ink/15 text-ink transition-colors hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {menuOpen ? (
              <div role="menu" className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-ink/10 bg-paper py-1 shadow-lg">
                <button type="button" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-ink/5" onClick={() => { setMenuOpen(false); setSaveAsNew(true); setName(''); }}>
                  {w.saveAsNew}
                </button>
                <button type="button" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-ink/5" onClick={() => { setMenuOpen(false); setRenameValue(savedRecipeName ?? ''); setRenaming(true); }}>
                  {w.rename}
                </button>
                <button type="button" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-ink/5" onClick={() => { setMenuOpen(false); setShowNote((v) => !v); }}>
                  {w.addNote}
                </button>
                <button type="button" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-status-risky hover:bg-ink/5" onClick={() => { setMenuOpen(false); if (window.confirm(w.archive + '?')) void save.archive(); }}>
                  {w.archive}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {saveAsNew ? (
          <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => { setSaveAsNew(false); setName(savedRecipeName ?? ''); }}>
            {w.cancel}
          </button>
        ) : null}
      </div>

      {/* optional note field */}
      {showNameField || showNote ? (
        <div className="mt-2">
          {!showNote ? (
            <button type="button" className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink" onClick={() => setShowNote(true)}>
              {w.addNote}
            </button>
          ) : (
            <textarea
              rows={2}
              value={note}
              placeholder={w.noteLabel}
              onChange={(e) => setNote(e.target.value)}
              data-testid="pro-workbar-note"
              className="w-full resize-none rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:border-ink/40 focus:outline-none"
            />
          )}
        </div>
      ) : null}

      {nameError ? (
        <p role="alert" className="mt-1 text-xs text-status-risky" data-testid="pro-workbar-name-error">{nameError}</p>
      ) : null}
      {save.error ? (
        <p role="alert" className="mt-1 text-xs text-status-risky" data-testid="pro-workbar-error">{save.error}</p>
      ) : null}
      {blockedMsg && !save.error ? <p className="mt-1 text-xs text-stone-500">{blockedMsg}</p> : null}

      {/* Row 2 — context + version + status, and Row 3 — Monitor + Przelicz */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 text-xs text-stone-500">
          <p className="truncate" data-testid="pro-workbar-context">{context}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2">
            {label ? <span className="text-ink" data-testid="pro-workbar-version">{label}</span> : null}
            <span className={statusTone} data-testid="pro-workbar-status">{w.status[statusKey]}</span>
            {linked && dirty ? <span className="text-amber-700">· {w.pendingRecalc}</span> : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMonitor}
            data-testid="pro-workbar-monitor"
            className={buttonClasses('ghost', 'sm')}
          >
            {w.monitor}
          </button>
          <button
            type="button"
            onClick={onRecalc}
            data-testid="pro-workbar-recalc"
            className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            {w.recalc}
          </button>
        </div>
      </div>
    </section>
  );
}
