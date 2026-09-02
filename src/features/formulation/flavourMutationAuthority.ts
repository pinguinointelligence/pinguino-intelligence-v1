/**
 * FLAVOUR MUTATION AUTHORITY (owner P1-B, 2026-08-23).
 *
 * The optimizer may freely move TECHNOLOGICAL mass — water, canonical sugars,
 * dairy/plant structure, fibre, stabilizer within its dose window. It may NOT
 * treat a FLAVOUR-DEFINING ingredient as interchangeable balancing mass.
 *
 * Served real-user regression that produced this module: a published Strawberry
 * Sorbet (STRAWBERRIES 600 g Main, LEMON SQUEEZED juice 30 g, water 130 g) was
 * "corrected" to lemon juice 188 g / water 1 g and rated 10/10. Both fruit lines
 * resolve to the same `fruit` role, so the sorbet template's single 600 g fruit
 * target was split equally between them (`targetGrams / matches.length`) and the
 * user's 30 g acid accent became a co-equal flavour base.
 *
 * The rule is deliberately an AUTHORITY question — "may this line be RAISED, and
 * on whose authority?" — not a hardcoded ceiling and not a water floor:
 *
 *   - MAIN                    → existing Main / Multi-Main authority (untouched).
 *   - SOLE carrier of a role  → the recipe's own flavour base; may move.
 *   - SECONDARY carrier       → the user's supplied amount IS the authority.
 *                               It may be reduced, never silently raised.
 *
 * A line with an explicit dosage/range authority (user lock, §17 range,
 * ProductBehavior dosage window) is unaffected: those branches keep priority and
 * continue to define their own legal interval.
 */
import type { RecipeInput } from '@/engine';

import { resolveFunctionalRole, type FunctionalRole } from './ingredientRoles';

/**
 * Roles whose GRAM AMOUNT is flavour identity rather than free technological
 * mass.
 *
 * Scoped on purpose:
 *  - `plant_liquid` / `plant_fat` are excluded — they are the structural Vegan
 *    base (oat drink, coconut fat), not an accent, and must stay optimizable.
 *  - `flavor_other` is excluded — real Mapper rows land there by mis-resolution
 *    (notably `WATER · Liquid`, whose category is `liquid`), so freezing it
 *    would silently create the water floor the owner explicitly forbade.
 */
export const FLAVOUR_SENSITIVE_ROLES: ReadonlySet<FunctionalRole> = new Set([
  'fruit',
  'chocolate_cocoa',
  'nut_paste',
  'alcohol',
  'salt_modifier',
]);

export const isFlavourSensitiveRole = (role: FunctionalRole): boolean =>
  FLAVOUR_SENSITIVE_ROLES.has(role);

/**
 * Line ids the optimizer may NOT raise above the amount the user supplied,
 * because nothing in the recipe authorises a larger dose.
 *
 * Deterministic primary-carrier resolution inside each flavour role:
 *   1. any `main` line   → the Main group owns the role;
 *   2. otherwise the single largest positive carrier (draft order breaks ties)
 *      → the user's evident flavour base.
 * Every other positive carrier of that role is SECONDARY and gram-held.
 *
 * A role with exactly one carrier never produces a held line, so single-fruit
 * sorbets, single-paste pistachio gelato and every other accepted single-carrier
 * flow keep their current behaviour byte-for-byte.
 */
export function flavourHeldLineIds(input: RecipeInput): ReadonlySet<string> {
  const byRole = new Map<FunctionalRole, Array<{ id: string; grams: number; main: boolean }>>();

  for (const item of input.items) {
    if (item.planned_grams <= 0) continue;
    const role = resolveFunctionalRole(item.ingredient);
    if (!isFlavourSensitiveRole(role)) continue;
    const bucket = byRole.get(role) ?? [];
    bucket.push({
      id: item.id,
      grams: item.planned_grams,
      main: item.lock_type === 'main',
    });
    byRole.set(role, bucket);
  }

  const held = new Set<string>();
  for (const carriers of byRole.values()) {
    if (carriers.length <= 1) continue;

    const mains = carriers.filter((carrier) => carrier.main);
    if (mains.length > 0) {
      // The Main group already owns this role; every non-Main carrier is an accent.
      for (const carrier of carriers) if (!carrier.main) held.add(carrier.id);
      continue;
    }

    // No Main: the largest carrier is the flavour base, the rest are accents.
    let primary = carriers[0]!;
    for (const carrier of carriers) if (carrier.grams > primary.grams) primary = carrier;
    for (const carrier of carriers) if (carrier.id !== primary.id) held.add(carrier.id);
  }

  return held;
}
