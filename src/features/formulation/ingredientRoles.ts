/**
 * Canonical FUNCTIONAL ingredient roles (owner P0 — full formulation).
 *
 * PURE resolution from the ingredient's existing engine data (category,
 * composition, POD/PAC, flags) — no new science, no Mapper writes. The visible
 * presentation label (e.g. „GŁÓWNY") stays a UI concern; the FORMULATION layer
 * always receives the real functional role resolved here.
 */
import type { EngineIngredient } from '@/engine';

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

  if (ingredient.category === 'water' || id === 'water' || name === 'water') return 'water';
  // Inulin by IDENTITY first — datasets file it under stabilizer/specialty, but
  // it is the body/fibre agent, not a gum. Gums stay stabilizers.
  if (id.includes('inulin') || name.includes('inulin') || name.includes('inulina')) return 'fiber_body';
  if (ingredient.category === 'stabilizer') return 'stabilizer';
  if (c.salt_percent >= 50) return 'salt_modifier';
  if (ingredient.category === 'fruit') return 'fruit';
  if (ingredient.category === 'chocolate_cocoa') return 'chocolate_cocoa';
  if (ingredient.category === 'nut_paste') return 'nut_paste';
  if (ingredient.category === 'alcohol' || c.alcohol_percent >= 5) return 'alcohol';
  if (ingredient.category === 'egg') return 'egg';

  if (ingredient.category === 'sugar') {
    // Freezing-control sugars (dextrose/fructose/glucose) are identified by the
    // engine's own composition sugar split — PAC when present is corroboration.
    const controlSugars = c.dextrose_percent + c.fructose_percent + c.glucose_percent;
    const pac = ingredient.pac_value;
    if (controlSugars > c.sucrose_percent || (pac !== null && pac >= 1.3)) {
      return 'sugar_freezing_control';
    }
    return 'sweetener_sucrose';
  }

  // Other fibres: very high fibre content, negligible sweetness contribution.
  if (c.fiber_percent >= 50) return 'fiber_body';

  if (ingredient.category === 'dairy') {
    if (c.fat_percent >= 20) return 'dairy_fat';
    if (c.solids_percent >= 85) return c.protein_percent >= 25 ? 'milk_solids' : 'milk_solids';
    if (c.protein_percent >= 25) return 'protein_source';
    return 'primary_liquid';
  }

  // Plant-based liquids/fats (vegan): non-animal, liquid-like or fatty.
  const animal = ingredient.flags?.is_animal_origin === true;
  if (!animal && (name.includes('coconut') || name.includes('kokos')) && c.fat_percent >= 10) return 'plant_fat';
  if (!animal && c.water_percent >= 75 && (name.includes('drink') || name.includes('oat') || name.includes('soy') || name.includes('napój'))) {
    return 'plant_liquid';
  }
  if (c.protein_percent >= 30) return 'protein_source';

  return 'flavor_other';
}
