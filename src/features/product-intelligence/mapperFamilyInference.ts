/**
 * Deterministic Mapper-family inference — use what Gellatti already knows before
 * ever reaching for the internet.
 *
 * An incoming product rarely matches a Mapper row exactly, but it very often
 * belongs to a family Gellatti already understands ("pea protein isolate 82%" →
 * plant protein isolate; "refined coconut oil" → coconut fat). This module finds
 * that family from existing canonical data.
 *
 * FAMILY IS NOT IDENTITY. A family match raises confidence and can supply
 * plausible composition expectations, but every field it contributes is stamped
 * `mapper_family` provenance — never `label`/`mapper_exact`. It can never
 * masquerade as verification, and it never grants technical authority.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */

export type ProductFamilyId =
  | 'plant_protein_isolate'
  | 'dairy_protein'
  | 'coconut_fat'
  | 'cocoa_butter'
  | 'liquid_vegetable_oil'
  | 'nut_paste'
  | 'sugar_sucrose'
  | 'glucose_dextrose'
  | 'other_sugar'
  | 'stabilizer_hydrocolloid'
  | 'emulsifier'
  | 'fibre_inulin'
  | 'starch'
  | 'plant_beverage'
  | 'dairy_liquid'
  | 'fruit'
  | 'chocolate'
  | 'flavor_paste'
  | 'base_mix'
  | 'alcohol';

export interface ProductFamilyMatch {
  family: ProductFamilyId;
  /** Deterministic 0–1 strength of the textual/categorical evidence. */
  strength: number;
  /** Why this family was chosen — owner-readable. */
  evidence: string[];
  /** TRUE only for families whose use is gated by separate technical authority. */
  technical: boolean;
}

interface FamilyRule {
  family: ProductFamilyId;
  technical: boolean;
  /** Must match for the family to be considered at all. */
  pattern: RegExp;
  /** Any of these raises strength — a second independent signal. */
  corroborating?: RegExp;
  /** Mapper categories that corroborate this family. */
  categories?: readonly string[];
}

/**
 * Rules are ordered most-specific first. Every pattern is deliberately narrow:
 * a missed family costs a little confidence, a wrong family costs correctness.
 */
const FAMILY_RULES: readonly FamilyRule[] = [
  {
    family: 'plant_protein_isolate',
    technical: false,
    pattern:
      /\b(pea|soy|soya|rice|chickpea|oat|hemp|sunflower|faba|potato)\b[^,;]{0,24}\bprotein\b|\bprotein\b[^,;]{0,24}\b(isolate|concentrate|izolat|koncentrat)\b|\bbialko\b[^,;]{0,24}\b(groch|soj|ryz|ryz|owsian)/i,
    corroborating: /\b(isolate|isolat|izolat|concentrate|koncentrat)\b|\b\d{2}\s?%/i,
    categories: ['protein', 'specialty', 'base_mix'],
  },
  {
    family: 'dairy_protein',
    technical: false,
    pattern: /\b(whey|casein|caseinate|wpc|wpi|mpc|serwatk|kazein)\b/i,
    categories: ['dairy'],
  },
  {
    family: 'cocoa_butter',
    technical: false,
    // Must not catch cocoa powder / cocoa mass.
    pattern: /\bcocoa\s*butter\b|\bcacao\s*butter\b|\bmaslo\s*kakaowe\b/i,
    categories: ['chocolate'],
  },
  {
    family: 'coconut_fat',
    technical: false,
    // "coconut oil/fat" only — not coconut milk, water or sugar.
    pattern: /\bcoconut\b[^,;]{0,12}\b(oil|fat|butter)\b|\bolej\s*kokosow|\btluszcz\s*kokosow/i,
    categories: ['coconut'],
  },
  {
    family: 'liquid_vegetable_oil',
    technical: false,
    pattern:
      /\b(sunflower|rapeseed|canola|olive|soybean|corn|grapeseed)\b[^,;]{0,12}\boil\b|\bolej\s*(slonecznikow|slonecznikow|rzepakow|sojow|z\s*oliwek)/i,
  },
  {
    family: 'nut_paste',
    technical: false,
    pattern:
      /\b(hazelnut|almond|pistachio|cashew|walnut|peanut|macadamia|pecan)\b[^,;]{0,16}\b(paste|butter|praline|pasta)\b|\bpasta\s*(?:z\s+)?(orzechow|migdalow|pistacjow)/i,
    categories: ['nut', 'flavor_paste'],
  },
  {
    family: 'glucose_dextrose',
    technical: false,
    pattern: /\b(dextrose|glucose|dekstroz|glukoz)\b/i,
    corroborating: /\bmonohydrate\b|\banhydrous\b|\bmonohydrat\b|\bDE\s?\d+/i,
    categories: ['sweetener'],
  },
  {
    family: 'sugar_sucrose',
    technical: false,
    pattern: /\b(sucrose|saccharose|table\s*sugar|cukier\s*(bialy|krysztal)|sacharoz)\b/i,
    categories: ['sweetener'],
  },
  {
    family: 'other_sugar',
    technical: false,
    pattern: /\b(fructose|maltose|trehalose|invert\s*sugar|fruktoz|maltoz|cukier\s*inwertowany)\b/i,
    categories: ['sweetener'],
  },
  {
    family: 'fibre_inulin',
    technical: false,
    pattern: /\b(inulin|inulina|oligofructose|oligofruktoz|fos\b|polydextrose)\b/i,
  },
  {
    family: 'starch',
    technical: false,
    pattern: /\b(starch|skrobia|maltodextrin|maltodekstryn|tapioca|dextrin)\b/i,
  },
  {
    family: 'stabilizer_hydrocolloid',
    technical: true,
    pattern:
      /\b(tara|guar|locust\s*bean|carob\s*bean|lbg|carrageenan|karagen|xanthan|ksantan|pectin|pektyn|agar|cmc|cellulose\s*gum|gellan|alginate|alginian)\b|\bstabiliz(er|ator)\b|\bguma\s+(tara|guar|ksantan)/i,
    categories: ['stabilizer'],
  },
  {
    family: 'emulsifier',
    technical: true,
    pattern:
      /\bemulsifier\b|\bemulgator\b|\bmono.{0,4}diglycer|\blecithin\b|\blecytyn\b|\bpolysorbate\b|\bpolisorbat\b|\be4?7[12]\b|\be322\b/i,
    categories: ['stabilizer'],
  },
  {
    family: 'plant_beverage',
    technical: false,
    pattern:
      /\b(oat|soy|soya|almond|rice|coconut|cashew|hazelnut)\b[^,;]{0,16}\b(drink|milk|beverage|napoj|napoj)\b|\bnapoj\s*(owsian|sojow|migdalow|ryzow)/i,
    categories: ['beverage'],
  },
  {
    family: 'dairy_liquid',
    technical: false,
    pattern: /\b(milk|cream|smietan|smietan|mleko)\b/i,
    categories: ['dairy'],
  },
  { family: 'chocolate', technical: false, pattern: /\b(chocolate|czekolad|cocoa|kakao)\b/i, categories: ['chocolate'] },
  { family: 'fruit', technical: false, pattern: /\b(puree|pulp|przecier)\b/i, categories: ['fruit'] },
  { family: 'alcohol', technical: false, pattern: /\b(liqueur|rum|vodka|whisky|brandy|likier|wodka|wodka)\b/i, categories: ['alcohol'] },
  { family: 'flavor_paste', technical: false, pattern: /\bpaste\b|\bpasta\b/i, categories: ['flavor_paste'] },
];

/**
 * Category-driven families. Many professional products carry no family signal in
 * the name at all — a Comprital paste is called "ALBICOCCA" — but the source
 * category/subcategory says exactly what it is, in the Mapper's own vocabulary
 * (flavor_paste, base_mix, chocolate, stabilizer, nut, fruit). This is weaker
 * evidence than an explicit name and is scored accordingly.
 */
interface CategoryRule {
  family: ProductFamilyId;
  technical: boolean;
  /** Matched against the normalized source category. */
  category?: RegExp;
  /** Matched against the normalized source subcategory. */
  subcategory?: RegExp;
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  { family: 'stabilizer_hydrocolloid', technical: true, category: /stabiliz|emulsifier/ },
  { family: 'flavor_paste', technical: false, subcategory: /\bpast[ay]\b|variegat|toppingi/ },
  { family: 'base_mix', technical: false, subcategory: /\bspeedy\b|\bbaz[ay]\b|\bbase\b|\bmix\b/ },
  { family: 'chocolate', technical: false, category: /chocolate|cocoa/ },
  { family: 'nut_paste', technical: false, category: /\bnut/ },
  { family: 'fruit', technical: false, category: /\bfruit\b/ },
  { family: 'plant_beverage', technical: false, category: /beverage/ },
  { family: 'dairy_liquid', technical: false, category: /\bdairy\b/ },
  { family: 'sugar_sucrose', technical: false, category: /sweetener/ },
  { family: 'alcohol', technical: false, category: /alcohol/ },
  // The Mapper's OWN category vocabulary. Without these, Mapper rows whose
  // names carry no family signal never join any cohort at all — `base_mix` and
  // `flavor_paste` are literal Mapper category values, and `\bmix\b` above
  // cannot match `base_mix` because the underscore is a word character.
  { family: 'base_mix', technical: false, category: /base_mix/ },
  { family: 'flavor_paste', technical: false, category: /flavor_paste|\bflavor\b/ },
  { family: 'coconut_fat', technical: false, category: /coconut/ },
  { family: 'liquid_vegetable_oil', technical: false, category: /\bfat\b/ },
  { family: 'dairy_protein', technical: false, category: /protein/ },
  { family: 'fibre_inulin', technical: false, category: /fiber|fibre/ },
];

/**
 * Latin letters that carry their mark INSIDE the glyph rather than as a
 * combining accent. Unicode normalisation cannot decompose these, so stripping
 * combining marks leaves them untouched — which meant every Polish pattern
 * below (`maslo`, `bialko`, `slonecznikowy`) silently never matched real Polish
 * text. They are folded explicitly.
 */
const STROKED_LETTERS: Readonly<Record<string, string>> = Object.freeze({
  '\u0142': 'l', // ł
  '\u0141': 'l', // Ł
  '\u0111': 'd', // đ
  '\u0110': 'd', // Đ
  '\u00f8': 'o', // ø
  '\u00d8': 'o', // Ø
  '\u00df': 'ss', // ß
});

const STROKED_PATTERN = new RegExp(`[${Object.keys(STROKED_LETTERS).join('')}]`, 'g');

/** Fold a display string down to plain ASCII-ish letters for pattern matching. */
export const foldLatin = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(STROKED_PATTERN, (letter) => STROKED_LETTERS[letter] ?? letter)
    .toLowerCase();

const normalize = (value: string | null | undefined): string => foldLatin(value);

export interface FamilyInferenceInput {
  name: string | null;
  variant?: string | null;
  ingredients?: string | null;
  sourceCategory?: string | null;
  sourceSubcategory?: string | null;
}

/**
 * Infer the product family from existing Gellatti vocabulary. Returns null when
 * nothing matches — an unknown family is an honest answer, never a guess.
 */
export function inferMapperFamily(input: FamilyInferenceInput): ProductFamilyMatch | null {
  // Identity text only. Ingredients are deliberately EXCLUDED from family
  // detection: an ingredient list mentioning "sunflower lecithin" must not turn a
  // biscuit into a vegetable oil.
  const identity = normalize(`${input.name ?? ''} ${input.variant ?? ''}`);
  if (identity.trim() === '') return null;
  const category = normalize(input.sourceCategory);
  const subcategory = normalize(input.sourceSubcategory);

  for (const rule of FAMILY_RULES) {
    if (!rule.pattern.test(identity)) continue;
    const evidence = [`nazwa pasuje do rodziny ${rule.family}`];
    let strength = 0.6;
    if (rule.corroborating?.test(identity)) {
      strength += 0.2;
      evidence.push('dodatkowy sygnał w nazwie (postać/stężenie)');
    }
    if (
      rule.categories?.some((known) => category.includes(known) || subcategory.includes(known))
    ) {
      strength += 0.2;
      evidence.push('kategoria źródłowa zgodna z rodziną');
    }
    return {
      family: rule.family,
      strength: Math.min(1, Math.round(strength * 100) / 100),
      evidence,
      technical: rule.technical,
    };
  }

  // No name signal: fall back to the source category/subcategory. Weaker by
  // design — a category alone (0.6) stays below the inference threshold; it
  // only counts when the subcategory agrees too (0.8).
  for (const rule of CATEGORY_RULES) {
    const categoryHit = rule.category?.test(category) ?? false;
    const subcategoryHit =
      (rule.subcategory?.test(subcategory) ?? false) || (rule.category?.test(subcategory) ?? false);
    if (!categoryHit && !subcategoryHit) continue;
    const evidence: string[] = [];
    let strength = 0.6;
    if (categoryHit) evidence.push('kategoria źródłowa wskazuje rodzinę');
    if (subcategoryHit) {
      evidence.push('podkategoria źródłowa wskazuje rodzinę');
      strength += 0.2;
    }
    return {
      family: rule.family,
      strength: Math.round(strength * 100) / 100,
      evidence,
      technical: rule.technical,
    };
  }
  return null;
}

/** A family match is only strong enough to raise confidence above this bar. */
export const FAMILY_STRENGTH_THRESHOLD = 0.8;

/**
 * The bar for using a family to CHOOSE A COHORT, which is deliberately lower.
 *
 * Raising a product's confidence on the strength of a family match is an
 * unchecked claim, so it needs the 0.8 bar. Proposing "compare this against the
 * Mapper's dairy rows" is not a claim at all — whatever it proposes is then
 * tested field by field against the cohort's own dispersion, and refused unless
 * the cohort genuinely agrees. The dispersion gate is the safety property here,
 * so the proposal step can afford to be generous.
 */
export const FAMILY_COHORT_THRESHOLD = 0.6;

/** True when the family evidence is strong enough to propose a Mapper cohort. */
export function familySupportsCohort(match: ProductFamilyMatch | null): boolean {
  return match !== null && match.strength >= FAMILY_COHORT_THRESHOLD;
}

/** True when the family evidence is strong enough to count toward confidence. */
export function familySupportsInference(match: ProductFamilyMatch | null): boolean {
  return match !== null && match.strength >= FAMILY_STRENGTH_THRESHOLD;
}
