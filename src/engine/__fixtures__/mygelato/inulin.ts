import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real ingredient data. */
export const inulin: CalibrationFixture = {
  kind: 'ingredient',
  name: 'inulin',
  status: 'pending',
  notes: 'Inulin composition with expected MyGelato POD/PAC/NPAC values.',
};
