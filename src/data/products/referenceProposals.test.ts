/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REFERENCE_PROPOSALS,
  draftReadiness,
  filterProposals,
  proposalChecklist,
  proposalInsertReadiness,
  proposalNextAction,
  proposalUnlockedProducts,
} from './referenceProposals';

describe('referenceProposals', () => {
  it('covers the missing-reference families + the full-fat greek yogurt variant gap', () => {
    expect(REFERENCE_PROPOSALS.map((p) => p.key)).toEqual([
      'greek_yogurt_full_fat', 'almond', 'erythritol', 'maltitol_polyols', 'steviol_stevia', 'sucralose', 'saccharin',
    ]);
  });

  it('the greek yogurt proposal targets the dairy category and unlocks 000016/000017', () => {
    const greek = REFERENCE_PROPOSALS.find((p) => p.key === 'greek_yogurt_full_fat')!;
    expect(greek.category).toBe('dairy');
    expect(greek.unlocks).toEqual(['PR-ING-000016', 'PR-ING-000017']);
    expect(greek.known_composition.fat).toBeGreaterThan(9); // fattier than the 7.5% lean ref
  });

  it('every proposal needs team pac/pod calibration and is NOT insert-ready', () => {
    for (const p of REFERENCE_PROPOSALS) {
      expect(p.needs_pacpod_calibration, p.key).toBe(true);
      expect(p.readiness, p.key).not.toBe('ready');
      expect(p.missing_fields.some((f) => /pac_value/.test(f)), p.key).toBe(true);
      expect(p.missing_fields.some((f) => /pod_value/.test(f)), p.key).toBe(true);
      expect(p.do_not_insert_reason.length, p.key).toBeGreaterThan(0);
      // never carries an actual engine pac/pod value
      expect(p.known_composition).not.toHaveProperty('pac_value');
      expect(p.known_composition).not.toHaveProperty('pod_value');
    }
  });

  it('uses schema-valid basement categories (never the invalid nut_paste)', () => {
    const valid = new Set(['dairy', 'sugar', 'fat', 'stabilizer', 'emulsifier', 'fruit', 'chocolate', 'nut', 'alcohol', 'water', 'flavor', 'salt', 'other']);
    for (const p of REFERENCE_PROPOSALS) expect(valid.has(p.category), `${p.key}:${p.category}`).toBe(true);
  });

  it('filterProposals filters by readiness, category, and unlocked-product substring', () => {
    expect(filterProposals(REFERENCE_PROPOSALS, { readiness: 'needs_pacpod' }).length).toBe(REFERENCE_PROPOSALS.length); // all are needs_pacpod
    expect(filterProposals(REFERENCE_PROPOSALS, { readiness: 'ready' }).length).toBe(0);
    expect(filterProposals(REFERENCE_PROPOSALS, { category: 'dairy' }).map((p) => p.key)).toEqual(['greek_yogurt_full_fat']);
    expect(filterProposals(REFERENCE_PROPOSALS, { unlocks: '000040' }).map((p) => p.key)).toEqual(['almond']);
  });

  it('proposalNextAction always describes the team-calibration gate for needs_pacpod', () => {
    for (const p of REFERENCE_PROPOSALS) {
      expect(proposalNextAction(p)).toMatch(/PAC\/POD/);
    }
  });

  it('proposalChecklist: pac/pod are ALWAYS team_only; sourced fields show present', () => {
    const almond = REFERENCE_PROPOSALS.find((p) => p.key === 'almond')!;
    const items = new Map(proposalChecklist(almond).map((i) => [i.field, i.status]));
    expect(items.get('pac_value')).toBe('team_only');
    expect(items.get('pod_value')).toBe('team_only');
    expect(items.get('label composition')).toBe('present');
    expect(items.get('water / total_solids')).toBe('present');
    expect(items.get('sources / provenance')).toBe('present');
    // stevia has no water/solids figure → honestly missing
    const stevia = REFERENCE_PROPOSALS.find((p) => p.key === 'steviol_stevia')!;
    expect(new Map(proposalChecklist(stevia).map((i) => [i.field, i.status])).get('water / total_solids')).toBe('missing');
  });

  it('proposalInsertReadiness: NEVER ready from this module (pac/pod team-only always blocks)', () => {
    for (const p of REFERENCE_PROPOSALS) {
      const r = proposalInsertReadiness(p);
      expect(r.ready, p.key).toBe(false);
      expect(r.blocking.join(' '), p.key).toMatch(/pac_value \(team calibration\)/);
      expect(r.blocking.join(' '), p.key).toMatch(/pod_value \(team calibration\)/);
    }
  });

  it('draftReadiness: blocked without team pac/pod; ready ONLY with team-typed values + complete non-engine fields', () => {
    const almond = REFERENCE_PROPOSALS.find((p) => p.key === 'almond')!;
    // no draft values → blocked on both engine fields
    const blocked = draftReadiness(almond, {});
    expect(blocked.ready).toBe(false);
    expect(blocked.blocking.join(' ')).toMatch(/pac_value .*not entered/);
    // team typed finite values → almond (all non-engine fields present) becomes a READY local draft
    const ready = draftReadiness(almond, { pac_value: 2.1, pod_value: 1.4 });
    expect(ready.ready).toBe(true);
    // stevia is missing water/solids → still blocked even with pac/pod typed
    const stevia = REFERENCE_PROPOSALS.find((p) => p.key === 'steviol_stevia')!;
    const steviaDraft = draftReadiness(stevia, { pac_value: 0, pod_value: 300 });
    expect(steviaDraft.ready).toBe(false);
    expect(steviaDraft.blocking.join(' ')).toMatch(/water \/ total_solids/);
    // non-finite values never count
    expect(draftReadiness(almond, { pac_value: Number.NaN, pod_value: 1 }).ready).toBe(false);
  });

  it('unlocks real PR product codes', () => {
    const unlocked = proposalUnlockedProducts();
    expect(unlocked).toContain('PR-ING-000040'); // almond
    expect(unlocked).toContain('PR-ING-000060'); // erythritol+sucralose
    expect(unlocked.every((c) => /^PR-ING-\d{6}$/.test(c))).toBe(true);
  });
});

describe('referenceProposals — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = strip(readFileSync(join(SRC, 'data', 'products', 'referenceProposals.ts'), 'utf8'));

  it('no DB / service / write / npac, and never a numeric pac/pod literal', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
    // pac_value/pod_value appear only as STRINGS in missing_fields, never as a numeric assignment
    expect(/pac_value\s*:\s*[\d.]/.test(MOD)).toBe(false);
    expect(/pod_value\s*:\s*[\d.]/.test(MOD)).toBe(false);
  });
});
