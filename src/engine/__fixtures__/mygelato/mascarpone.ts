import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real ingredient data. */
export const mascarpone: CalibrationFixture = {
  kind: 'ingredient',
  name: 'mascarpone',
  status: 'pending',
  notes: 'Mascarpone composition with expected MyGelato values.',
};
