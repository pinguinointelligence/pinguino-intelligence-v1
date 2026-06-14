/**
 * Step 5D.2 — REPORT-ONLY external calibration comparison for the first verified
 * reference recipe (milk base, −11 °C, 1000 g).
 *
 * This test runs `runCalibrationComparison` against the active milk-base fixture,
 * PRINTS the full comparison, and asserts only:
 *   - every reported delta is null-or-finite (never NaN/Infinity), and
 *   - the VALIDATED facts hold: the engine reproduces the reference's component
 *     split (composition gate), POD, and — under per_water_mass (now canonical) —
 *     the reference NPAC of 40.74.
 *
 * It deliberately does NOT assert within-tolerance for the intentionally
 * uncalibrated parts (the per_total_mass alternative NPAC and the −11 °C ice anchors),
 * so the suite never turns red while those config decisions remain deferred to a
 * separate, approved step. The printed numbers are the deliverable.
 */
import { describe, expect, it } from 'vitest';
import {
  runCalibrationComparison,
  type CalibrationDelta,
} from '../externalCalibrationFixtures';
import { externalReferenceMilkBase } from './milk-base';

const fmt = (value: number | null): string =>
  value === null ? '—' : value.toFixed(2);

const line = (label: string, d: CalibrationDelta): string =>
  `${label.padEnd(26)} engine=${fmt(d.engine).padStart(8)}  ref=${fmt(d.expected).padStart(8)}` +
  `  Δ=${fmt(d.delta).padStart(8)}  within±tol=${String(d.within_tolerance)}`;

/** A delta is acceptable for a report when it is either unset (null) or finite. */
const nullOrFinite = (d: CalibrationDelta): boolean =>
  d.delta === null || Number.isFinite(d.delta);

describe('external calibration report — External Reference Milk Base -11C', () => {
  const report = runCalibrationComparison(externalReferenceMilkBase);

  it('prints the full calibration comparison (report deliverable)', () => {
    const c = report.components;
    const lines = [
      '',
      `┌─ Calibration report: ${report.fixture} (tolerance ±${report.tolerance})`,
      '│  Composition gate (definitions / transcription):',
      `│  ${line('water %', c.water)}`,
      `│  ${line('total_solids %', c.total_solids)}`,
      `│  ${line('fat %', c.fat)}`,
      `│  ${line('lactose %', c.lactose)}`,
      `│  ${line('aerating_protein %', c.aerating_protein)}`,
      `│  ${line('protein_in_solids %', c.protein_in_solids)}`,
      `│  ${line('lactose_sandiness_risk', c.lactose_sandiness_risk)}`,
      `│  composition_match = ${report.composition_match}`,
      '│  Freezing power & sweetness:',
      `│  ${line('POD (per total mass)', report.pod)}`,
      `│  ${line('NPAC per_total_mass', report.npac_per_total_mass)}`,
      `│  ${line('NPAC per_water_mass', report.npac_per_water_mass)}`,
      `│  closer_npac_basis = ${report.closer_npac_basis}`,
      `│  ${line('ice (from per_total)', report.ice_fraction)}`,
      `│  ${line('ice (from per_water)', report.ice_fraction_from_per_water_mass)}`,
      '│  Cost (informational only — never blocks):',
      `│  ${line('cost_per_kg', report.cost_per_kg)}`,
      `│  ${line('cost_per_serving_80g', report.cost_per_serving_80g)}`,
      '└─',
    ];
    console.log(lines.join('\n'));
    expect(report.fixture).toBe('External Reference Milk Base -11C');
  });

  it('every reported delta is null-or-finite (report never produces NaN/Infinity)', () => {
    const all: CalibrationDelta[] = [
      report.pod,
      report.npac_per_total_mass,
      report.npac_per_water_mass,
      report.ice_fraction,
      report.ice_fraction_from_per_water_mass,
      report.cost_per_kg,
      report.cost_per_serving_80g,
      ...Object.values(report.components),
    ];
    for (const d of all) {
      expect(nullOrFinite(d)).toBe(true);
    }
  });

  it('VALIDATED: the engine reproduces the reference component split (composition gate)', () => {
    expect(report.composition_match).toBe(true);
    for (const d of Object.values(report.components)) {
      expect(d.within_tolerance).toBe(true);
    }
  });

  it('VALIDATED: POD (per total mass) matches the reference within tolerance', () => {
    expect(report.pod.within_tolerance).toBe(true);
  });

  it('FINDING: the reference normalizes NPAC per WATER mass (reproduces 40.74)', () => {
    // per_water reproduces the reference exactly; per_total is intentionally far
    // off under the current canonical config — reported, not asserted-tolerant.
    expect(report.npac_per_water_mass.within_tolerance).toBe(true);
    expect(report.closer_npac_basis).toBe('per_water_mass');
    expect(report.npac_per_total_mass.within_tolerance).toBe(false);
  });

  it('REPORT-ONLY: ice fraction is off under both bases (anchor recalibration deferred)', () => {
    // Both ice readings are finite and below the reference 50.74 — surfaced for a
    // later, separate ice-anchor calibration step; not asserted within tolerance.
    expect(Number.isFinite(report.ice_fraction.delta as number)).toBe(true);
    expect(Number.isFinite(report.ice_fraction_from_per_water_mass.delta as number)).toBe(true);
  });
});
