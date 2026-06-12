import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real ingredient data. */
export const mascarpone: CalibrationFixture = {
  kind: 'ingredient',
  name: 'mascarpone',
  status: 'pending',
  notes: 'Mascarpone composition with external reference expected values.',
};
