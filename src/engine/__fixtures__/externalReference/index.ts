/**
 * external calibration fixtures (spec §16) — the engine's real-data ground truth.
 * All fixtures start 'pending' (skipped by the calibration runner) until the
 * product owner's data is entered and verified. Activating fixtures is the only
 * authority for changing coefficients, target ranges, or the NPAC normalization
 * basis — via config changes + CONFIG_VERSION bump only.
 *
 * EXCEPTION: the first verified reference recipe is ACTIVE and exported
 * separately as `externalReferenceMilkBase` (see ./milk-base). It is kept OUT of
 * `EXTERNAL_REFERENCE_FIXTURES` so that list stays the 11 not-yet-supplied
 * placeholders; it powers the report-only calibration comparison.
 */
import type { CalibrationFixture } from '../schema';
import { alcoholJimBeam } from './alcohol-jim-beam';
import { apple } from './apple';
import { banana } from './banana';
import { chocolate } from './chocolate';
import { dryGlucoseSyrup39De } from './dry-glucose-syrup-39de';
import { honey } from './honey';
import { inulin } from './inulin';
import { liquidGlucoseSyrup } from './liquid-glucose-syrup';
import { mascarpone } from './mascarpone';
import { pistachioPaste } from './pistachio-paste';
import { raspberry } from './raspberry';

export const EXTERNAL_REFERENCE_FIXTURES: readonly CalibrationFixture[] = [
  chocolate,
  raspberry,
  apple,
  banana,
  honey,
  dryGlucoseSyrup39De,
  liquidGlucoseSyrup,
  inulin,
  alcoholJimBeam,
  mascarpone,
  pistachioPaste,
];

export { externalReferenceMilkBase } from './milk-base';
