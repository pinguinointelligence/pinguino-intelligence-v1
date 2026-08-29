/**
 * DISPLAY ALIASES ONLY — Polish wording for generic canonical catalog values.
 *
 * These values (`canonicalFamily`, `category`) are DYNAMIC CATALOG DATA owned by
 * the Mapper / global catalog. Nothing here mutates them: the canonical PI-ING
 * identity, the stored family/category value and every technical fact stay
 * byte-exact. This module only chooses the wording shown next to a product.
 *
 * Commercial brand names, machine models, product codes and the canonical
 * product NAME are never aliased — they are data, not copy.
 *
 * An unmapped value falls back to itself, so a new family added in the database
 * appears unlocalised rather than blank.
 */

const CANONICAL_FAMILY_PL: Readonly<Record<string, string>> = {
  // generic buckets seen on canonical catalog rows
  general: 'Ogólne',
  other: 'Inne',
  dairy: 'Nabiał',
  milk: 'Nabiał',
  cream: 'Śmietanka',
  fruit: 'Owoce',
  vegetable: 'Warzywa',
  botanical: 'Zioła',
  sweetener: 'Cukry i substancje słodzące',
  sugar: 'Cukry i substancje słodzące',
  stabilizer: 'Stabilizatory',
  emulsifier: 'Emulgatory',
  fat: 'Tłuszcze',
  nut: 'Orzechy',
  nut_paste: 'Orzechy',
  chocolate: 'Czekolada i kakao',
  cocoa: 'Czekolada i kakao',
  beverage: 'Napoje',
  alcohol: 'Alkohol',
  coconut: 'Kokos',
  bakery: 'Wypieki',
  confectionery: 'Słodycze',
  protein: 'Białko',
  water: 'Woda',
  salt: 'Sól',
  // flavour families produced by canonicalFamilyFor()
  strawberry: 'Truskawka',
  pistachio: 'Pistacja',
  mango: 'Mango',
  vanilla: 'Wanilia',
  coffee: 'Kawa',
  banana: 'Banan',
};

/**
 * Polish wording for a canonical family / category value. The stored value is
 * never changed — an unknown one is returned exactly as it came from the
 * catalog.
 */
export function canonicalFamilyLabelPl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const key = value.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return CANONICAL_FAMILY_PL[key] ?? value;
}

/** Every canonical value this alias table covers (used by the source test). */
export const canonicalFamilyAliasKeysPl = (): readonly string[] =>
  Object.keys(CANONICAL_FAMILY_PL);
