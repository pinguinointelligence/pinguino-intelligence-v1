/**
 * Served staging 2026-09-18 — ONE failed build is ONE refusal.
 *
 * HOME builds the first recipe from an effect, so the same render conditions are
 * evaluated again after every state change. The effect therefore has to answer a
 * question that has nothing to do with React: *may this exact set of answers be
 * built again?*
 *
 * Before, the answer was only „did I already start this key?”, and a build that
 * could not finish cleared that memory — so the effect immediately started the
 * SAME build for the SAME answers, and the refusal it had just written was erased
 * by the next attempt before anyone could read it (measured: ~13 attempts per
 * second on the served page).
 *
 * The rule, in one place so it can be tested as behaviour rather than read as
 * code: a build starts once per set of answers; a set that FAILED is never
 * restarted on its own; the customer asking again (the CTA) or changing any
 * answer is what makes a new attempt possible.
 */

/** The answers a build was started for: profile, machine and batch. */
export type GenerationKey = string;

export interface GenerationMemory {
  /** The answers whose build has already been started (null = none yet). */
  readonly started: GenerationKey | null;
  /** The answers whose build failed and must not be restarted by a render. */
  readonly failed: GenerationKey | null;
}

export const EMPTY_GENERATION_MEMORY: GenerationMemory = { started: null, failed: null };

/**
 * May the effect start a build for these answers? Every other condition (the
 * popup, resolution, the Community answer, an official recipe opening) is the
 * effect's own business — this answers only the repetition question.
 */
export function mayGenerate(key: GenerationKey, memory: GenerationMemory): boolean {
  return memory.started !== key && memory.failed !== key;
}

/** A build has just been started for these answers. */
export function generationStarted(key: GenerationKey, memory: GenerationMemory): GenerationMemory {
  return { started: key, failed: memory.failed };
}

/**
 * The started build could not finish. The refusal stays on screen and the same
 * answers are not tried again until the customer acts — `started` is deliberately
 * NOT cleared, so nothing can read it as „never tried”.
 */
export function generationFailed(memory: GenerationMemory): GenerationMemory {
  return { started: memory.started, failed: memory.started };
}

/**
 * The customer asked again (the CTA). That is a real retry: exactly one new
 * attempt becomes possible for the answers that failed.
 */
export function generationRetried(): GenerationMemory {
  return EMPTY_GENERATION_MEMORY;
}
