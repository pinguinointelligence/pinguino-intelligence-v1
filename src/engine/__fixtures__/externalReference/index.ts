/**
 * external calibration fixtures (spec §16) — the engine's real-data ground truth.
 * All fixtures start 'pending' (skipped by the calibration runner) until the
 * product owner's data is entered and verified. Activating fixtures is the only
 * authority for changing coefficients, target ranges, or the NPAC normalization
 * basis — via config changes + CONFIG_VERSION bump only.
 *
 * EXCEPTION: the verified reference recipes that are ACTIVE are exported
 * separately (see ./milk-base and ./raspberry-premium). They are kept OUT of
 * `EXTERNAL_REFERENCE_FIXTURES` so that list stays the 11 not-yet-supplied
 * placeholders; they power the report-only calibration comparisons.
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
export { externalReferenceRaspberryPremium } from './raspberry-premium';
// Auto Fix Slice 1A diagnostic reference recipes (also kept OUT of the 11
// placeholders) — clean engine-vs-reference probes from the planning history.
export { externalReferenceChocolate123 } from './chocolate-123';
export { externalReferenceRaspberry428 } from './raspberry-428';
