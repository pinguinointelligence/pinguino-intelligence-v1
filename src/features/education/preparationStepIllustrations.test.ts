import { describe, expect, it } from 'vitest';
import {
  machineStepIllustrationFor,
  preparationIllustrationGaps,
  PREPARATION_ILLUSTRATIONS,
  stepIllustrationFor,
  STEP_ILLUSTRATION_BY_KIND,
} from './preparationIllustrations';

/*
 * H4-4 (Owner 18.09.2026) — „Jeżeli istnieje już zatwierdzony asset: użyj go. Jeżeli dla
 * konkretnego kroku BRAKUJE zatwierdzonej grafiki: oznacz ASSET NEEDED i kontynuuj.”
 *
 * These tests pin BOTH halves. The three machine images the owner approved are used, and
 * the four step kinds that have none report the gap instead of silently rendering
 * nothing. When an image is approved, `STEP_ILLUSTRATION_BY_KIND` names it and
 * MONITOR-free test below fails loudly — which is the point: the gap list is a fact about
 * the product, not a comment.
 */
describe('PREP-ILLUSTRATION — approved images are used, missing ones are named', () => {
  it('PREP-ILLU-01 the machine step uses each approved Ninja image', () => {
    expect(machineStepIllustrationFor('ninja-creami-nc302eu-eu-es')).toBe(
      PREPARATION_ILLUSTRATIONS['IMG-FREEZE-NINJA-NC3'],
    );
    expect(machineStepIllustrationFor('ninja-creami-deluxe-nc502eu-eu-es')).toBe(
      PREPARATION_ILLUSTRATIONS['IMG-FREEZE-NINJA-NC5'],
    );
    expect(machineStepIllustrationFor('ninja-creami-scoop-swirl-nc7-eu-es')).toBe(
      PREPARATION_ILLUSTRATIONS['IMG-FREEZE-NINJA-NC7'],
    );
  });

  it('PREP-ILLU-02 a machine with no approved image gets none — never another machine’s', () => {
    expect(machineStepIllustrationFor('moulinex-freezi-mj803af0-es')).toBeNull();
    expect(machineStepIllustrationFor(null)).toBeNull();
  });

  it('PREP-ILLU-03 weighing, heating, cooling and topping are the open ASSET NEEDED list', () => {
    expect(preparationIllustrationGaps()).toEqual(['weigh', 'heat', 'cool', 'addon']);
    for (const kind of preparationIllustrationGaps()) {
      expect(stepIllustrationFor(kind)).toEqual({
        illustration: null,
        illustrationStatus: 'asset_needed',
      });
    }
  });

  it('PREP-ILLU-04 a registered step image would be used, with no other code change', () => {
    // The lookup is the whole mechanism: name a code here and the step renders it.
    const registered = Object.entries(STEP_ILLUSTRATION_BY_KIND);
    for (const [kind, code] of registered) {
      expect(PREPARATION_ILLUSTRATIONS[code]).toBeDefined();
      expect(stepIllustrationFor(kind as 'weigh')).toEqual({
        illustration: PREPARATION_ILLUSTRATIONS[code],
        illustrationStatus: 'registered',
      });
    }
    // Today there are none — the assertion above is the contract for when there are.
    expect(registered).toEqual([]);
  });

  it('PREP-ILLU-05 every approved image carries its verification data', () => {
    for (const illustration of Object.values(PREPARATION_ILLUSTRATIONS)) {
      expect(illustration.source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(illustration.outputs).toHaveLength(2);
      for (const output of illustration.outputs) {
        expect(output.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(output.bytes).toBeGreaterThan(0);
      }
    }
  });
});
