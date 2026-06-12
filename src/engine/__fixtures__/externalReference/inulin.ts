import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real ingredient data. */
export const inulin: CalibrationFixture = {
  kind: 'ingredient',
  name: 'inulin',
  status: 'pending',
  notes: 'Inulin composition with expected external reference POD/PAC/NPAC values.',
};
