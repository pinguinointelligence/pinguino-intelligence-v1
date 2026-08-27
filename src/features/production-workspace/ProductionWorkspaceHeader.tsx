import { SectionLabel } from '@/components/shared/SectionLabel';
import { FriendlyLabMessageMotion } from '@/components/shared/FriendlyLabMessageMotion';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

/**
 * The single visible Production-state authority shared by both work areas.
 * It reads the existing session view only; it does not derive or mutate any
 * Production, Rescue, Engine or persistence state.
 */
export function ProductionWorkspaceHeader({ production }: { production: ProductionWorkspaceView }) {
  const { session, progress } = production;
  if (!session || !progress) return null;

  const completed = session.status === 'completed';

  return (
    <header
      className="flex shrink-0 items-baseline gap-2 border-y border-ink/10 bg-white px-[var(--pro-mobile-gutter)] py-2 text-ink xl:mb-0 xl:rounded-[12px] xl:border xl:px-4"
      data-testid="production-workspace-header"
      data-production-state={completed ? 'completed' : 'active'}
    >
      <SectionLabel>Produkcja</SectionLabel>
      {completed ? (
        <FriendlyLabMessageMotion
          timing="important"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2f6f3c]"
          testId="production-workspace-complete"
        >
          <span
            aria-hidden
            className="grid size-4 shrink-0 place-items-center rounded-full border border-[#2f6f3c]/25 bg-[#2f6f3c]/[0.06]"
          >
            <svg viewBox="0 0 16 16" className="size-2.5" fill="none">
              <path
                d="m3.5 8.2 2.8 2.8 6.2-6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>Gellattissimo! Partia gotowa.</span>
        </FriendlyLabMessageMotion>
      ) : (
        <p className="text-xs text-stone-600">Ważenie składników</p>
      )}
    </header>
  );
}
