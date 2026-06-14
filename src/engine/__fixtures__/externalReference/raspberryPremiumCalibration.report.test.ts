/**
 * Step 5D.3 — REPORT-ONLY external calibration comparison for the second verified
 * reference recipe (raspberry premium, fruit_gelato, −11 °C, 1000 g).
 *
 * This runs `runCalibrationComparison` against the active raspberry-premium
 * fixture, PRINTS the full comparison, and asserts:
 *   - every reported delta is null-or-finite (never NaN/Infinity);
 *   - the VALIDATED facts hold: water/total_solids/fat/lactose/sandiness, POD, and
 *     — under per_water_mass (now canonical) — the reference NPAC of 41.15, which
 *     CONFIRMS the milk-base finding on a structurally different fruit recipe;
 *   - the DOCUMENTED GAP: the engine's aerating_protein / protein_in_solids
 *     OVERSTATE vs the reference because the reference counts dairy/aerating
 *     protein only (excludes fruit protein). This is a separate, deferred engine
 *     refinement — surfaced here, not fixed.
 *
 * It does NOT assert within-tolerance for the intentionally uncalibrated parts
 * (the per_total_mass alternative NPAC; the −11 °C ice anchors, which here also use the
 * documented fruit_gelato→milk_gelato fallback), so the suite never turns red
 * while those config decisions remain deferred. The printed numbers are the deliverable.
 */
import { describe, expect, it } from 'vitest';
import {
  runCalibrationComparison,
  type CalibrationDelta,
} from '../externalCalibrationFixtures';
import { externalReferenceRaspberryPremium } from './raspberry-premium';

const fmt = (value: number | null): string =>
  value === null ? '—' : value.toFixed(2);

const line = (label: string, d: CalibrationDelta): string =>
  `${label.padEnd(26)} engine=${fmt(d.engine).padStart(8)}  ref=${fmt(d.expected).padStart(8)}` +
  `  Δ=${fmt(d.delta).padStart(8)}  within±tol=${String(d.within_tolerance)}`;

const nullOrFinite = (d: CalibrationDelta): boolean =>
  d.delta === null || Number.isFinite(d.delta);

describe('external calibration report — External Reference Raspberry Premium -11C', () => {
  const report = runCalibrationComparison(externalReferenceRaspberryPremium);

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
      `│  ${line('aerating_protein %', c.aerating_protein)}   ← engine counts ALL protein`,
      `│  ${line('protein_in_solids %', c.protein_in_solids)}   ← reference is dairy-only`,
      `│  ${line('lactose_sandiness_risk', c.lactose_sandiness_risk)}`,
      `│  composition_match (incl. protein) = ${report.composition_match}`,
      '│  Freezing power & sweetness:',
      `│  ${line('POD (per total mass)', report.pod)}`,
      `│  ${line('NPAC per_total_mass', report.npac_per_total_mass)}`,
      `│  ${line('NPAC per_water_mass', report.npac_per_water_mass)}`,
      `│  closer_npac_basis = ${report.closer_npac_basis}   ← confirms milk-base finding`,
      `│  ${line('ice (from per_total)', report.ice_fraction)}`,
      `│  ${line('ice (from per_water)', report.ice_fraction_from_per_water_mass)}`,
      '│  (ice uses the fruit_gelato→milk_gelato anchor fallback — doubly uncalibrated)',
      '│  Cost (informational only — never blocks):',
      `│  ${line('cost_per_kg', report.cost_per_kg)}`,
      `│  ${line('cost_per_serving_80g', report.cost_per_serving_80g)}`,
      '└─',
    ];
    console.log(lines.join('\n'));
    expect(report.fixture).toBe('External Reference Raspberry Premium -11C');
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

  it('VALIDATED: non-protein composition matches the reference (water/solids/fat/lactose/sandiness)', () => {
    const c = report.components;
    expect(c.water.within_tolerance).toBe(true);
    expect(c.total_solids.within_tolerance).toBe(true);
    expect(c.fat.within_tolerance).toBe(true);
    expect(c.lactose.within_tolerance).toBe(true);
    expect(c.lactose_sandiness_risk.within_tolerance).toBe(true);
  });

  it('VALIDATED: POD (per total mass) matches the reference within tolerance', () => {
    expect(report.pod.within_tolerance).toBe(true);
  });

  it('CONFIRMS milk base: NPAC reproduces the reference under per_water_mass (41.15)', () => {
    expect(report.npac_per_water_mass.within_tolerance).toBe(true);
    expect(report.closer_npac_basis).toBe('per_water_mass');
    expect(report.npac_per_total_mass.within_tolerance).toBe(false);
  });

  it('DOCUMENTED GAP: engine aerating_protein / protein_in_solids overstate (counts fruit protein)', () => {
    // The reference counts dairy/aerating protein only; the engine includes the
    // raspberry protein, so both run high. Surfaced for a separate engine refinement.
    expect(report.components.aerating_protein.within_tolerance).toBe(false);
    expect(report.components.protein_in_solids.within_tolerance).toBe(false);
    expect((report.components.aerating_protein.delta as number) > 0).toBe(true);
    expect((report.components.protein_in_solids.delta as number) > 0).toBe(true);
  });

  it('REPORT-ONLY: ice fraction is off under both bases (anchor + fruit fallback deferred)', () => {
    expect(Number.isFinite(report.ice_fraction.delta as number)).toBe(true);
    expect(Number.isFinite(report.ice_fraction_from_per_water_mass.delta as number)).toBe(true);
  });
});
