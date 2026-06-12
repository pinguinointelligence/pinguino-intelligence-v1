import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real recipe data. */
export const chocolate: CalibrationFixture = {
  kind: 'recipe',
  name: 'chocolate',
  status: 'pending',
  notes: 'Known-good external reference chocolate recipe with expected indicator values.',
};
