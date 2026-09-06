import {
  productionSourceFingerprint,
  type ProductionCompletionSnapshot,
  type ProductionSession,
  type ProductionSource,
} from '@/features/production-workspace/productionSession';

export interface CurrentRecipeLabelProduction {
  source: ProductionSource;
  currentSourceFingerprint: string;
  session: Pick<
    ProductionSession,
    'status' | 'source' | 'sourceFingerprint' | 'completionSnapshot'
  > | null;
}

const sameRecipeVersion = (left: ProductionSource, right: ProductionSource): boolean =>
  left.recipeId === right.recipeId &&
  left.recipeVersionId === right.recipeVersionId &&
  left.recipeVersionNumber === right.recipeVersionNumber;

/**
 * Returns a completed label snapshot only while it still belongs to the recipe
 * and exact recipe content currently open in PRO.
 *
 * Production recovery deliberately keeps stale completed runs as immutable
 * history. That history must never become the current recipe's label merely
 * because it is still the active browser session.
 */
export function currentRecipeCompletionSnapshot(
  production: CurrentRecipeLabelProduction | undefined,
): ProductionCompletionSnapshot | null {
  const session = production?.session;
  const snapshot = session?.completionSnapshot;
  if (!production || !session || session.status !== 'completed' || !snapshot) return null;
  if (!sameRecipeVersion(session.source, production.source)) return null;
  if (!sameRecipeVersion(snapshot.source, production.source)) return null;
  if (session.sourceFingerprint !== production.currentSourceFingerprint) return null;
  if (
    productionSourceFingerprint(snapshot.plannedInput, snapshot.productComposition) !==
    production.currentSourceFingerprint
  ) {
    return null;
  }
  return snapshot;
}
