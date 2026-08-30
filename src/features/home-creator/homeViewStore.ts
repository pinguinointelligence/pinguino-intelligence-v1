/**
 * GELLATTI HOME — which presentation is on screen, and which PRO module to return to.
 *
 * §14 — THE ONE THING THIS STORE MUST NOT DO: it holds NO recipe state and imports NO
 * recipe store. Switching HOME ↔ PRO cannot clone the recipe, create a version, reset
 * it, reload another, recalculate, or reset machine/batch/Direction/hidden PRO
 * settings/Production progress — because there is nothing here that could. The single
 * live recipe stays in `recipeStore`, untouched by a view change.
 *
 * The remembered PRO module (§15) lives here rather than in the recipe for the same
 * reason: "I was last looking at Monitor" is a fact about the person's session, not
 * about the formulation, and must not travel with a saved recipe.
 *
 * The view is persisted per device so a refresh does not silently move someone
 * between presentations mid-task. It is NOT the login default — §12 keeps that a
 * stated account setting, resolved separately by `resolveDefaultLandingView`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DefaultExperience, HomeViewMode, ProModule } from './homeViewMode';

interface HomeViewState {
  /** The presentation currently on screen. */
  view: HomeViewMode;
  /** §15: the PRO module to restore when the user returns to PRO. */
  lastProModule: ProModule;
  /** §12: the account setting, hydrated after sign-in (`null` = not yet known). */
  defaultExperience: DefaultExperience | null;
  /** True once the landing view has been resolved for this session. */
  landingResolved: boolean;

  setView: (view: HomeViewMode) => void;
  rememberProModule: (module: ProModule) => void;
  setDefaultExperience: (value: DefaultExperience | null) => void;
  markLandingResolved: () => void;
  resetForTests: () => void;
}

export const HOME_VIEW_STORAGE_KEY = 'gellatti.home.view.v1';

export const useHomeViewStore = create<HomeViewState>()(
  persist(
    (set) => ({
      view: 'home',
      lastProModule: 'recipe',
      defaultExperience: null,
      landingResolved: false,

      setView: (view) => set({ view }),
      rememberProModule: (lastProModule) => set({ lastProModule }),
      setDefaultExperience: (defaultExperience) => set({ defaultExperience }),
      markLandingResolved: () => set({ landingResolved: true }),
      resetForTests: () =>
        set({
          view: 'home',
          lastProModule: 'recipe',
          defaultExperience: null,
          landingResolved: false,
        }),
    }),
    {
      name: HOME_VIEW_STORAGE_KEY,
      // `landingResolved` is per-session, never persisted: a returning visitor must
      // have the account setting applied again on their next login.
      partialize: (state) => ({
        view: state.view,
        lastProModule: state.lastProModule,
      }),
    },
  ),
);
