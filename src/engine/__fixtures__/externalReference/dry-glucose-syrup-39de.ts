import type { CalibrationFixture } from '../schema';

/** external calibration fixture (spec §16) — awaiting real ingredient data.
 * Activating this fixture validates/corrects the 39 DE syrup anchor in
 * config/coefficients.ts (SYRUP_DE_ANCHORS). */
export const dryGlucoseSyrup39De: CalibrationFixture = {
  kind: 'ingredient',
  name: 'dry-glucose-syrup-39de',
  status: 'pending',
  notes: 'Dry glucose syrup 39 DE with expected external reference POD/PAC/NPAC values.',
};
