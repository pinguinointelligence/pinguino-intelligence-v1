/**
 * PRESENTATION-LAYER LOCALE REGISTRY (Gellatti multilanguage foundation).
 *
 * This module is deliberately tiny and carries NO business logic. It exists so
 * that adding a language is "add a locale resource", never "rewrite functional
 * source". Three rules hold everywhere in the app:
 *
 *  1. RAW SOURCE VALUES ARE CONTRACTS. Enum values, status codes, object keys,
 *     DB/API fields, route names, PI-ING identities, ProductBehavior codes and
 *     Mapper identity are NEVER translated. When such a value must be shown to
 *     a customer it goes through a DISPLAY MAP (see rule 2) — the raw value
 *     stays byte-exact.
 *
 *  2. DISPLAY MAPS ARE SEPARATE FROM SOURCE VALUES. The established convention
 *     is a `…Pl` presentation function keyed BY the raw contract value, e.g.
 *     `productProfileStatusLabelPl('PI Verified')`, `engineDisplayLabelPl`,
 *     `scaleMessagePl`, `productionRescueErrorMessagePl`, `branchCodeLabelPl`.
 *     A second language adds a sibling map (or a locale-keyed record) — it
 *     never edits the key.
 *
 *  3. WHOLE COPY MODULES USE THE `CommunityCopy` PATTERN. One `interface`
 *     describes the keys; one complete object per locale implements it; a
 *     resolver picks the object. `src/copy/community.ts` is the reference
 *     implementation, and its source test asserts both objects carry identical
 *     key sets, so an untranslated key is a test failure rather than an English
 *     word leaking into a Polish screen.
 *
 * REGULATORY OUTPUT IS OUT OF SCOPE HERE. Legal label wording belongs to the
 * market/language profile (`src/features/master-label/marketProfiles.ts` and
 * `src/features/master-label/renderers/*`), not to the app locale: a Polish UI
 * still prints the US "Nutrition Facts" panel in its legally required wording.
 *
 * DYNAMIC DATA IS ALSO OUT OF SCOPE. Canonical Mapper names, commercial brand
 * and machine names, and user-entered recipe titles are DATA, never translated.
 */

/** Locales the presentation layer can resolve. Polish is the verified reference. */
export type AppLocale = 'pl';

/**
 * The reference locale: the one that is served, audited and owner-locked. Every
 * other locale falls back to it, so a missing resource degrades to correct
 * Polish rather than to a blank screen or a raw contract code.
 */
export const REFERENCE_LOCALE: AppLocale = 'pl';

/** The fallback used whenever a locale has no resource for something. */
export const FALLBACK_LOCALE: AppLocale = REFERENCE_LOCALE;

/** The locales currently shipped, in display order. */
export const SUPPORTED_LOCALES: readonly AppLocale[] = [REFERENCE_LOCALE];

export const isSupportedLocale = (value: unknown): value is AppLocale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * Pick one locale's resource with a guaranteed fallback to {@link FALLBACK_LOCALE}.
 * Use for whole copy objects (rule 3) and for locale-keyed display maps (rule 2).
 */
export function resolveLocaleResource<T>(
  resources: Readonly<Partial<Record<AppLocale, T>>>,
  locale: AppLocale = REFERENCE_LOCALE,
): T {
  const chosen = resources[locale] ?? resources[FALLBACK_LOCALE];
  if (chosen === undefined) {
    throw new Error(
      `Locale resource is missing for "${locale}" and for the fallback "${FALLBACK_LOCALE}".`,
    );
  }
  return chosen;
}

/**
 * Look one raw CONTRACT value up in a locale display map. The key is always the
 * untouched contract value; `fallback` (usually the raw value itself) is
 * returned when the locale has no wording for it yet, so an unmapped code is
 * visible-but-harmless rather than a crash.
 */
export function resolveDisplayLabel(
  maps: Readonly<Partial<Record<AppLocale, Readonly<Record<string, string>>>>>,
  rawValue: string,
  locale: AppLocale = REFERENCE_LOCALE,
  fallback: string = rawValue,
): string {
  const map = maps[locale] ?? maps[FALLBACK_LOCALE];
  return map?.[rawValue] ?? fallback;
}
