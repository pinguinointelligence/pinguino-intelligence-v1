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
    async (key: string, productId: string): Promise<IntentIngredientOutcome> => {
      if (handled.current.has(key)) return { chipId: key, status: 'duplicate' };
      handled.current.add(key);

      const ingredient = await hydrateIngredient(productId);
      if (ingredient === null) return { chipId: key, status: 'unresolved' };

      const store = useRecipeStore.getState();
      const added = store.addIngredient(ingredient, 0);
      if (added.status === 'duplicate') return { chipId: key, status: 'duplicate' };

      // §49: ASK the existing authority. It refuses an ineligible product on its own.
      useRecipeStore.getState().setMainIngredient(added.lineId);
      const line = useRecipeStore.getState().items.find((item) => item.id === added.lineId);
      if (line?.lock_type === 'main') return { chipId: key, status: 'crowned' };
      return {
        chipId: key,
        status: line && line.planned_grams > 0 ? 'added' : 'needs_amount',
      };
    },
    [],
  );

  const addResolvedChip = useCallback(
    async (chip: IntentChip): Promise<IntentIngredientOutcome> => {
      if (chip.productId === null) return { chipId: chip.id, status: 'unresolved' };
      return await addByProductId(chip.id, chip.productId);
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
