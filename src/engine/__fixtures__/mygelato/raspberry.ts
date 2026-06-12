import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real recipe data. */
export const raspberry: CalibrationFixture = {
  kind: 'recipe',
  name: 'raspberry',
  status: 'pending',
  notes: 'Known-good MyGelato raspberry recipe with expected indicator values.',
};
