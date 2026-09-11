/**
 * §30–§31 — AI Vision v1: FRUIT, and only fruit.
 *
 * The recognition itself is real and already exists: `product-identify-live` is
 * the cheap identification boundary (`identifyLiveFrame`), which asks one small
 * question — "what is this?" — and then lets the CATALOGUE, never the model,
 * decide whether the answer is a Gellatti product. Nothing here invents a
 * product, a nutrient or an id.
 *
 * This module is the pure decision on top of that answer, so the camera screen
 * holds no policy and the policy can be tested without a camera:
 *
 *   1. it has to BE fruit — `kind: 'FRESH_PRODUCE'` is the recogniser's own word
 *      for unpackaged food with no label to read (a photographed package is a
 *      job for the barcode scanner, not for this button);
 *   2. the CATALOGUE has to have named it — `resolution` is filled in
 *      server-side from the catalogue or left null, so a model that says
 *      "mango" about a lemon still cannot put mango into a recipe;
 *   3. and the recogniser has to have been sure.
 *
 * When any of the three fails the answer is one honest sentence, never a
 * candidate table and never a guess (§31).
 */
import type { LiveIdentifyResponse } from '@/services/productScanner';

/**
 * Client-side floor, deliberately conservative and deliberately SECONDARY: the
 * load-bearing gate is the catalogue resolution above it, which is the
 * project's existing "catalogue decides" authority. This number only keeps a
 * catalogue-resolvable name from being accepted on a glance the recogniser
 * itself was unsure about. Owner may tune it once served runs exist.
 */
export const HOME_VISION_MIN_CONFIDENCE = 0.7;

export type HomeVisionOutcome =
  | { readonly kind: 'recognised'; readonly names: readonly string[] }
  | { readonly kind: 'unsure' };

/** True when this one answer is a fruit the catalogue can name with confidence. */
export function isConfidentFruit(answer: LiveIdentifyResponse | null): boolean {
  if (!answer) return false;
  if (answer.kind !== 'FRESH_PRODUCE') return false;
  if (answer.resolution === null) return false;
  return answer.confidence >= HOME_VISION_MIN_CONFIDENCE;
}

/**
 * Turn what came back into chips, or into a refusal.
 *
 * Takes a LIST because §31 allows several fruits from one photograph to become
 * several chips. Today `identifyLiveFrame` answers with one identity per frame,
 * so the list normally has one element — the shape is here so that a
 * multi-fruit recogniser needs no new decision layer, not to pretend one exists.
 */
export function decideVisionOutcome(
  answers: readonly (LiveIdentifyResponse | null)[],
): HomeVisionOutcome {
  const names = answers
    .filter(isConfidentFruit)
    // The catalogue's own name, not the model's. It is the name that will
    // resolve back to the same product when the idea becomes a recipe.
    .map((answer) => answer!.resolution!.displayName.trim())
    .filter((name) => name.length > 0);

  const unique = [...new Set(names)];
  return unique.length > 0 ? { kind: 'recognised', names: unique } : { kind: 'unsure' };
}
