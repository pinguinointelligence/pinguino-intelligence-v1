/**
 * OFFLINE REPLAY of the scanner → Product Intelligence → Rescue path on REAL Mapper rows.
 *
 * Opt-in: SCAN_RESCUE_REPLAY_MAPPER=<path to a JSON dump of active mapper_basement rows with the
 * authority columns>. It runs exactly what `product-scan-finalize` runs (evidence → deterministic
 * recognition → customer family → proposal → whole-profile authority) for stored scan results and
 * writes a BEFORE/AFTER-style trace per product to reports/scan-import-v2/RESCUE_REPLAY_<label>.json.
 * The model step is not available offline; the replay records the deterministic + customer-family
 * classification, which is what staging persisted for both owner products.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadReplayRows,
  replayFixture,
  type ReplayFixture as Fixture,
} from './__dryrun__/scanRescueHarness';
import { CORPUS } from './__fixtures__/scanRescue/corpus';
import milka from './__fixtures__/scanRescue/milkaBrownie.json';
import vitaminWell from './__fixtures__/scanRescue/vitaminWell.json';

const TAG = process.env['SCAN_RESCUE_REPLAY_TAG'] ?? 'replay';
const loadRows = loadReplayRows;

interface Expectation {
  family: string;
  role: string;
  ready: boolean;
  engineUsable: boolean;
  donor: boolean;
  /** fields that must carry a value with this provenance state */
  provenance?: Partial<Record<string, 'VERIFIED' | 'ESTIMATED'>>;
}

const OWNER_EXPECTATIONS: Record<string, Expectation> = {
  'vitamin-well-sport-002': {
    family: 'beverage',
    role: 'BASE_ONLY',
    ready: true,
    engineUsable: true,
    donor: true,
    provenance: {
      water_percent: 'ESTIMATED',
      total_solids_percent: 'ESTIMATED',
      fat_percent: 'VERIFIED',
    },
  },
  'milka-choco-brownie': {
    family: 'confectionery',
    role: 'TOPPING_ONLY',
    ready: true,
    engineUsable: true,
    donor: true,
    provenance: {
      water_percent: 'ESTIMATED',
      sucrose_percent: 'ESTIMATED',
      fat_percent: 'VERIFIED',
    },
  },
};

describe('scanner rescue replay on real Mapper rows (owner products)', () => {
  const rows = loadRows();
  for (const fixture of [vitaminWell, milka] as Fixture[]) {
    it(`replays ${fixture.label} to a ready exact product with honest provenance`, () => {
      const out = replayFixture(fixture, rows);
      const dir = join(process.cwd(), 'reports', 'scan-import-v2');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `RESCUE_REPLAY_${TAG}_${fixture.label}.json`),
        JSON.stringify(out, null, 2) + '\n',
      );
      const expected = OWNER_EXPECTATIONS[fixture.label]!;
      expect(out.recognition.final.family).toBe(expected.family);
      expect(out.recognition.final.role).toBe(expected.role);
      expect(out.recognition.final.modelRequired).toBe(false);
      expect(out.mapper.donor === null).toBe(!expected.donor);
      expect(out.ready).toBe(expected.ready);
      expect(out.engineUsable).toBe(expected.engineUsable);
      for (const [field, state] of Object.entries(expected.provenance ?? {})) {
        expect(out.fieldTruth[field]?.state, field).toBe(state);
        expect(out.fieldTruth[field]?.value, field).not.toBeNull();
      }
      // declared label facts are never overwritten by a reference
      for (const field of ['fat_percent', 'protein_percent', 'carbohydrate_percent']) {
        expect(out.fieldTruth[field]?.basis).toBe('user_confirmed');
      }
    });
  }
});

describe('scanner rescue replay — broader regression corpus on real Mapper rows', () => {
  const rows = loadRows();
  const categoryOf = (id: string | null) =>
    id ? (rows.find((row) => row.ingredient_id === id)?.ingredient_category ?? null) : null;
  for (const fixture of CORPUS) {
    it(`corpus: ${fixture.label}`, () => {
      const out = replayFixture(fixture as unknown as Fixture, rows);
      const dir = join(process.cwd(), 'reports', 'scan-import-v2');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `RESCUE_REPLAY_${TAG}_${fixture.label}.json`),
        JSON.stringify(out, null, 2) + '\n',
      );
      const e = fixture.expect;
      expect(out.recognition.final.family, 'family').toBe(e.family);
      if (e.role) expect(out.recognition.final.role, 'role').toBe(e.role);
      expect(out.ready, `ready (blockers ${out.blockers.join(',')})`).toBe(e.ready);
      if (e.engineUsable !== undefined)
        expect(out.engineUsable, 'engineUsable').toBe(e.engineUsable);
      if (e.donor !== undefined) expect(out.mapper.donor !== null, 'donor').toBe(e.donor);
      if (e.forbiddenDonorCategories && out.mapper.donor) {
        const category = categoryOf(out.mapper.donor) ?? '';
        for (const forbidden of e.forbiddenDonorCategories)
          expect(category.startsWith(forbidden), `donor category ${category}`).toBe(false);
      }
      for (const blocker of e.blockers ?? []) expect(out.blockers, 'blockers').toContain(blocker);
      for (const field of e.estimatedFields ?? []) {
        expect(out.fieldTruth[field]?.state, field).toBe('ESTIMATED');
        expect(out.fieldTruth[field]?.value, field).not.toBeNull();
      }
      // a label fact is never overwritten by a reference
      for (const [field, truth] of Object.entries(out.fieldTruth)) {
        if (truth.basis === 'user_confirmed') expect(truth.state, field).toBe('VERIFIED');
      }
    });
  }
});
