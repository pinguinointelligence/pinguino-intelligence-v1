import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real recipe data. */
export const apple: CalibrationFixture = {
  kind: 'recipe',
  name: 'apple',
  status: 'pending',
  notes: 'Known-good MyGelato apple recipe with expected indicator values.',
};
