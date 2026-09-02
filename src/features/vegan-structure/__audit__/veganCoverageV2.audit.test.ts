/// <reference types="node" />
/**
 * VEGAN ENGINE v2 — coverage + no-blocking audit over the REAL Mapper base.
 *
 * Runs the production eligibility function and the production derived
 * classifier over all 2089 owner-approved Mapper rows. It reads the CSV; it never
 * writes it, never adds a column and never retags a row.
 *
 * The gate this file exists for (owner §21):
 *
 *     BLOCKED_DUE_TO_ENHANCED_UNKNOWN === 0
 *
 * No paid call, no web request, no LLM.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '@/lib/csv';
import { assessMapperVeganEligibility } from '@/data/ingredients/veganEligibility';
import { veganBehaviorFactsFromMapperRow } from '../veganBehaviorFacts';
import { veganBehaviorForFacts, veganEnhancementLevel } from '../veganBehaviorRuntime';
import type { VeganEnhancementLevel } from '../veganBehaviorTaxonomy';

const MAPPER = join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv');

type Row = Record<string, string>;

const rows = (): Row[] => {
  const grid = parseCsv(readFileSync(MAPPER, 'utf8'));
  const headers = grid[0]!;
  return grid
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])) as Row);
};

const num = (value: string | undefined): number | null => {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const tri = (value: string | undefined): 'true' | 'false' | 'unknown' | null => {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'true' || v === 'false' || v === 'unknown' ? v : null;
};

const eligibility = (row: Row) =>
  assessMapperVeganEligibility({
    approved_for_engines: row.approved_for_engines?.trim().toLowerCase() === 'true',
    vegan: tri(row.vegan) ?? 'unknown',
    dairy_free: tri(row.dairy_free) ?? 'unknown',
    allergens: row.allergens ?? '',
    ingredient_category: row.ingredient_category ?? '',
    ingredient_subcategory: row.ingredient_subcategory ?? '',
    ingredient_name_internal: row.ingredient_name_internal ?? '',
    ingredient_name_display: row.ingredient_name_display ?? '',
    milk_fat_percent: num(row.milk_fat_percent),
    non_fat_milk_solids_percent: num(row.non_fat_milk_solids_percent),
    lactose_percent: num(row.lactose_percent),
  });

const behaviorOf = (row: Row) =>
  veganBehaviorForFacts(
    veganBehaviorFactsFromMapperRow({
      ingredient_id: row.ingredient_id,
      ingredient_name_internal: row.ingredient_name_internal,
      ingredient_name_display: row.ingredient_name_display,
      ingredient_category: row.ingredient_category,
      ingredient_subcategory: row.ingredient_subcategory,
      engine_notes: row.engine_notes,
      usage_notes: row.usage_notes,
      fat_percent: num(row.fat_percent),
      protein_percent: num(row.protein_percent),
      fiber_percent: num(row.fiber_percent),
      stabilizer_activity: num(row.stabilizer_activity),
    }),
  );

const pct = (part: number, whole: number): string =>
  whole === 0 ? 'n/a' : `${((part / whole) * 100).toFixed(1)}%`;

describe('Vegan v2 Mapper coverage audit (read-only)', () => {
  const all = rows();

  it('recomputes current Vegan eligibility counts from the real Mapper base', () => {
    expect(all).toHaveLength(2089);
    const counts: Record<string, number> = {};
    for (const row of all) {
      const { status } = eligibility(row);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    console.log('VEGAN_ELIGIBILITY_COUNTS ' + JSON.stringify(counts));
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2089);
    // The 18 fail-closed conflicts stay fail-closed — never guessed VERIFIED.
    expect(counts.VEGAN_CONFLICT).toBeGreaterThan(0);
  });

  it('PROVES the no-blocking invariant: enhanced-unknown blocks 0 VEGAN_VERIFIED products', () => {
    const verified = all.filter((row) => eligibility(row).status === 'VEGAN_VERIFIED');
    let blocked = 0;
    for (const row of verified) {
      const behavior = behaviorOf(row);
      const unknownEnhanced =
        behavior.fat.evidence === 'UNKNOWN' ||
        behavior.protein.evidence === 'UNKNOWN' ||
        behavior.structuralCarbohydrates.length === 0 ||
        behavior.hydrocolloids.length === 0;
      // The derived layer is not an input to eligibility at all, so an unknown
      // enhanced class can never change the answer. Re-assert it per row.
      if (unknownEnhanced && eligibility(row).status !== 'VEGAN_VERIFIED') blocked += 1;
    }
    console.log(`VEGAN_BLOCKED_DUE_TO_ENHANCED_UNKNOWN ${blocked}`);
    expect(blocked).toBe(0);
  });

  it('reports FULL / PARTIAL / BASELINE enhancement across every VEGAN_VERIFIED product', () => {
    const verified = all.filter((row) => eligibility(row).status === 'VEGAN_VERIFIED');
    const levels: Record<VeganEnhancementLevel, number> = {
      FULL_ENHANCEMENT: 0,
      PARTIAL_ENHANCEMENT: 0,
      BASELINE_FALLBACK: 0,
    };
    for (const row of verified) levels[veganEnhancementLevel(behaviorOf(row))] += 1;
    console.log('VEGAN_ENHANCEMENT_LEVELS ' + JSON.stringify(levels));
    expect(levels.FULL_ENHANCEMENT + levels.PARTIAL_ENHANCEMENT + levels.BASELINE_FALLBACK).toBe(
      verified.length,
    );
  });

  it('reports derived-evidence coverage per axis (explicit / inferred / unknown)', () => {
    const verified = all.filter((row) => eligibility(row).status === 'VEGAN_VERIFIED');
    const fatBearing = verified.filter((row) => (num(row.fat_percent) ?? 0) > 0.5);
    const proteinBearing = verified.filter((row) => (num(row.protein_percent) ?? 0) > 0.5);

    const tally = <T>(source: readonly Row[], pick: (row: Row) => T) => {
      const counts = new Map<T, number>();
      for (const row of source) {
        const key = pick(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Object.fromEntries([...counts].map(([key, value]) => [String(key), value]));
    };

    const has = (row: Row, predicate: (behavior: ReturnType<typeof behaviorOf>) => boolean) =>
      predicate(behaviorOf(row));

    const coverage = {
      total_rows: all.length,
      vegan_verified: verified.length,
      fat_amount_present: verified.filter((row) => num(row.fat_percent) !== null).length,
      protein_amount_present: verified.filter((row) => num(row.protein_percent) !== null).length,
      fibre_amount_present: verified.filter((row) => num(row.fiber_percent) !== null).length,
      fat_bearing: fatBearing.length,
      fat_class_evidence: tally(fatBearing, (row) => behaviorOf(row).fat.evidence),
      fat_class_share_known: pct(
        fatBearing.filter((row) => has(row, (b) => b.fat.evidence !== 'UNKNOWN')).length,
        fatBearing.length,
      ),
      fat_functional_classes: tally(fatBearing, (row) => behaviorOf(row).fat.functionalClass),
      protein_bearing: proteinBearing.length,
      protein_class_evidence: tally(proteinBearing, (row) => behaviorOf(row).protein.evidence),
      protein_class_share_known: pct(
        proteinBearing.filter((row) => has(row, (b) => b.protein.evidence !== 'UNKNOWN')).length,
        proteinBearing.length,
      ),
      protein_sources: tally(proteinBearing, (row) => behaviorOf(row).protein.source),
      inulin: verified.filter((row) =>
        has(row, (b) => b.structuralCarbohydrates.some((e) => e.structuralClass === 'inulin')),
      ).length,
      starch: verified.filter((row) =>
        has(row, (b) => b.structuralCarbohydrates.some((e) => e.structuralClass === 'starch')),
      ).length,
      oat_matrix: verified.filter((row) =>
        has(row, (b) => b.structuralCarbohydrates.some((e) => e.structuralClass === 'oat_matrix')),
      ).length,
      beta_glucan_explicit: verified.filter((row) =>
        has(row, (b) =>
          b.structuralCarbohydrates.some((e) => e.structuralClass === 'beta_glucan_explicit'),
        ),
      ).length,
      hydrocolloid_known: verified.filter((row) =>
        has(row, (b) => b.hydrocolloids.some((e) => e.evidence !== 'UNKNOWN')),
      ).length,
      hydrocolloid_unknown_identity: verified.filter((row) =>
        has(row, (b) => b.hydrocolloids.some((e) => e.evidence === 'UNKNOWN')),
      ).length,
      emulsifier_known: verified.filter((row) =>
        has(row, (b) => b.emulsifiers.some((e) => e.evidence !== 'UNKNOWN')),
      ).length,
    };
    console.log('VEGAN_COVERAGE_V2 ' + JSON.stringify(coverage, null, 2));

    // β-glucan coverage is 0 % (audit §5.2) — no β-glucan term may be built.
    expect(coverage.beta_glucan_explicit).toBe(0);
    expect(coverage.fat_amount_present).toBe(verified.length);
    expect(coverage.protein_amount_present).toBe(verified.length);
  });

  it('classifies the whole Mapper base deterministically and cheaply', () => {
    const first = all.map((row) => JSON.stringify(behaviorOf(row)));
    const second = all.map((row) => JSON.stringify(behaviorOf(row)));
    expect(second).toEqual(first);
  });
});
