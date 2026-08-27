import { SectionLabel } from '@/components/shared/SectionLabel';
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
      <p
        className={completed ? 'text-xs font-semibold text-[#2f6f3c]' : 'text-xs text-stone-600'}
        data-testid={completed ? 'production-workspace-complete' : undefined}
      >
        {completed ? 'Perfetto. Partia gotowa.' : 'Ważenie składników'}
      </p>
    </header>
  );
}
