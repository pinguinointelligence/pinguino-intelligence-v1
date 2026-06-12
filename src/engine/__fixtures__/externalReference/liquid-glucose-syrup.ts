import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real ingredient data. */
export const liquidGlucoseSyrup: CalibrationFixture = {
  kind: 'ingredient',
  name: 'liquid-glucose-syrup',
  status: 'pending',
  notes: 'Liquid glucose syrup with expected external reference POD/PAC/NPAC values.',
};
