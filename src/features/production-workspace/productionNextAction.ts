import type { ProductionSession } from './productionSession';

/** Presentation-only pointer to the next physical ingredient task. */
export function nextProductionLineId(
  session: Pick<ProductionSession, 'status' | 'lines'> | null,
  deviationDecisionUnresolved: boolean,
): string | null {
  if (!session || session.status !== 'in_progress' || deviationDecisionUnresolved) return null;
  return session.lines.find((line) => !line.confirmed)?.lineId ?? null;
}
