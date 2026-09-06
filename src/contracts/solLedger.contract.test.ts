/**
 * Structural contract for the single append-only Gellatti SOL ledger.
 *
 * This test protects numbering and recovery provenance. It does not claim that
 * a product defect is fixed; staging status still requires separate evidence.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LEDGER_PATH = resolve(process.cwd(), 'docs', 'qa', 'GELLATTI_SOL_LEDGER.md');
const ledger = readFileSync(LEDGER_PATH, 'utf8');
const entries = [...ledger.matchAll(/^- \[[ x]\] \*\*(SOL-(\d{3})) · ([A-Z_]+) —/gm)].map(
  ([, id, number, status]) => ({ id, number: Number(number), status }),
);

describe('Gellatti SOL ledger continuity', () => {
  it('contains every append-only ID exactly once from SOL-001 through SOL-045', () => {
    expect(entries.map(({ number }) => number)).toEqual(
      Array.from({ length: 45 }, (_, index) => index + 1),
    );
    expect(new Set(entries.map(({ id }) => id)).size).toBe(45);
  });

  it('reserves SOL-046 as the next free ID without assigning it', () => {
    expect(ledger).toContain('`NEXT_FREE_SOL_ID: SOL-046`');
    expect(entries.some(({ id }) => id === 'SOL-046')).toBe(false);
  });

  it('records no unrecovered gap after restoring SOL-034 through SOL-038', () => {
    expect(ledger).not.toContain('UNRECOVERED_LEDGER_GAP');
    for (let number = 34; number <= 38; number += 1) {
      expect(entries.some(({ id }) => id === `SOL-${String(number).padStart(3, '0')}`)).toBe(true);
    }
  });

  it('keeps SOL-014 in PR-only status until staging proof exists', () => {
    expect(entries.find(({ id }) => id === 'SOL-014')?.status).toBe(
      'RESOLVED_IN_PR_AWAITING_MERGE',
    );
    expect(ledger).toContain(
      'Status można zmienić na `RESOLVED_ON_STAGING` dopiero po zwykłym merge',
    );
  });

  it('retains the confirmed SOL-039 through SOL-045 findings as TODO', () => {
    for (let number = 39; number <= 45; number += 1) {
      const id = `SOL-${String(number).padStart(3, '0')}`;
      expect(entries.find((entry) => entry.id === id)?.status).toBe('TODO');
    }

    expect(ledger).toContain('SOL-039 · TODO — HOME nie odczytywał opublikowanego werdyktu');
    expect(ledger).toContain('SOL-040 · TODO — HOME nie miał działającego etapu wykonania');
    expect(ledger).toContain('SOL-041 · TODO — frakcyjny stabilizator');
    expect(ledger).toContain('SOL-042 · TODO — odczyt kodu zależy od orientacji produktu');
    expect(ledger).toContain('SOL-043 · TODO — klient widzi surowe statusy techniczne');
    expect(ledger).toContain('SOL-044 · TODO — niejasny lifecycle prywatnego produktu');
    expect(ledger).toContain('SOL-045 · TODO — kamera komputerowa pokazuje kod zbyt rozmyty');
  });

  it('records the proven PR #181 before PR #198 migration order', () => {
    const checkpoint = ledger.slice(
      ledger.indexOf('## SOL-014 migration dependency checkpoint'),
      ledger.indexOf('## Recovery provenance'),
    );
    const orderedAppliedVersions = [
      '20260905103024_base_only_nutrition_label_permission',
      '20260905142334_reclassify_base_only_nutrition_bindings',
      '20260906003955_mapper_lineage_current_binding',
      '20260906004154_reclassify_stale_mapper_lineage_bindings',
    ];

    let previousIndex = -1;
    for (const version of orderedAppliedVersions) {
      const nextIndex = checkpoint.indexOf(`\`${version}\``);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      previousIndex = nextIndex;
    }

    expect(checkpoint).toContain('First synchronize PR #181 with current staging');
    expect(checkpoint).toContain('Only then merge #198 normally');
  });
});
