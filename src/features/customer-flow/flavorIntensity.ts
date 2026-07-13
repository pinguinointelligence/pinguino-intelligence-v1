/**
 * Customer flavor-INTENSITY contract (Agent B) — pure and deterministic.
 *
 * A customer can say HOW intense a flavor should be (Delikatny / Wyraźny / Mocny).
 * That choice is captured as a PREFERENCE ONLY — it is NEVER silently turned into
 * grams. Grams appear for a flavor at a chosen intensity ONLY when an owner-
 * approved, deterministic dose profile exists for that exact (tag, intensity);
 * absent such a profile the flavor line stays UNRESOLVED and no number is invented.
 *
 * The profile table is intentionally EMPTY here: with no verified rule yet, every
 * intensity resolves to "no dose", so the honest recipe status can never claim to
 * be fully calculated while a required flavor dose is still unresolved.
 *
 * No IO, no engine math, no grams fabricated — every function is pure.
 */

/** The three customer-facing intensities. Order is the display order. */
export type FlavorIntensity = 'delicate' | 'pronounced' | 'strong';

export const FLAVOR_INTENSITY_OPTIONS: readonly FlavorIntensity[] = [
  'delicate',
  'pronounced',
  'strong',
];

/** A customer's chosen intensity per flavor tag — a PREFERENCE, never grams. */
export type FlavorIntensityPreferences = Readonly<Record<string, FlavorIntensity>>;

/** Record a flavor's chosen intensity. Pure — returns NEW preferences. */
export function setFlavorIntensity(
  prefs: FlavorIntensityPreferences,
  tag: string,
  intensity: FlavorIntensity,
): FlavorIntensityPreferences {
  return { ...prefs, [tag]: intensity };
}

/** Read a flavor's chosen intensity, or null when the customer hasn't chosen one. */
export function getFlavorIntensity(
  prefs: FlavorIntensityPreferences,
  tag: string,
): FlavorIntensity | null {
  return prefs[tag] ?? null;
}

/* ------------------------------------------------------------------------ *
 * Verified deterministic dose profiles (the ONLY source of grams here)      *
 * ------------------------------------------------------------------------ */

export interface VerifiedDoseProfile {
  /** Owner-approved grams for this flavor at this intensity. */
  grams: number;
}

/** tag → intensity → verified dose. */
export type VerifiedFlavorDoseProfiles = Readonly<
  Record<string, Partial<Record<FlavorIntensity, VerifiedDoseProfile>>>
>;

/**
 * INTENTIONALLY EMPTY: no owner-approved, deterministic per-intensity dose exists
 * yet. Choosing an intensity therefore never yields grams — it stays a preference
 * and the flavor line stays unresolved until a verified profile is added here.
 */
export const VERIFIED_FLAVOR_DOSE_PROFILES: VerifiedFlavorDoseProfiles = {};

export interface IntensityDoseResult {
  /** True ONLY when a verified deterministic dose exists for tag + intensity. */
  resolved: boolean;
  /** Grams — present ONLY when resolved by a verified profile. Never invented. */
  grams?: number;
}

/**
 * Resolve grams for a flavor at a chosen intensity STRICTLY from a verified
 * profile. With no verified profile (the default), returns `{ resolved: false }`
 * and NO grams: the intensity remains a preference, never a fabricated dose.
 */
export function resolveIntensityDose(
  tag: string,
  intensity: FlavorIntensity | null,
  profiles: VerifiedFlavorDoseProfiles = VERIFIED_FLAVOR_DOSE_PROFILES,
): IntensityDoseResult {
  if (intensity === null) return { resolved: false };
  const profile = profiles[tag]?.[intensity];
  if (profile && Number.isFinite(profile.grams) && profile.grams > 0) {
    return { resolved: true, grams: profile.grams };
  }
  return { resolved: false };
}

/* ------------------------------------------------------------------------ *
 * Honest recipe status (blocks a "fully calculated" claim)                  *
 * ------------------------------------------------------------------------ */

export type CustomerRecipeStatusKind = 'needs_intensity' | 'fully_calculated';

/**
 * The honest status for a recipe view. While ANY line is still unresolved the
 * recipe is "almost ready" (`needs_intensity`) — it must NOT be presented as
 * fully calculated / balanced / optimized. Only a zero unresolved count may claim
 * `fully_calculated`.
 */
export function customerRecipeStatusKind(unresolvedCount: number): CustomerRecipeStatusKind {
  return unresolvedCount > 0 ? 'needs_intensity' : 'fully_calculated';
}
