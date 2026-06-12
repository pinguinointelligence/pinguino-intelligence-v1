import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real recipe data. */
export const raspberry: CalibrationFixture = {
  kind: 'recipe',
  name: 'raspberry',
  status: 'pending',
  notes: 'Known-good external reference raspberry recipe with expected indicator values.',
};
