import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real recipe data. */
export const chocolate: CalibrationFixture = {
  kind: 'recipe',
  name: 'chocolate',
  status: 'pending',
  notes: 'Known-good MyGelato chocolate recipe with expected indicator values.',
};
