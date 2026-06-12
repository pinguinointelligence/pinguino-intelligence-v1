import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real ingredient data. */
export const honey: CalibrationFixture = {
  kind: 'ingredient',
  name: 'honey',
  status: 'pending',
  notes: 'Honey composition with expected MyGelato POD/PAC/NPAC values.',
};
