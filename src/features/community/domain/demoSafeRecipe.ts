/**
 * Demo-safe recipe projection (§9, §16, §17) — PURE, no IO.
 *
 * THE RULE: hiding grams with CSS is not security. A visitor who is not
 * entitled to a formulation must never RECEIVE it — not in an API response,
 * not in the HTML, not in a hydration payload, not in Open Graph metadata,
 * not in an analytics event.
 *
 * This module is the client-side MIRROR of the database function
 * `public.gellatti_demo_safe_projection_v1`, which is where the guarantee
 * actually lives (the server is the authority; a client mirror can only ever
 * be a convenience). It exists for three reasons:
 *   1. it types what a demo-safe payload IS, so a component cannot casually
 *      read `.planned_grams` off one and have it type-check;
 *   2. it gives the redaction a testable, reviewable definition in the same
 *      language as the UI that consumes it;
 *   3. `assertDemoSafe` is a runtime tripwire that can be pointed at ANY
 *      payload — including a server response — to prove no forbidden key
 *      survived. It is a defence in depth, not the defence.
 *
 * WHITELIST, NEVER BLACKLIST: `toDemoSafeRecipe` BUILDS its output from named
 * safe fields. An Engine field added tomorrow is absent by construction
 * rather than leaking until somebody remembers to redact it.
 */

/** One line of a demo-safe recipe: what it is, never how much of it. */
export interface DemoSafeItem {
  /** The ingredient's display name — safe: names are what a recipe IS. */
  readonly name: string;
  /** Coarse family (dairy / sugar / fruit …), never a Mapper identifier. */
  readonly ingredient_category?: string;
  /** Marks the hero ingredient so the preview reads as a real recipe. */
  readonly is_main?: boolean;
}

/** The ONLY recipe shape a non-entitled surface may hold. */
export interface DemoSafeRecipe {
  readonly demo_safe: true;
  readonly category?: string;
  readonly mode?: string;
  readonly target_temperature_c?: number;
  /** Batch SIZE is not a proportion: it cannot reconstruct a formulation. */
  readonly target_batch_grams?: number;
  readonly line_count: number;
  readonly items: readonly DemoSafeItem[];
}

/**
 * Keys that must never appear anywhere inside a demo-safe payload, at any
 * depth. Two groups:
 *   - QUANTITY: grams and every constraint that pins a gram value. Any one of
 *     these, per line, reconstructs the formulation.
 *   - PROPRIETARY: the composition/POD/PAC/cost/Mapper-identity fields that
 *     are the Engine's and the catalogue's own work, not the recipe's.
 */
export const FORBIDDEN_DEMO_KEYS: readonly string[] = [
  // quantity
  'planned_grams', 'actual_grams', 'grams_constraint', 'range_constraint',
  'percent_constraint', 'main_ratio_weight', 'user_intent_anchor_grams',
  'soft_target_grams', 'total_batch_g', 'items_g', 'grams',
  // proprietary composition / catalogue internals
  'composition', 'pod_value', 'pac_value', 'npac_value', 'de_value',
  'cost_per_kg', 'cost_currency', 'cost_source', 'confidence_score',
  'canonical_ingredient_id', 'private_product_id', 'mapper_ingredient_id',
  // engine intent that would reveal the target the formulation was solved to
  'goals',
];

const FORBIDDEN = new Set(FORBIDDEN_DEMO_KEYS);

interface RawItemLike {
  readonly ingredient?: { readonly name?: unknown; readonly category?: unknown };
  readonly lock_type?: unknown;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Project a full `recipe_input` down to its demo-safe form.
 *
 * Note what is NOT here: no `planned_grams` read, no `composition` read, no
 * cost read, no goals read. There is no code path through this function that
 * can emit one, which is the point.
 */
export function toDemoSafeRecipe(recipeInput: unknown): DemoSafeRecipe {
  const input = (recipeInput ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(input.items) ? (input.items as RawItemLike[]) : [];

  const items: DemoSafeItem[] = rawItems.map((item) => {
    const ingredient = (item?.ingredient ?? {}) as Record<string, unknown>;
    const safe: DemoSafeItem = {
      name: str(ingredient.name) ?? 'Składnik',
      ...(str(ingredient.category) ? { ingredient_category: str(ingredient.category) } : {}),
      ...(item?.lock_type === 'MAIN' ? { is_main: true } : {}),
    };
    return safe;
  });

  return {
    demo_safe: true,
    ...(str(input.category) ? { category: str(input.category) } : {}),
    ...(str(input.mode) ? { mode: str(input.mode) } : {}),
    ...(num(input.target_temperature_c) !== undefined
      ? { target_temperature_c: num(input.target_temperature_c) }
      : {}),
    ...(num(input.target_batch_grams) !== undefined
      ? { target_batch_grams: num(input.target_batch_grams) }
      : {}),
    line_count: items.length,
    items,
  };
}

export interface DemoLeak {
  readonly path: string;
  readonly key: string;
}

/**
 * Walk ANY value and report every forbidden key found, with its path.
 *
 * Point this at a server response before rendering it, at an analytics
 * payload before sending it, and at Open Graph metadata before emitting it.
 * An empty result is evidence; a non-empty result is a bug that must fail a
 * test rather than reach a browser.
 */
export function findDemoLeaks(value: unknown, path = '$'): readonly DemoLeak[] {
  const leaks: DemoLeak[] = [];
  const visit = (node: unknown, at: string, seen: Set<object>): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node as object)) return; // cycle guard
    seen.add(node as object);
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${at}[${index}]`, seen));
      return;
    }
    for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN.has(key)) leaks.push({ path: `${at}.${key}`, key });
      visit(entry, `${at}.${key}`, seen);
    }
  };
  visit(value, path, new Set());
  return leaks;
}

/** True when nothing in `value` could reconstruct a formulation. */
export const isDemoSafe = (value: unknown): boolean => findDemoLeaks(value).length === 0;

/**
 * Throw on any leak. Used in tests and at the few runtime boundaries where a
 * silent leak would be worse than a crash (metadata emission, share previews).
 */
export function assertDemoSafe(value: unknown, context: string): void {
  const leaks = findDemoLeaks(value);
  if (leaks.length > 0) {
    throw new Error(
      `[Gellatti] demo-safe violation in ${context}: ${leaks.map((leak) => leak.path).join(', ')}`,
    );
  }
}
