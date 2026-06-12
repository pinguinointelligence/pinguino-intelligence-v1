import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real ingredient data.
 * Jim Beam 40 %: 100 g of ingredient contains 40 g alcohol (spec §5).
 * Activating this fixture validates the alcohol NPAC coefficient. */
export const alcoholJimBeam: CalibrationFixture = {
  kind: 'ingredient',
  name: 'alcohol-jim-beam',
  status: 'pending',
  notes: 'Jim Beam 40 % vol with expected external reference NPAC/freezing values.',
};
