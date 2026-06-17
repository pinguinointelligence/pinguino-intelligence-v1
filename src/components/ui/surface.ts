import { createContext, useContext } from 'react';

/**
 * Surface tone (Phase 6C Slice 2) — lets shared primitives (Card, MetricValue,
 * StatusChip, IndicatorBar, SectionLabel, EmptyState, ConfidenceBadge) adapt to a
 * dark workspace WITHOUT duplicating components or threading props everywhere.
 *
 * Default is 'paper' (the white-workspace behavior), so every existing white page
 * (e.g. /recipes) renders exactly as before. Advanced Studio wraps its tree in
 * <SurfaceToneContext.Provider value="shell"> to switch the same primitives dark.
 */
export type SurfaceTone = 'paper' | 'shell';

export const SurfaceToneContext = createContext<SurfaceTone>('paper');

export function useSurfaceTone(): SurfaceTone {
  return useContext(SurfaceToneContext);
}
