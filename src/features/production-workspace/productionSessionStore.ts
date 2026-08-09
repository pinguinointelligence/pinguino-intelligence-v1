import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  applyVerifiedRescueInput,
  completeProductionSession,
  confirmProductionLine,
  correctRecordedPhysicalGrams,
  createProductionSession,
  productionSourceFingerprint,
  reopenProductionRecord,
  setDraftActualGrams,
  type ProductionSession,
  type ProductionSource,
} from './productionSession';

export interface ProductionSessionStoreState {
  session: ProductionSession | null;
  ensureSession: (input: {
    ownerUserId: string | null;
    source: ProductionSource;
    plannedInput: RecipeInput;
    now: string;
    sessionId: string;
  }) => void;
  startNewSession: (input: {
    ownerUserId: string | null;
    source: ProductionSource;
    plannedInput: RecipeInput;
    now: string;
    sessionId: string;
  }) => void;
  setDraftActual: (lineId: string, grams: number) => void;
  confirmLine: (lineId: string, at: string) => void;
  reopenRecord: (lineId: string) => void;
  correctRecordedPhysical: (lineId: string, grams: number) => void;
  applyVerifiedRescue: (candidate: RecipeInput) => void;
  setNotes: (notes: { customerLabelNote?: string; internalProductionNote?: string }) => void;
  complete: (completedAt: string, operatorUserId: string | null) => void;
  clear: () => void;
}

const buildSession = (input: {
  ownerUserId: string | null;
  source: ProductionSource;
  plannedInput: RecipeInput;
  now: string;
  sessionId: string;
}) =>
  createProductionSession({
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    source: input.source,
    plannedInput: input.plannedInput,
    startedAt: input.now,
  });

function requireSession(session: ProductionSession | null): ProductionSession {
  if (!session) throw new Error('Production session has not been started.');
  return session;
}

export const useProductionSessionStore = create<ProductionSessionStoreState>()(
  persist(
    (set) => ({
      session: null,
      ensureSession: (input) =>
        set((state) => {
          if (
            state.session?.status === 'in_progress' &&
            state.session.ownerUserId === input.ownerUserId
          ) {
            return state;
          }
          const fingerprint = productionSourceFingerprint(input.plannedInput);
          if (
            state.session?.status === 'completed' &&
            state.session.sourceFingerprint === fingerprint &&
            state.session.ownerUserId === input.ownerUserId
          ) {
            return state;
          }
          return { session: buildSession(input) };
        }),
      startNewSession: (input) => set({ session: buildSession(input) }),
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
      applyVerifiedRescue: (candidate) =>
        set((state) => ({
          session: applyVerifiedRescueInput(requireSession(state.session), candidate),
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
      clear: () => set({ session: null }),
    }),
    {
      name: 'pinguino-production-session',
      version: 1,
      partialize: (state) => ({ session: state.session }),
    },
  ),
);
