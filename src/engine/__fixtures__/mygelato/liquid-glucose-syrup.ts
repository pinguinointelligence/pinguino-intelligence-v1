import type { CalibrationFixture } from '../schema';

/** MyGelato calibration fixture (spec §16) — awaiting real ingredient data. */
export const liquidGlucoseSyrup: CalibrationFixture = {
  kind: 'ingredient',
  name: 'liquid-glucose-syrup',
  status: 'pending',
  notes: 'Liquid glucose syrup with expected MyGelato POD/PAC/NPAC values.',
};
