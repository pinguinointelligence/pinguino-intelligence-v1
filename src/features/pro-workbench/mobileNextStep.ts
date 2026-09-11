/**
 * PRO MOBILE UX v2 · B6 — the ONE next step the phone's bottom strip offers.
 *
 * Every input is an existing published fact; nothing here recomputes one:
 * - `settingsConfirmed` is what Settings publishes about itself
 *   (`useRecipeProfileStore.settingsConfirmed`);
 * - `saveRequired` is the workbar's exact canonical-save readiness
 *   (`ProWorkbar` → `onSaveAttentionChange`), so „Zapisz recepturę" appears
 *   precisely when ZAPISZ would succeed;
 * - `savedAndClean` is the recipe store's own saved/dirty state.
 *
 * „Przelicz" is not decided here: the strip keeps its own recalculation
 * authority, and a recipe that needs recalculating shows „Przelicz" before any
 * of these. Only unconfirmed settings outrank it, because Przelicz would refuse
 * until they are confirmed (PRO keeps its manual recalculation).
 */
export type MobileNextStep = 'settings' | 'save' | 'monitor' | 'production';

export interface MobileNextStepInput {
  settingsConfirmed: boolean | null;
  saveRequired: boolean;
  savedAndClean: boolean;
  activeTab: string;
}

export function mobileNextStep(input: MobileNextStepInput): MobileNextStep | null {
  if (input.settingsConfirmed === false) return 'settings';
  if (input.saveRequired) return 'save';
  if (!input.savedAndClean) return null;
  if (input.activeTab === 'profile') return 'monitor';
  if (input.activeTab === 'monitor') return 'production';
  // Produkcja owns its own start control and Etykieta ends the flow: a second
  // CTA there would only duplicate an action already on screen.
  return null;
}
