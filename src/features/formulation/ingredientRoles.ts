/**
 * Canonical FUNCTIONAL ingredient roles (owner P0 — full formulation).
 *
 * PURE resolution from the ingredient's existing engine data (category,
 * composition, POD/PAC, flags) — no new science, no Mapper writes. The visible
 * presentation label (e.g. „GŁÓWNY") stays a UI concern; the FORMULATION layer
 * always receives the real functional role resolved here.
 */
import type { EngineIngredient } from '@/engine';

/**
 * THE PAC/POD UNIT CONTRACT (spec §7–§8; `engine/pod.ts`, `engine/pac.ts`).
 *
 * Stored `pod_value` / `pac_value` — on the Mapper row and on `EngineIngredient`
 * alike — are per-100 g POINTS with sucrose = 100; the engine spends them as
 * `grams × value / 100`. The engine's own coefficient tables in
 * `src/engine/config/coefficients.ts` (sucrose 1.00, dextrose 1.90) are the
 * 0–1 FACTOR scale this classifier has always reasoned in.
 *
 * Role classification is the only place that has to cross between the two, so
 * the conversion happens HERE, once, on the read side. The stored value is
 * never rewritten and no calculation that legitimately spends PAC=100 as an
 * index is touched.
 */
export const ROLE_CLASSIFICATION_POINTS_PER_FACTOR = 100;

/** Stored per-100 g points → the coefficient factor role rules compare against. */
export function normalizeStoredPointsToRoleFactor(
  points: number | null | undefined,
): number | null {
  return points == null || !Number.isFinite(points)
    ? null
    : points / ROLE_CLASSIFICATION_POINTS_PER_FACTOR;
}

/**
 * „This component IS the ingredient" — the dominance convention this file
 * already applies to salt and fibre, reused for the sucrose sweeteners.
 */
const DOMINANT_COMPONENT_PERCENT = 50;

/**
 * The PAC/POD FACTOR separating sucrose (1.00) from the freezing-control sugars
 * (dextrose/glucose/fructose 1.90) in the engine's coefficient table (spec §8).
 * This is the long-standing separator — unchanged in value, now finally
 * compared on the scale it was written for.
 */
const SUGAR_FREEZING_CONTROL_FACTOR = 1.3;

/**
 * Plain water carries no solids, no sweetness and no freezing power of its own.
 * This is the composition SANITY half of the water rule — never the whole test:
 * a zero-sugar cola has exactly the same numbers.
 */
function isInertAqueous(ingredient: EngineIngredient): boolean {
  const c = ingredient.composition;
  return (
    c.water_percent >= 99 &&
    c.solids_percent <= 1 &&
    c.sugar_percent <= 0 &&
    c.fat_percent <= 0 &&
    c.protein_percent <= 0 &&
    c.polyol_percent <= 0 &&
    c.alcohol_percent <= 0 &&
    c.fiber_percent <= 0 &&
    (ingredient.pod_value === null || ingredient.pod_value === 0) &&
    (ingredient.pac_value === null || ingredient.pac_value === 0)
  );
}

export type FunctionalRole =
  | 'primary_liquid' // milk / plain dairy liquid base
  | 'dairy_fat' // cream, high-fat dairy
  | 'milk_solids' // SMP and dry dairy solids
  | 'sweetener_sucrose' // primary sweetness (POD ~1, PAC ~1)
  | 'sugar_freezing_control' // dextrose/fructose/glucose (high PAC)
  | 'fiber_body' // inulin / fibres (body + solids, low POD/PAC)
  | 'stabilizer' // gums / stabilizer blends
  | 'salt_modifier' // salt (flavour modifier — never freely optimized)
  | 'fruit' // fresh fruit / puree
  | 'chocolate_cocoa'
  | 'nut_paste'
  | 'alcohol'
  | 'plant_liquid' // vegan liquid base (oat/soy drink)
  | 'plant_fat' // vegan fat source (coconut milk/oil)
  | 'protein_source' // WPC/MPC/protein isolates
  | 'water'
  | 'egg'
  | 'flavor_other'; // flavour/aroma/unmapped — never freely optimized

/** Deterministic functional-role resolution from existing engine data only. */
export function resolveFunctionalRole(ingredient: EngineIngredient): FunctionalRole {
  const c = ingredient.composition;
  const id = ingredient.id.toLowerCase();
  const name = ingredient.name.toLowerCase();

  // WATER.
  //
  // The engine-native category and the canonical toolbox identity are decisive
  // on their own. A DATASET row needs both halves of the evidence: the declared
  // `water` subcategory AND an inert aqueous composition. Composition alone
  // cannot do it — `PEPSI MAX` and `WATER · Liquid` are both 100 % water, 0 %
  // solids, POD 0 and PAC 0, so a composition-only rule would turn every
  // zero-sugar cola, energy drink and soda into water. The subcategory alone
  // cannot do it either: it would accept a mislabelled sugary row.
  //
  // This is what let canonical Mapper water (`liquid` / `water`, which the
  // category map sends to the engine `other` bucket) resolve to `flavor_other`
  // while the Sorbet templates were asking for the `water` HARD role.
  if (ingredient.category === 'water' || id === 'water' || name === 'water') return 'water';
  if (
    ingredient.source_subcategory?.trim().toLocaleLowerCase('en') === 'water' &&
    isInertAqueous(ingredient)
  ) {
    return 'water';
  }
  // Inulin by IDENTITY first — datasets file it under stabilizer/specialty, but
  // it is the body/fibre agent, not a gum. Gums stay stabilizers.
  if (id.includes('inulin') || name.includes('inulin') || name.includes('inulina'))
    return 'fiber_body';
  if (ingredient.category === 'stabilizer') return 'stabilizer';
  if (c.salt_percent >= DOMINANT_COMPONENT_PERCENT) return 'salt_modifier';
  if (ingredient.category === 'fruit') return 'fruit';
  if (ingredient.category === 'chocolate_cocoa') return 'chocolate_cocoa';
  if (ingredient.category === 'nut_paste') return 'nut_paste';
  if (ingredient.category === 'alcohol' || c.alcohol_percent >= 5) return 'alcohol';
  if (ingredient.category === 'egg') return 'egg';

  if (ingredient.category === 'sugar') {
    // The sugar bucket splits on POSITIVE sucrose evidence — never on a
    // residual „whatever is left is sucrose", which is how an artificial
    // high-intensity sweetener (PAC 0) used to be the one row in the whole
    // Mapper that reached this role.
    //
    // A sucrose sweetener has to actually BE sucrose: sucrose dominates the row
    // by mass, out-weighs both the freezing-control sugars and the polyols (so
    // a bulk polyol sweetener is never promoted here), and its measured
    // sweetening and freezing powers sit in the sucrose band — the role's own
    // definition, POD ~1 / PAC ~1, read on the FACTOR scale (see the unit
    // contract above). Everything else in the bucket keeps the freezing-control
    // role, exactly as before.
    const controlSugars = c.dextrose_percent + c.fructose_percent + c.glucose_percent;
    const pac = normalizeStoredPointsToRoleFactor(ingredient.pac_value);
    const pod = normalizeStoredPointsToRoleFactor(ingredient.pod_value);
    const isSucroseSweetener =
      c.sucrose_percent >= DOMINANT_COMPONENT_PERCENT &&
      c.sucrose_percent > controlSugars &&
      c.sucrose_percent > c.polyol_percent &&
      (pac === null || pac < SUGAR_FREEZING_CONTROL_FACTOR) &&
      (pod === null || pod < SUGAR_FREEZING_CONTROL_FACTOR);
    return isSucroseSweetener ? 'sweetener_sucrose' : 'sugar_freezing_control';
  }

  // Other fibres: very high fibre content, negligible sweetness contribution.
  if (c.fiber_percent >= DOMINANT_COMPONENT_PERCENT) return 'fiber_body';

  if (ingredient.category === 'dairy') {
    if (c.fat_percent >= 20) return 'dairy_fat';
    if (c.protein_percent >= 50) return 'protein_source';
    if (c.solids_percent >= 85) return c.protein_percent >= 25 ? 'milk_solids' : 'milk_solids';
    if (c.protein_percent >= 25) return 'protein_source';
    return 'primary_liquid';
  }

  // Plant-based liquids/fats (vegan): non-animal, liquid-like or fatty.
  const animal = ingredient.flags?.is_animal_origin === true;
  if (!animal && (name.includes('coconut') || name.includes('kokos')) && c.fat_percent >= 10)
    return 'plant_fat';
  if (
    !animal &&
    c.water_percent >= 75 &&
    (name.includes('drink') ||
      name.includes('oat') ||
      name.includes('soy') ||
      name.includes('napój'))
  ) {
    return 'plant_liquid';
  }
  if (c.protein_percent >= 30) return 'protein_source';

  return 'flavor_other';
}
