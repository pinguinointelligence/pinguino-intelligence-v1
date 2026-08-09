import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import {
  buildMasterLabelData,
  type BuildMasterLabelInput,
  type MasterLabelData,
} from './masterLabel';

interface MasterLabelStoreState {
  label: MasterLabelData | null;
  initializeFromSnapshot: (input: BuildMasterLabelInput) => void;
  replace: (label: MasterLabelData) => void;
  patch: (patch: Partial<MasterLabelData>) => void;
  clear: () => void;
}

export const useMasterLabelStore = create<MasterLabelStoreState>()(
  persist(
    (set) => ({
      label: null,
      initializeFromSnapshot: (input) =>
        set((state) => {
          if (state.label?.sourceCompletionSessionId === input.snapshot.sessionId) return state;
          return { label: buildMasterLabelData(input) };
        }),
      replace: (label) => set({ label }),
      patch: (patch) =>
        set((state) => ({ label: state.label ? { ...state.label, ...patch } : null })),
      clear: () => set({ label: null }),
    }),
    { name: 'pinguino-master-label', version: 1, partialize: (state) => ({ label: state.label }) },
  ),
);

export function masterLabelIdForSnapshot(snapshot: ProductionCompletionSnapshot): string {
  return `master-label:${snapshot.sessionId}`;
}
