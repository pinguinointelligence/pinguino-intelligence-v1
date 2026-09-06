/**
 * §22/§23/§49/§56 — get the user's OWN flavour into the generated recipe.
 *
 * The base that `rebuildNewRecipeStarter` produces is a correct, complete recipe for
 * the profile — but it is not yet what the user ASKED for. This hook closes that gap:
 * each intent chip is resolved to a real Mapper identity, hydrated into a full
 * `EngineIngredient`, and added through `recipeStore.addIngredient` — the same store
 * action the Pro builder calls.
 *
 * §49 — CROWN IS NOT DECIDED HERE. After adding a flavour we simply ask
 * `setMainIngredient`, and the existing authority decides: it refuses outright when
 * `mainBehaviorBlockReason` says the product may not hold the crown, and it seeds the
 * crown's own gram when it may. So an ineligible product is never forced into Main,
 * and HOME introduces no second classification.
 *
 * §22 — a chip that resolves to nothing is left unresolved and visible. It is never
 * swapped for "something similar", and nothing is added on its behalf.
 */
import { useCallback, useRef } from 'react';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import type { IntentRole } from './homeIntentParsing';
import { hydrateIngredient, resolveChipTerm } from './homeIntentResolutionService';

export interface IntentIngredientOutcome {
  readonly chipId: string;
  readonly status:
    | 'added'
    | 'crowned'
    | 'ambiguous'
    | 'unresolved'
    | 'unavailable'
    | 'duplicate'
    | 'needs_amount';
}

export function useHomeIntentIngredients() {
  const resolveChip = useHomeDraftStore((state) => state.resolveChip);
  // One pass per chip: resolution is a network round-trip, and a re-render must not
  // re-add a line the user has since removed.
  const handled = useRef<Set<string>>(new Set());

  /** Resolve a chip's identity and record it on the chip (§22, §23). */
  const resolveOne = useCallback(
    async (chip: IntentChip): Promise<IntentIngredientOutcome> => {
      // The canonical concept is tried before the raw word — the catalogue is
      // English and §25 invites Polish/Spanish/German input.
      const resolution = await resolveChipTerm({ label: chip.label, concept: chip.concept });
      switch (resolution.kind) {
        case 'resolved':
          resolveChip(chip.id, {
            productId: resolution.row.ingredient_id,
            productName: resolution.row.ingredient_name_display,
            ambiguous: false,
            candidates: undefined,
          });
          return { chipId: chip.id, status: 'added' };
        case 'ambiguous':
          // §23: the USER picks between materially different real products. The
          // candidates are stored so the question survives a refresh.
          resolveChip(chip.id, {
            ambiguous: true,
            candidates: resolution.candidates.map((row) => ({
              id: row.ingredient_id,
              name: row.ingredient_name_display,
            })),
          });
          return { chipId: chip.id, status: 'ambiguous' };
        case 'unavailable':
          return { chipId: chip.id, status: 'unavailable' };
        case 'unresolved':
          return { chipId: chip.id, status: 'unresolved' };
      }
    },
    [resolveChip],
  );

  /**
   * Add one already-resolved chip to the live recipe.
   *
   * Added at 0 g on purpose: HOME does not invent an amount, exactly as the Pro
   * builder does not. The crown attempt immediately after is what gives an eligible
   * flavour its first real gram; a line the authority refuses to crown stays at 0 g
   * and is reported as `needs_amount`, so the UI can surface Recalculate (§60) rather
   * than silently shipping a zero-gram ingredient.
   */
  const addByProductId = useCallback(
    async (
      key: string,
      productId: string,
      /**
       * What the customer said this product IS. A chip that said „topping" must land in
       * the topping collection, and a chip that did not must not be pushed into it.
       * Ignoring this is what put a Main in the topping list and a topping under the
       * Crown — the chip and the recipe row disagreed because they were reading
       * different things.
       */
      role: IntentRole = 'ingredient',
      /** Confirmed amount. A line is never created at 0 g; see below. */
      grams = 0,
    ): Promise<IntentIngredientOutcome> => {
      if (handled.current.has(key)) return { chipId: key, status: 'duplicate' };
      handled.current.add(key);

      const ingredient = await hydrateIngredient(productId);
      if (ingredient === null) return { chipId: key, status: 'unresolved' };

      if (role === 'topping') {
        const store = useRecipeStore.getState();
        const already = store.toppings.some((line) => line.ingredient.id === ingredient.id);
        if (already) return { chipId: key, status: 'duplicate' };
        // A topping is never crowned: the Crown is a Main concept and a topping is not
        // a Main. `addTopping` is the collection's own authority.
        store.addTopping(ingredient as never, grams);
        return { chipId: key, status: grams > 0 ? 'added' : 'needs_amount' };
      }

      const store = useRecipeStore.getState();
      const added = store.addIngredient(ingredient, grams);
      if (added.status === 'duplicate') return { chipId: key, status: 'duplicate' };

      // §49: ASK the existing authority. It refuses an ineligible product on its own.
      useRecipeStore.getState().setMainIngredient(added.lineId);
      const line = useRecipeStore.getState().items.find((item) => item.id === added.lineId);
      if (line?.lock_type === 'main') {
        return { chipId: key, status: line.planned_grams > 0 ? 'crowned' : 'needs_amount' };
      }
      return {
        chipId: key,
        status: line && line.planned_grams > 0 ? 'added' : 'needs_amount',
      };
    },
    [],
  );

  const addResolvedChip = useCallback(
    async (chip: IntentChip, grams = 0): Promise<IntentIngredientOutcome> => {
      if (chip.productId === null) return { chipId: chip.id, status: 'unresolved' };
      // The chip's own role travels with it, so the row the customer ends up looking at
      // says the same thing the chip said.
      return await addByProductId(chip.id, chip.productId, chip.role ?? 'ingredient', grams);
    },
    [addByProductId],
  );

  /**
   * A product collected by the LIVE SCANNER.
   *
   * It goes in through exactly the same door as a typed intent chip — same hydration,
   * same `addIngredient`, same crown question — because a scanned product is not a
   * different kind of ingredient. The scanner only supplies the identity; every rule
   * about what that identity may do in a recipe stays where it already lives.
   */
  const addScannedProduct = useCallback(
    async (productId: string): Promise<IntentIngredientOutcome> =>
      await addByProductId(`scan:${productId}`, productId),
    [addByProductId],
  );

  const reset = useCallback(() => {
    handled.current = new Set();
  }, []);

  return { resolveOne, addResolvedChip, addScannedProduct, reset };
}
