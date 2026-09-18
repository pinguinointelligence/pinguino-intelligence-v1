import { create } from 'zustand';
import { useRecipeStore } from '@/stores/recipeStore';
import { isUntouchedNewRecipeStarter } from '@/pages/destinations/startNewProRecipe';
import { useRecipeProfileStore } from './recipeProfileStore';

/**
 * DESIGN V3.0 §3 (owner-LOCKED Points 1–4) — WHERE the full-screen setup of a
 * new recipe stands. This is presentation state only: which step is on screen
 * and whether a draft's setup has ended in this session. Every setting the
 * setup shows lives in the one recipe/profile store and is written through the
 * panel's own handlers (`useProSettingsAuthority`); nothing here is a setting,
 * nothing is persisted, and nothing here decides what „valid defaults" means.
 */
export type ProSetupStep = 1 | 2 | 3;
/** How a draft's setup ended: through its three steps, or by the saved defaults. */
export type ProSetupOutcome = 'setup' | 'defaults';

export interface ProSetupSession {
  readonly draftIdentity: string;
  readonly step: ProSetupStep;
}

interface ProSetupFlowState {
  session: ProSetupSession | null;
  settled: Readonly<Record<string, ProSetupOutcome>>;
  goTo: (draftIdentity: string, step: ProSetupStep) => void;
  finish: (draftIdentity: string, outcome: ProSetupOutcome) => void;
  /** „Zmień" under the defaults notice: the setup opens again at Step 2 (Point 3). */
  reopen: (draftIdentity: string) => void;
  resetForTests: () => void;
}

export const useProSetupFlowStore = create<ProSetupFlowState>((set) => ({
  session: null,
  settled: {},
  goTo: (draftIdentity, step) => set({ session: { draftIdentity, step } }),
  finish: (draftIdentity, outcome) =>
    set((state) => ({
      session: null,
      settled: { ...state.settled, [draftIdentity]: outcome },
    })),
  reopen: (draftIdentity) =>
    set((state) => {
      const settled = { ...state.settled };
      delete settled[draftIdentity];
      return { session: { draftIdentity, step: 2 }, settled };
    }),
  resetForTests: () => set({ session: null, settled: {} }),
}));

export interface ProSetupGateFacts {
  /** The phone / iPad-portrait composition hosts the recipe (never the desktop). */
  readonly phone: boolean;
  /** The full workbench is available (not the locked preview). */
  readonly available: boolean;
  readonly activeTab: string;
  readonly draftIdentity: string | null;
  /** The panel's published confirmation fact (null while no Settings is mounted). */
  readonly settingsConfirmed: boolean | null;
  /** The draft is the new-recipe starter, exactly as it was created. */
  readonly untouchedStarter: boolean;
  readonly session: ProSetupSession | null;
  readonly settled: Readonly<Record<string, ProSetupOutcome>>;
}

/**
 * The step the setup shows, or null when the recipe itself is on screen.
 *
 * - Only on the phone / iPad-portrait composition, in Receptura, with the full
 *   workbench — the desktop keeps its permanent settings column.
 * - A setup already in progress for THIS draft keeps its step.
 * - Otherwise only a NEW, UNSAVED draft asks, once per session:
 *   - one whose settings are not confirmed (as the B3 first run did), and
 *   - an untouched new-recipe starter even when saved defaults confirmed it,
 *     because Step 1 is ALWAYS asked (Point 3 default-skip).
 * - A saved recipe never asks.
 */
export function proSetupFlowStep(facts: ProSetupGateFacts): ProSetupStep | null {
  if (!facts.phone || !facts.available || facts.activeTab !== 'profile') return null;
  const identity = facts.draftIdentity;
  if (identity === null) return null;
  if (facts.session?.draftIdentity === identity) return facts.session.step;
  if (!identity.startsWith('["unsaved-draft"')) return null;
  if (facts.settled[identity] !== undefined) return null;
  if (facts.settingsConfirmed === false || facts.untouchedStarter) return 1;
  return null;
}

/**
 * The live facts for `proSetupFlowStep`, plus whether the defaults notice
 * („Używamy Twoich domyślnych ustawień · Zmień ✓") belongs under the recipe.
 */
export function useProSetupFlowGate({
  mobileViewport: phone,
  available,
  activeTab,
}: {
  /** The phone / iPad-portrait composition hosts the recipe. */
  mobileViewport: boolean;
  available: boolean;
  activeTab: string;
}): { step: ProSetupStep | null; defaultsNotice: boolean; draftIdentity: string | null } {
  const draftIdentity = useRecipeProfileStore((state) => state.activeDraftIdentity);
  const settingsConfirmed = useRecipeProfileStore((state) => state.settingsConfirmed);
  // Subscriptions that re-evaluate the starter check below whenever it can change.
  useRecipeProfileStore((state) => state.awaitingRecalculation);
  useRecipeStore((state) => state.draftRevision);
  const hasStarter = useRecipeStore((state) => state.newRecipeStarterKey !== null);
  const session = useProSetupFlowStore((state) => state.session);
  const settled = useProSetupFlowStore((state) => state.settled);
  const untouchedStarter = hasStarter && isUntouchedNewRecipeStarter();
  const step = proSetupFlowStep({
    phone,
    available,
    activeTab,
    draftIdentity,
    settingsConfirmed,
    untouchedStarter,
    session,
    settled,
  });
  const defaultsNotice =
    step === null &&
    phone &&
    available &&
    activeTab === 'profile' &&
    draftIdentity !== null &&
    settled[draftIdentity] === 'defaults' &&
    settingsConfirmed === true;
  return { step, defaultsNotice, draftIdentity };
}
