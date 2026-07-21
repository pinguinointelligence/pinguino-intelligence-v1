/**
 * PINGÜINO Pro — Monitor PI drawer (right side on desktop, bottom sheet on mobile). Opened from the
 * sticky workbar; reuses the existing UserMonitorPro on the LIVE engine result (recomputed on every
 * change) — no new Monitor math. Dark panel per the design lock (Monitor Pro may be a dark surface).
 * Accessible: backdrop, body-scroll lock, Escape to close, safe-area padding.
 */
import { useEffect } from 'react';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { UserMonitorPro } from '@/features/user-monitor';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { useRecipeStore } from '@/stores/recipeStore';

export function MonitorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { result } = useStudioResult();
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="pro-monitor-drawer">
      <button
        type="button"
        aria-label={copy.shell.closeMenu}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/60 motion-safe:animate-[appFadeIn_150ms_ease-out]"
      />
      <SurfaceToneContext.Provider value="shell">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={copy.proWorkbar.monitor}
          className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-ivory/10 bg-shell p-5 text-ivory [color-scheme:dark] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:max-w-[92vw] sm:rounded-none sm:border-l sm:border-t-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-label text-ivory uppercase">{copy.proWorkbar.monitor}</h2>
            <button
              type="button"
              aria-label={copy.shell.closeMenu}
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-md text-ivory transition-colors hover:bg-ivory/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ivory/40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <UserMonitorPro result={result} servingTemperatureC={temperatureC} />
        </div>
      </SurfaceToneContext.Provider>
    </div>
  );
}
