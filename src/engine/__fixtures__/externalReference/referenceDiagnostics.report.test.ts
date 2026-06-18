/**
 * Auto Fix Slice 1A — DIAGNOSTIC engine-vs-reference report for the two recipes
 * recovered from the planning history: Chocolate #123 and ultra-fruit
 * Raspberry-428.
 *
 * Mirrors the established milk-base / raspberry-premium calibration reports:
 * runs `runCalibrationComparison`, PRINTS the full delta, and asserts only what
 * is safe. It NEVER tunes the engine to match (Slice 1A rule) — a mismatch is a
 * printed calibration finding, not a failure.
 *
 * TEMPERATURE SCOPE — −11 °C ONLY. Both fixtures, and every influence value
 * recovered from the planning history, were measured on the −11 °C serving
 * setting. These diagnostics therefore validate the engine at −11 °C only; they
 * do NOT cover −10 / −12 / −13 °C or any future temperature profile, which will
 * need their own recovered reference fixtures and tests.
 *
 * Per the approved Slice 1A tolerances:
 *   - POD / NPAC: ±0.5 absolute (NPAC on the canonical per_water_mass basis);
 *   - composition %: ±1.0 percentage point (re-derived here, not the runner's 0.5);
 *   - ice fraction: report-delta-first — only a loose <15 pp sanity rail, never a
 *     within-tolerance assertion (anchor recalibration is a separate, deferred step).
 *
 * Promotion rule (two-step, done in this same change after reading a first run):
 *   a field is HARD-asserted only where the printed delta confirmed it in-band.
 *   The findings below record exactly which fields were promoted vs left
 *   report-only and WHY.
 */
import { describe, expect, it } from 'vitest';
import {
  type CalibrationComparison,
  type CalibrationDelta,
  runCalibrationComparison,
} from '../externalCalibrationFixtures';
import { externalReferenceChocolate123 } from './chocolate-123';
import { externalReferenceRaspberry428 } from './raspberry-428';

const fmt = (value: number | null): string => (value === null ? '—' : value.toFixed(2));

const line = (label: string, d: CalibrationDelta): string =>
  `${label.padEnd(26)} engine=${fmt(d.engine).padStart(8)}  ref=${fmt(d.expected).padStart(8)}` +
  `  Δ=${fmt(d.delta).padStart(8)}  within±tol=${String(d.within_tolerance)}`;

/** A delta is acceptable for a report when it is either unset (null) or finite. */
const nullOrFinite = (d: CalibrationDelta): boolean =>
  d.delta === null || Number.isFinite(d.delta);

/** Composition tolerance is the looser ±1.0 pp (POD/NPAC use the runner's 0.5). */
const COMPOSITION_TOLERANCE_PP = 1.0;
const withinComposition = (d: CalibrationDelta): boolean =>
  d.delta !== null && Math.abs(d.delta) <= COMPOSITION_TOLERANCE_PP;

const allDeltas = (report: CalibrationComparison): CalibrationDelta[] => [
  report.pod,
  report.npac_per_total_mass,
  report.npac_per_water_mass,
  report.ice_fraction,
  report.ice_fraction_from_per_water_mass,
  report.cost_per_kg,
  report.cost_per_serving_80g,
  ...Object.values(report.components),
];

const printReport = (report: CalibrationComparison): void => {
  const c = report.components;
  console.log(
    [
      '',
      `┌─ Auto Fix 1A diagnostic: ${report.fixture} (POD/NPAC ±${report.tolerance}, composition ±${COMPOSITION_TOLERANCE_PP} pp)`,
      '│  Composition gate (definitions / transcription):',
      `│  ${line('water %', c.water)}`,
      `│  ${line('total_solids %', c.total_solids)}`,
      `│  ${line('fat %', c.fat)}`,
      `│  ${line('lactose %', c.lactose)}`,
      `│  ${line('aerating_protein %', c.aerating_protein)}`,
      `│  ${line('protein_in_solids %', c.protein_in_solids)}`,
      `│  ${line('lactose_sandiness_risk', c.lactose_sandiness_risk)}`,
      '│  Freezing power & sweetness:',
      `│  ${line('POD (per total mass)', report.pod)}`,
      `│  ${line('NPAC per_total_mass', report.npac_per_total_mass)}`,
      `│  ${line('NPAC per_water_mass', report.npac_per_water_mass)}`,
      `│  closer_npac_basis = ${report.closer_npac_basis}`,
      `│  ${line('ice (from per_total)', report.ice_fraction)}`,
      `│  ${line('ice (from per_water)', report.ice_fraction_from_per_water_mass)}`,
      '│  Cost (informational only — fixture ingredient costs are null):',
      `│  ${line('cost_per_kg', report.cost_per_kg)}`,
      `│  ${line('cost_per_serving_80g', report.cost_per_serving_80g)}`,
      '└─',
    ].join('\n'),
  );
};

describe('Auto Fix 1A diagnostic — Chocolate #123 (clean engine-vs-reference probe)', () => {
  const report = runCalibrationComparison(externalReferenceChocolate123);

  it('prints the full delta (report deliverable)', () => {
    printReport(report);
    expect(report.fixture).toBe('External Reference Chocolate #123 -11C');
  });

  it('every reported delta is null-or-finite (never NaN/Infinity)', () => {
    for (const d of allDeltas(report)) expect(nullOrFinite(d)).toBe(true);
  });

  it('grams sum to ~1000 g (verbatim 999.97 g, not renormalized)', () => {
    const total = externalReferenceChocolate123.input.reduce((s, l) => s + l.grams, 0);
    expect(total).toBeCloseTo(1000, 0);
  });

  // ── PROMOTED (printed deltas confirmed in-band — see report output) ──────────
  it('VALIDATED: water / total_solids / fat / lactose reproduce the reference (±1.0 pp)', () => {
    expect(withinComposition(report.components.water)).toBe(true);
    expect(withinComposition(report.components.total_solids)).toBe(true);
    expect(withinComposition(report.components.fat)).toBe(true);
    expect(withinComposition(report.components.lactose)).toBe(true);
  });

  it('VALIDATED: POD matches the reference within ±0.5', () => {
    expect(report.pod.within_tolerance).toBe(true);
  });

  it('VALIDATED: NPAC reproduces the reference on the per_water_mass basis (±0.5)', () => {
    expect(report.npac_per_water_mass.within_tolerance).toBe(true);
  });

  // ── REPORT-ONLY findings (documented, never "fixed") ─────────────────────────
  it('FINDING: aerating_protein / protein_in_solids run high — engine counts cocoa protein', () => {
    // The reference's "aerating protein" excludes cocoa protein (dairy-only =
    // 3.80 % / 10.40 % exactly); the engine sums ALL protein incl. the chocolate's
    // 8.1 %. Surfaced as a definition question, not an engine error. Report-only.
    expect(Number.isFinite(report.components.aerating_protein.delta as number)).toBe(true);
    expect(Number.isFinite(report.components.protein_in_solids.delta as number)).toBe(true);
  });

  it('REPORT-ONLY: ice fraction delta is finite and within a loose sanity rail', () => {
    // Ice anchors are intentionally uncalibrated (same stance as milk base);
    // report the delta, do not assert within-tolerance. The 15 pp rail only
    // catches a gross regression — it is NOT a calibration target.
    const iceDelta = report.ice_fraction_from_per_water_mass.delta;
    expect(iceDelta === null || Number.isFinite(iceDelta)).toBe(true);
    if (iceDelta !== null) expect(Math.abs(iceDelta)).toBeLessThan(15);
  });
});

describe('Auto Fix 1A diagnostic — Raspberry-428 (ultra-fruit)', () => {
  const report = runCalibrationComparison(externalReferenceRaspberry428);

  it('prints the full delta (report deliverable)', () => {
    printReport(report);
    expect(report.fixture).toBe('External Reference Ultra-Fruit Raspberry-428 -11C');
  });

  it('every reported delta is null-or-finite (never NaN/Infinity)', () => {
    for (const d of allDeltas(report)) expect(nullOrFinite(d)).toBe(true);
  });

  it('grams sum to ~1002 g (verbatim, raspberries 42.71 %, not renormalized)', () => {
    const total = externalReferenceRaspberry428.input.reduce((s, l) => s + l.grams, 0);
    expect(total).toBeCloseTo(1002, 0);
  });

  // ── PROMOTED — the engine reproduces the recovered external-reference RESULT
  // exactly (POD/NPAC to 2 dp, composition to 2 dp). Provenance caveat: the
  // external tool's per-100 g raspberry card is NOT in the history (only the
  // loose "≈85 % water, ≈5 % sugars"), so the raspberry line uses the repo's
  // already-verified RASPBERRIES profile (the same one the raspberry-premium
  // active fixture uses). The exact reproduction below is itself the evidence
  // that this profile matches the external tool for this recipe. ──────────────
  it('VALIDATED: water / total_solids / fat / lactose reproduce the reference (±1.0 pp)', () => {
    expect(withinComposition(report.components.water)).toBe(true);
    expect(withinComposition(report.components.total_solids)).toBe(true);
    expect(withinComposition(report.components.fat)).toBe(true);
    expect(withinComposition(report.components.lactose)).toBe(true);
  });

  it('VALIDATED: POD matches the reference within ±0.5', () => {
    expect(report.pod.within_tolerance).toBe(true);
  });

  it('VALIDATED: NPAC reproduces the reference on the per_water_mass basis (±0.5)', () => {
    expect(report.npac_per_water_mass.within_tolerance).toBe(true);
  });

  // ── REPORT-ONLY findings (documented, never "fixed") ─────────────────────────
  it('FINDING: aerating_protein runs slightly high (protein-DNA delta)', () => {
    // ~+0.56 pp; no cocoa here — the small delta is a raspberry/SMP protein-DNA
    // difference. Reported, not asserted within tolerance.
    expect(Number.isFinite(report.components.aerating_protein.delta as number)).toBe(true);
  });

  it('REPORT-ONLY: ice fraction diverges (anchors deferred + ultra-fruit profile)', () => {
    // Ultra-fruit ice sits well outside the deferred milk-anchor model
    // (≈ −11.8 pp); report the delta, never assert within-tolerance. No sanity
    // rail here — a large ultra-fruit ice delta is expected, not a regression.
    const iceDelta = report.ice_fraction_from_per_water_mass.delta;
    expect(iceDelta === null || Number.isFinite(iceDelta)).toBe(true);
  });
});
