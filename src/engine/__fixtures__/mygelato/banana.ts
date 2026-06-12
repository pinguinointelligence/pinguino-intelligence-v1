import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real recipe data. */
export const banana: CalibrationFixture = {
  kind: 'recipe',
  name: 'banana',
  status: 'pending',
  notes: 'Known-good MyGelato banana recipe with expected indicator values.',
};
