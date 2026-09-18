/**
 * HOME-GEN-LOOP — the served regression of 2026-09-18, as behaviour.
 *
 * The page evaluates the generate effect after every state change, so these tests
 * drive the rule the way React does: many renders around a small number of real
 * events. What is asserted is how many BUILDS those renders start.
 */
import { describe, expect, it } from 'vitest';

import {
  EMPTY_GENERATION_MEMORY,
  type GenerationMemory,
  generationFailed,
  generationRetried,
  generationStarted,
  mayGenerate,
} from './homeGenerationGate';

/**
 * A stand-in for HOME's effect: `renders` times it asks whether it may build,
 * and starts a build when the answer is yes. Returns how many builds it started.
 */
const renderLoop = (
  key: string,
  memory: GenerationMemory,
  renders: number,
): { builds: number; memory: GenerationMemory } => {
  let builds = 0;
  let next = memory;
  for (let i = 0; i < renders; i += 1) {
    if (mayGenerate(key, next)) {
      builds += 1;
      next = generationStarted(key, next);
    }
  }
  return { builds, memory: next };
};

describe('HOME-GEN-LOOP — one set of answers, one build', () => {
  it('HOME-GEN-LOOP-01: twenty renders start exactly one build', () => {
    const { builds } = renderLoop('sorbet|ninja|1000', EMPTY_GENERATION_MEMORY, 20);
    expect(builds).toBe(1);
  });

  it('HOME-GEN-LOOP-02: after a failure no number of renders starts another build', () => {
    const first = renderLoop('sorbet|ninja|1000', EMPTY_GENERATION_MEMORY, 1);
    expect(first.builds).toBe(1);
    const refused = generationFailed(first.memory);

    // This is the served defect: the refusal was written, then erased by the next
    // attempt, ~13 times a second. A hundred renders must now change nothing.
    const after = renderLoop('sorbet|ninja|1000', refused, 100);
    expect(after.builds).toBe(0);
  });

  it('HOME-GEN-LOOP-03: the CTA is a real retry — exactly one new build', () => {
    const first = renderLoop('sorbet|ninja|1000', EMPTY_GENERATION_MEMORY, 5);
    const refused = generationFailed(first.memory);

    const asked = generationRetried();
    const retry = renderLoop('sorbet|ninja|1000', asked, 30);
    expect(retry.builds).toBe(1);
  });

  it('HOME-GEN-LOOP-04: a retry that fails again refuses again, and stays refused', () => {
    const first = renderLoop('sorbet|ninja|1000', EMPTY_GENERATION_MEMORY, 3);
    const refusedOnce = generationFailed(first.memory);
    const retry = renderLoop('sorbet|ninja|1000', generationRetried(), 3);
    expect(retry.builds).toBe(1);
    const refusedTwice = generationFailed(retry.memory);

    expect(renderLoop('sorbet|ninja|1000', refusedTwice, 50).builds).toBe(0);
    // …and the customer can still ask again.
    expect(renderLoop('sorbet|ninja|1000', generationRetried(), 1).builds).toBe(1);
    expect(refusedOnce.failed).toBe('sorbet|ninja|1000');
  });

  it('HOME-GEN-LOOP-05: changing a real answer is a new question — one build', () => {
    const first = renderLoop('sorbet|ninja|1000', EMPTY_GENERATION_MEMORY, 4);
    const refused = generationFailed(first.memory);

    // The customer answers „Gelato” instead. Different answers, different key.
    const gelato = renderLoop('gelato|ninja|1000', refused, 40);
    expect(gelato.builds).toBe(1);

    // And the sorbet answer they walked away from is still refused, not retried.
    expect(renderLoop('sorbet|ninja|1000', gelato.memory, 40).builds).toBe(0);
  });

  it('HOME-GEN-LOOP-06: a failure never reads as „never tried”', () => {
    const first = renderLoop('sorbet|ninja|1000', EMPTY_GENERATION_MEMORY, 1);
    const refused = generationFailed(first.memory);
    // `started` stays, so nothing downstream can mistake a failed build for an
    // untouched one — that mistake is exactly what produced the loop.
    expect(refused.started).toBe('sorbet|ninja|1000');
    expect(mayGenerate('sorbet|ninja|1000', refused)).toBe(false);
  });
});
