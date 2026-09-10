import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  completeProductionSession,
  confirmProductionLine,
  correctRecordedPhysicalGrams,
  createProductionSession,
  reopenProductionRecord,
  setDraftActualGrams,
  type ProductionSession,
  type ProductionSource,
} from './productionSession';
import {
  recipeCompositionFromState,
  type RecipeCompositionMetadata,
} from '@/features/recipe-composition/recipeCompositionPersistence';

export interface ProductionSessionStoreState {
  /** Active browser projection only. Durable identity lives in `sessionsById`. */
  session: ProductionSession | null;
  /** Every locally known run is addressed by its immutable production_run UUID. */
  sessionsById: Record<string, ProductionSession>;
  /** Explicit run selection for one owner + exact saved recipe version. */
  selectedSessionIdByAddress: Record<string, string>;
  /** Current tab projection. Deliberately not persisted across reloads. */
  activeAddressKey: string | null;
  /** Recoverable local history until the durable ProductionRepository/RPC becomes authoritative. */
  archivedSessions: ProductionSession[];
  startNewSession: (input: {
    ownerUserId: string | null;
    source: ProductionSource;
    plannedInput: RecipeInput;
    plannedComposition?: RecipeCompositionMetadata;
    now: string;
    sessionId: string;
  }) => void;
  setDraftActual: (lineId: string, grams: number) => void;
  confirmLine: (lineId: string, at: string) => void;
  reopenRecord: (lineId: string) => void;
  correctRecordedPhysical: (lineId: string, grams: number) => void;
  setNotes: (notes: { customerLabelNote?: string; internalProductionNote?: string }) => void;
  complete: (completedAt: string, operatorUserId: string | null) => void;
  archiveCurrentSession: () => void;
  /** Select only a run bound to the exact recipe/version currently open in this tab. */
  activateSessionForAddress: (address: ProductionSessionAddress) => void;
  /** Commit a server-confirmed candidate for the same durable run. */
  replaceSession: (session: ProductionSession) => void;
  /** Reconcile a server-authoritative run after reload or a lost HTTP response. */
  restoreDurableSession: (session: ProductionSession, address?: ProductionSessionAddress) => void;
  clear: () => void;
}

export interface ProductionSessionAddress {
  ownerUserId: string | null;
  recipeId: string | null;
  recipeVersionId: string | null;
}

export const productionSessionAddressKey = (address: ProductionSessionAddress): string =>
  JSON.stringify([address.ownerUserId, address.recipeId, address.recipeVersionId]);

const productionSessionAddress = (session: ProductionSession): ProductionSessionAddress => ({
  ownerUserId: session.ownerUserId,
  recipeId: session.source.recipeId,
  recipeVersionId: session.source.recipeVersionId,
});

export const productionSessionMatchesAddress = (
  session: ProductionSession,
  address: ProductionSessionAddress,
): boolean =>
  session.ownerUserId === address.ownerUserId &&
  session.source.recipeId === address.recipeId &&
  session.source.recipeVersionId === address.recipeVersionId;

export function productionSessionForAddress(
  state: Pick<
    ProductionSessionStoreState,
    'session' | 'sessionsById' | 'selectedSessionIdByAddress' | 'activeAddressKey'
  >,
  address: ProductionSessionAddress,
): ProductionSession | null {
  const addressKey = productionSessionAddressKey(address);
  if (
    state.session &&
    productionSessionMatchesAddress(state.session, address) &&
    (state.activeAddressKey === null || state.activeAddressKey === addressKey)
  ) {
    return state.session;
  }
  const selectedId = state.selectedSessionIdByAddress[addressKey];
  const selected = selectedId ? state.sessionsById[selectedId] : null;
  if (selected && productionSessionMatchesAddress(selected, address)) return selected;

  // A singleton for another recipe is not a candidate and therefore cannot
  // create `stale_source` for this address.
  return null;
}

const buildSession = (input: {
  ownerUserId: string | null;
  source: ProductionSource;
  plannedInput: RecipeInput;
  plannedComposition?: RecipeCompositionMetadata;
  now: string;
  sessionId: string;
}) =>
  createProductionSession({
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    source: input.source,
    plannedInput: input.plannedInput,
    plannedComposition: input.plannedComposition,
    startedAt: input.now,
  });

function requireSession(session: ProductionSession | null): ProductionSession {
  if (!session) throw new Error('Production session has not been started.');
  return session;
}

const indexSession = (
  state: Pick<ProductionSessionStoreState, 'sessionsById' | 'selectedSessionIdByAddress'>,
  session: ProductionSession,
) => {
  const addressKey = productionSessionAddressKey(productionSessionAddress(session));
  return {
    sessionsById: { ...state.sessionsById, [session.sessionId]: session },
    selectedSessionIdByAddress: {
      ...state.selectedSessionIdByAddress,
      [addressKey]: session.sessionId,
    },
    addressKey,
  };
};

const commitActiveSession = (
  state: ProductionSessionStoreState,
  session: ProductionSession,
): Partial<ProductionSessionStoreState> => {
  const indexed = indexSession(state, session);
  return {
    session,
    sessionsById: indexed.sessionsById,
    selectedSessionIdByAddress: indexed.selectedSessionIdByAddress,
    activeAddressKey: indexed.addressKey,
  };
};

export function migrateProductionSessionStore(
  persisted: unknown,
  version: number,
): ProductionSessionStoreState {
  if (version >= 10) return persisted as ProductionSessionStoreState;
  const state = persisted as {
    session?: ProductionSession | null;
    archivedSessions?: ProductionSession[];
    sessionsById?: Record<string, ProductionSession>;
    selectedSessionIdByAddress?: Record<string, string>;
  };
  const normalize = (value: ProductionSession): ProductionSession => {
    const legacy = value as ProductionSession & {
      addonLines?: ProductionSession['addonLines'];
      plannedComposition?: RecipeCompositionMetadata;
      stage?: ProductionSession['stage'];
      durableRescueAcceptedAt?: string | null;
      durableRescueRevision?: number;
      durableActualRevision?: number;
      degassingRequired?: boolean;
      degassingAcknowledged?: boolean;
      degassingAcknowledgedAt?: string | null;
      carbonatedProductIds?: string[];
      supersededRescue?: ProductionSession['supersededRescue'];
      lastDeviationDecision?: ProductionSession['lastDeviationDecision'];
      invalidDurableRescue?: ProductionSession['invalidDurableRescue'];
      topUpTasks?: ProductionSession['topUpTasks'];
    };
    const plannedComposition =
      legacy.plannedComposition ??
      recipeCompositionFromState({
        items: legacy.plannedInput.items,
        baseOrder: legacy.plannedInput.items.map((item) => item.id),
      });
    const legacyTopUpLines = legacy.lines.filter(
      (line) =>
        !line.confirmed &&
        line.confirmedAt !== null &&
        line.physicalAddedGrams > 0.000_001 &&
        line.targetGrams > line.physicalAddedGrams + 0.000_001,
    );
    return {
      ...legacy,
      schemaVersion: 2,
      plannedComposition,
      stage: legacy.stage ?? 'base',
      durableRescueAcceptedAt: legacy.durableRescueAcceptedAt ?? null,
      durableRescueRevision: legacy.durableRescueRevision ?? 0,
      durableActualRevision: legacy.durableActualRevision ?? 0,
      degassingRequired: legacy.degassingRequired ?? false,
      degassingAcknowledged: legacy.degassingAcknowledged ?? false,
      degassingAcknowledgedAt: legacy.degassingAcknowledgedAt ?? null,
      carbonatedProductIds: legacy.carbonatedProductIds ?? [],
      supersededRescue: legacy.supersededRescue ?? null,
      lastDeviationDecision: legacy.lastDeviationDecision ?? null,
      invalidDurableRescue: legacy.invalidDurableRescue ?? null,
      topUpTasks:
        legacy.topUpTasks ??
        legacyTopUpLines.map((line) => ({
          taskId: `production-top-up:${legacy.durableRescueRevision ?? 0}:${encodeURIComponent(line.lineId)}`,
          sourceIngredientId: line.canonicalIngredientId,
          sourceRecipeLineId: line.lineId,
          ingredientName: line.name,
          physicalBaselineG: line.physicalAddedGrams,
          authorizedDeltaG: line.targetGrams - line.physicalAddedGrams,
          draftDeltaG: Math.max(0, line.draftActualGrams - line.physicalAddedGrams),
          cumulativeTargetG: line.targetGrams,
          revisionId: legacy.durableRescueRevision ?? 0,
          sourceActualRevision: legacy.lastDeviationDecision?.sourceActualRevision ?? 0,
          status: 'pending' as const,
          completedAt: null,
        })),
      lines: legacy.lines.map((line) => ({
        ...line,
        draftActualEdited: line.draftActualEdited ?? false,
        confirmed: legacyTopUpLines.some((candidate) => candidate.lineId === line.lineId)
          ? true
          : line.confirmed,
        draftActualGrams: legacyTopUpLines.some((candidate) => candidate.lineId === line.lineId)
          ? line.physicalAddedGrams
          : line.draftActualGrams,
      })),
      addonLines: (legacy.addonLines ?? []).map((line) => ({
        ...line,
        draftActualEdited: line.draftActualEdited ?? false,
      })),
    };
  };
  const normalizedArchived = (state.archivedSessions ?? []).map((session) =>
    version >= 9 ? session : normalize(session),
  );
  const normalizedCurrent = state.session
    ? version >= 9
      ? state.session
      : normalize(state.session)
    : null;
  const sessionsById = Object.fromEntries(
    [...normalizedArchived, ...(normalizedCurrent ? [normalizedCurrent] : [])].map((session) => [
      session.sessionId,
      session,
    ]),
  );
  const selectedSessionIdByAddress: Record<string, string> = {};
  for (const session of normalizedArchived) {
    selectedSessionIdByAddress[productionSessionAddressKey(productionSessionAddress(session))] =
      session.sessionId;
  }
  if (normalizedCurrent) {
    selectedSessionIdByAddress[
      productionSessionAddressKey(productionSessionAddress(normalizedCurrent))
    ] = normalizedCurrent.sessionId;
  }
  return {
    ...state,
    archivedSessions: normalizedArchived,
    sessionsById,
    selectedSessionIdByAddress,
    // The legacy singleton is indexed but never restored as cross-recipe
    // authority. The open recipe selects its exact address after hydration.
    session: null,
    activeAddressKey: null,
  } as ProductionSessionStoreState;
}

export const useProductionSessionStore = create<ProductionSessionStoreState>()(
  persist(
    (set) => ({
      session: null,
      sessionsById: {},
      selectedSessionIdByAddress: {},
      activeAddressKey: null,
      archivedSessions: [],
      startNewSession: (input) => set((state) => commitActiveSession(state, buildSession(input))),
      setDraftActual: (lineId, grams) =>
        set((state) =>
          commitActiveSession(
            state,
            setDraftActualGrams(requireSession(state.session), lineId, grams),
          ),
        ),
      confirmLine: (lineId, at) =>
        set((state) =>
          commitActiveSession(
            state,
            confirmProductionLine(requireSession(state.session), lineId, at),
          ),
        ),
      reopenRecord: (lineId) =>
        set((state) =>
          commitActiveSession(state, reopenProductionRecord(requireSession(state.session), lineId)),
        ),
      correctRecordedPhysical: (lineId, grams) =>
        set((state) =>
          commitActiveSession(
            state,
            correctRecordedPhysicalGrams(requireSession(state.session), lineId, grams),
          ),
        ),
      setNotes: (notes) =>
        set((state) => {
          const session = requireSession(state.session);
          return commitActiveSession(state, {
            ...session,
            customerLabelNote: notes.customerLabelNote ?? session.customerLabelNote,
            internalProductionNote: notes.internalProductionNote ?? session.internalProductionNote,
          });
        }),
      complete: (completedAt, operatorUserId) =>
        set((state) => {
          const session = requireSession(state.session);
          const finalInput = {
            ...session.plannedInput,
            target_batch_grams: session.lines.reduce(
              (sum, line) => sum + line.physicalAddedGrams,
              0,
            ),
            items: [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
              const line = session.lines.find((candidate) => candidate.lineId === item.id)!;
              return {
                ...item,
                actual_grams: line.physicalAddedGrams,
                lock_type: 'already_added' as const,
              };
            }),
          };
          return commitActiveSession(
            state,
            completeProductionSession(
              session,
              calculateRecipe(finalInput),
              completedAt,
              operatorUserId,
            ),
          );
        }),
      archiveCurrentSession: () =>
        set((state) => {
          if (!state.session) return state;
          const addressKey = productionSessionAddressKey(productionSessionAddress(state.session));
          const selectedSessionIdByAddress = { ...state.selectedSessionIdByAddress };
          if (selectedSessionIdByAddress[addressKey] === state.session.sessionId) {
            delete selectedSessionIdByAddress[addressKey];
          }
          return {
            archivedSessions: state.archivedSessions.some(
              (candidate) => candidate.sessionId === state.session!.sessionId,
            )
              ? state.archivedSessions
              : [...state.archivedSessions, state.session],
            selectedSessionIdByAddress,
            session: null,
          };
        }),
      activateSessionForAddress: (address) =>
        set((state) => {
          const addressKey = productionSessionAddressKey(address);
          const currentMatches =
            state.session && productionSessionMatchesAddress(state.session, address)
              ? state.session
              : null;
          const selectedId = state.selectedSessionIdByAddress[addressKey];
          const selected = selectedId ? state.sessionsById[selectedId] : null;
          const candidate =
            selected && productionSessionMatchesAddress(selected, address)
              ? selected
              : currentMatches;
          const next = candidate ? indexSession(state, candidate) : null;
          if (
            state.activeAddressKey === addressKey &&
            state.session?.sessionId === (candidate?.sessionId ?? null)
          ) {
            return state;
          }
          return {
            activeAddressKey: addressKey,
            session: candidate,
            ...(next
              ? {
                  sessionsById: next.sessionsById,
                  selectedSessionIdByAddress: next.selectedSessionIdByAddress,
                }
              : {}),
          };
        }),
      replaceSession: (candidate) =>
        set((state) => {
          const known =
            state.sessionsById[candidate.sessionId] ??
            (state.session?.sessionId === candidate.sessionId ? state.session : null);
          if (!known && !state.session) return state;
          if (!known && state.session && state.session.sessionId !== candidate.sessionId) {
            throw new Error('Cannot replace a different Production run.');
          }
          const addressKey = productionSessionAddressKey(productionSessionAddress(candidate));
          const sessionsById = { ...state.sessionsById, [candidate.sessionId]: candidate };
          const selectedSessionIdByAddress = {
            ...state.selectedSessionIdByAddress,
            ...(state.selectedSessionIdByAddress[addressKey] === candidate.sessionId ||
            state.session?.sessionId === candidate.sessionId
              ? { [addressKey]: candidate.sessionId }
              : {}),
          };
          const shouldProject =
            state.session?.sessionId === candidate.sessionId &&
            (state.activeAddressKey === null || state.activeAddressKey === addressKey);
          return {
            sessionsById,
            selectedSessionIdByAddress,
            ...(shouldProject ? { session: candidate } : {}),
          };
        }),
      restoreDurableSession: (candidate, requestedAddress) =>
        set((state) => {
          const resolvedAddress = requestedAddress ?? productionSessionAddress(candidate);
          if (!productionSessionMatchesAddress(candidate, resolvedAddress)) {
            throw new Error('Cannot bind a Production run to a different recipe version.');
          }
          const requestedAddressKey = productionSessionAddressKey(resolvedAddress);
          // Hook-originated recovery always supplies its address. If navigation
          // or an account switch has already changed/cleared the active tab,
          // discard the late response before it can repopulate private state.
          if (requestedAddress && state.activeAddressKey !== requestedAddressKey) return state;
          const indexed = indexSession(state, candidate);
          const shouldProject =
            state.activeAddressKey === null || state.activeAddressKey === indexed.addressKey;
          return {
            sessionsById: indexed.sessionsById,
            selectedSessionIdByAddress: indexed.selectedSessionIdByAddress,
            ...(shouldProject ? { session: candidate, activeAddressKey: indexed.addressKey } : {}),
          };
        }),
      clear: () =>
        set({
          session: null,
          sessionsById: {},
          selectedSessionIdByAddress: {},
          activeAddressKey: null,
          archivedSessions: [],
        }),
    }),
    {
      name: 'pinguino-production-session',
      version: 10,
      migrate: migrateProductionSessionStore,
      partialize: (state) => ({
        sessionsById: state.sessionsById,
        selectedSessionIdByAddress: state.selectedSessionIdByAddress,
        archivedSessions: state.archivedSessions,
      }),
    },
  ),
);
