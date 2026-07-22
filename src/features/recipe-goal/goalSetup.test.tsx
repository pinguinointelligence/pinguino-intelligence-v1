/**
 * Pro serving-temperature pins — AUDIT #5 (P0) + SPEC §11.1/§11.2, owner
 * decision 2026-07-17 (Slice C): the Studio serving choice is EXACTLY
 * −11 / −12 / −13. −14 (unapproved cell) and −18 (a STORAGE temperature) were
 * removed from the serving choice; −13 (a real, approved cell) was added.
 *
 * Repo test pattern: no DOM environment (vitest `environment: 'node'`), so the
 * component state is asserted via renderToStaticMarkup and the option set via
 * the exported constant the UI renders from.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TARGET_BANDS } from '@/engine';
import { STORAGE_PROFILES } from '@/data/servingProfiles';
import { GoalSetup } from './GoalSetup';
import { SERVING_TEMPERATURES_C } from './servingTemperatures';

const MINUS = '−'; // typographic minus (U+2212)

describe('Studio serving-temperature choice (AUDIT #5 / SPEC §11.1)', () => {
  it('offers exactly −11 / −12 / −13 — no −14, no −18', () => {
    expect([...SERVING_TEMPERATURES_C]).toEqual([-11, -12, -13]);
  });

  it('every offered temperature is a REAL engine cell (exact TARGET_BANDS row, no nearest-match reliance)', () => {
    const cellTemps = new Set(TARGET_BANDS.map((band) => band.temperature_c));
    for (const temperature of SERVING_TEMPERATURES_C) {
      expect(cellTemps.has(temperature), `${temperature}°C must be a real cell`).toBe(true);
    }
    // Documents why −14/−18 were removed: the LOCKED config has no such cells.
    expect(cellTemps.has(-14)).toBe(false);
    expect(cellTemps.has(-18)).toBe(false);
  });

  it('renders the canonical serving modes (Świeże + −11/−12/−13, U+2212) and no −14/−18', () => {
    const html = renderToStaticMarkup(<GoalSetup />);
    // Owner P0 canonical workbench: the serving control is Świeże + −11°C/−12°C/−13°C, one shared
    // state (data-testid serving-<id>), NOT the legacy bare temperature segmented control.
    expect(html).toContain('data-testid="serving-fresh"');
    for (const id of ['fresh', 'temp_minus_11', 'temp_minus_12', 'temp_minus_13']) {
      expect(html).toContain(`data-testid="serving-${id}"`);
    }
    for (const temperature of SERVING_TEMPERATURES_C) {
      expect(html).toContain(`${MINUS}${Math.abs(temperature)}°C`);
    }
    // No storage/unapproved temperatures in either glyph form.
    for (const forbidden of [`${MINUS}14`, `${MINUS}18`, '-14', '-18']) {
      expect(html, `must not offer ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('storage temperatures are never selectable as serving (SPEC §11.2 concept split)', () => {
    const offered = new Set<number>(SERVING_TEMPERATURES_C);
    for (const storage of STORAGE_PROFILES) {
      expect(offered.has(storage.displayTempC), `${storage.id} must not be a serving option`).toBe(
        false,
      );
    }
  });
});
