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
  session: ProductionSession | null;
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
  /** Commit a server-confirmed candidate for the same durable run. */
  replaceSession: (session: ProductionSession) => void;
  /** Reconcile a server-authoritative run after reload or a lost HTTP response. */
  restoreDurableSession: (session: ProductionSession) => void;
  clear: () => void;
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

export function migrateProductionSessionStore(
  persisted: unknown,
  version: number,
): ProductionSessionStoreState {
  if (version >= 5) return persisted as ProductionSessionStoreState;
  const state = persisted as {
    session?: ProductionSession | null;
    archivedSessions?: ProductionSession[];
  };
  const normalize = (value: ProductionSession): ProductionSession => {
    const legacy = value as ProductionSession & {
      addonLines?: ProductionSession['addonLines'];
      plannedComposition?: RecipeCompositionMetadata;
      stage?: ProductionSession['stage'];
      durableRescueAcceptedAt?: string | null;
      durableRescueRevision?: number;
      durableActualRevision?: number;
    };
    const plannedComposition =
      legacy.plannedComposition ??
      recipeCompositionFromState({
        items: legacy.plannedInput.items,
        baseOrder: legacy.plannedInput.items.map((item) => item.id),
      });
    return {
      ...legacy,
      schemaVersion: 2,
      plannedComposition,
      addonLines: legacy.addonLines ?? [],
      stage: legacy.stage ?? 'base',
      durableRescueAcceptedAt: legacy.durableRescueAcceptedAt ?? null,
      durableRescueRevision: legacy.durableRescueRevision ?? 0,
      durableActualRevision: legacy.durableActualRevision ?? 0,
    };
  };
  return {
    ...state,
    archivedSessions: (state.archivedSessions ?? []).map(normalize),
    session: state.session ? normalize(state.session) : null,
  } as ProductionSessionStoreState;
}

export const useProductionSessionStore = create<ProductionSessionStoreState>()(
  persist(
    (set) => ({
      session: null,
      archivedSessions: [],
      startNewSession: (input) =>
        set((state) => ({
          archivedSessions: state.session
            ? [...state.archivedSessions, state.session]
            : state.archivedSessions,
          session: buildSession(input),
        })),
      setDraftActual: (lineId, grams) =>
        set((state) => ({
          session: setDraftActualGrams(requireSession(state.session), lineId, grams),
        })),
      confirmLine: (lineId, at) =>
        set((state) => ({
          session: confirmProductionLine(requireSession(state.session), lineId, at),
        })),
      reopenRecord: (lineId) =>
        set((state) => ({
          session: reopenProductionRecord(requireSession(state.session), lineId),
        })),
      correctRecordedPhysical: (lineId, grams) =>
        set((state) => ({
          session: correctRecordedPhysicalGrams(requireSession(state.session), lineId, grams),
        })),
      setNotes: (notes) =>
        set((state) => {
          const session = requireSession(state.session);
          return {
            session: {
              ...session,
              customerLabelNote: notes.customerLabelNote ?? session.customerLabelNote,
              internalProductionNote:
                notes.internalProductionNote ?? session.internalProductionNote,
            },
          };
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
          return {
            session: completeProductionSession(
              session,
              calculateRecipe(finalInput),
              completedAt,
              operatorUserId,
            ),
          };
        }),
      archiveCurrentSession: () =>
        set((state) => ({
          archivedSessions: state.session
            ? [...state.archivedSessions, state.session]
            : state.archivedSessions,
          session: null,
        })),
      replaceSession: (candidate) =>
        set((state) => {
          const current = requireSession(state.session);
          if (current.sessionId !== candidate.sessionId) {
            throw new Error('Cannot replace a different Production run.');
          }
          return { session: candidate };
        }),
      restoreDurableSession: (candidate) =>
        set((state) => ({
          archivedSessions:
            state.session && state.session.sessionId !== candidate.sessionId
              ? [...state.archivedSessions, state.session]
              : state.archivedSessions,
          session: candidate,
        })),
      clear: () => set({ session: null, archivedSessions: [] }),
    }),
    {
      name: 'pinguino-production-session',
      version: 5,
      migrate: migrateProductionSessionStore,
      partialize: (state) => ({
        session: state.session,
        archivedSessions: state.archivedSessions,
      }),
    },
  ),
);
