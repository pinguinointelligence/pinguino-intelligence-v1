/**
 * Intake store — the AI-first conversation state + saved preferences (Step 6A.1).
 *
 * Holds the deterministic conversation state (see features/pi-chat/conversation)
 * and persists the user's product / serving / batch / flavor choices as
 * preferences. No engine math, no IO beyond localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  advance,
  INITIAL_INTAKE,
  type IntakeEvent,
  type IntakeState,
} from '@/features/pi-chat/conversation';

interface IntakeStore extends IntakeState {
  dispatch: (event: IntakeEvent) => void;
  reset: () => void;
}

export const useIntakeStore = create<IntakeStore>()(
  persist(
    (set) => ({
      ...INITIAL_INTAKE,
      dispatch: (event) =>
        set((state) =>
          advance(
            {
              step: state.step,
              flavorIdea: state.flavorIdea,
              productProfileId: state.productProfileId,
              servingProfileId: state.servingProfileId,
              batchGrams: state.batchGrams,
            },
            event,
          ),
        ),
      reset: () => set({ ...INITIAL_INTAKE }),
    }),
    { name: 'pinguino-intake' },
  ),
);
