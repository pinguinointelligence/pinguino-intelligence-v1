import { useEffect } from 'react';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  resolveRecipeProposalBehaviorSnapshots,
  validateRecipeBehaviorOnServer,
} from '@/services/productIntelligence';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { productBehaviorRequiredLineIds } from './productBehaviorAccess';
import { productBehaviorSnapshotFingerprint } from './productBehaviorResolver';
import { buildRecipeBehaviorAuthority, recipeBehaviorModuleGate } from './recipeBehaviorAuthority';

/**
 * Refreshes only the server-owned ProductBehavior authority required by the
 * modern Monitor. The existing skeleton remains mounted until both the exact
 * resolver and the terminal MONITOR validation accept the same current draft.
 * Any blocked, failed or late response is deliberately ignored fail-closed.
 */
export function useMonitorRecipeBehaviorRefresh(input: {
  enabled: boolean;
  blockedLineIds: readonly string[];
}): void {
  const userId = useAuthStore((state) =>
    state.status === 'authed' ? (state.user?.id ?? null) : null,
  );
  const draftContextSeq = useRecipeStore((state) => state.draftContextSeq);
  const draftRevision = useRecipeStore((state) => state.draftRevision);
  const snapshotFingerprint = useRecipeStore((state) =>
    productBehaviorSnapshotFingerprint(state.productBehaviorSnapshots),
  );
  const blockedKey = [...input.blockedLineIds].sort().join('\u0000');

  useEffect(() => {
    if (!input.enabled || !userId || blockedKey.length === 0) return;

    const initial = useRecipeStore.getState();
    const recipe = buildRecipeInput(initial);
    const toppings = initial.toppings.map((topping) => structuredClone(topping));
    const requiredLineIds = productBehaviorRequiredLineIds({
      items: recipe.items,
      toppings,
    });
    if (requiredLineIds.length === 0) return;

    const required = new Set(requiredLineIds);
    const blocked = blockedKey.split('\u0000').filter((lineId) => required.has(lineId));
    if (blocked.length === 0) return;

    const capturedContextSeq = initial.draftContextSeq;
    const capturedRevision = initial.draftRevision;
    const capturedSnapshotFingerprint = productBehaviorSnapshotFingerprint(
      initial.productBehaviorSnapshots,
    );
    const technicalOnlyMainLineIds = initial.ownerReviewGate?.technicalOnlyMainLineIds;
    const forcedSnapshots = Object.fromEntries(
      Object.entries(initial.productBehaviorSnapshots).map(([lineId, snapshot]) => [
        lineId,
        blocked.includes(lineId)
          ? { ...structuredClone(snapshot), resolutionState: 'REVALIDATION_REQUIRED' as const }
          : structuredClone(snapshot),
      ]),
    );
    let cancelled = false;

    const exactDraftStillCurrent = (): boolean => {
      if (cancelled) return false;
      const latest = useRecipeStore.getState();
      const latestUserId =
        useAuthStore.getState().status === 'authed'
          ? (useAuthStore.getState().user?.id ?? null)
          : null;
      return (
        latestUserId === userId &&
        latest.draftContextSeq === capturedContextSeq &&
        latest.draftRevision === capturedRevision &&
        productBehaviorSnapshotFingerprint(latest.productBehaviorSnapshots) ===
          capturedSnapshotFingerprint
      );
    };

    void (async () => {
      try {
        const resolved = await resolveRecipeProposalBehaviorSnapshots({
          recipe,
          toppings,
          snapshots: forcedSnapshots,
          accountId: userId,
          module: 'MONITOR',
          technicalOnlyMainLineIds,
        });
        if (!exactDraftStillCurrent() || resolved.unresolvedLineIds.length > 0) return;

        const validation = await validateRecipeBehaviorOnServer({
          recipe,
          toppings,
          snapshots: resolved.snapshots,
          module: 'MONITOR',
          accountId: userId,
          technicalOnlyMainLineIds,
        });
        if (!validation.ready || !exactDraftStillCurrent()) return;

        const refreshedAuthority = buildRecipeBehaviorAuthority({
          items: recipe.items,
          toppings,
          snapshots: resolved.snapshots,
        });
        if (!recipeBehaviorModuleGate(refreshedAuthority, 'MONITOR').ready) return;

        // syncProductBehaviorSnapshots is the existing non-material authority
        // write: it validates exact line/scope ownership and does not make the
        // unchanged recipe dirty or advance its draft revision.
        useRecipeStore.getState().syncProductBehaviorSnapshots(resolved.snapshots);
      } catch {
        // Network/resolver errors must preserve the locked Monitor skeleton.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    blockedKey,
    draftContextSeq,
    draftRevision,
    input.enabled,
    snapshotFingerprint,
    userId,
  ]);
}
