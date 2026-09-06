/**
 * The guard's behaviour, proven rather than demonstrated.
 *
 * A one-off manual falsification proves the guard worked once, on one machine, on one
 * afternoon. What the ledger actually needs is that the guard KEEPS refusing the thing it
 * was built to refuse — including after someone edits it. So every scenario from that
 * falsification lives here and runs in CI.
 *
 * The decision is imported as a pure function; nothing here touches git or the filesystem.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs guard script, deliberately not part of the app build
import { decide, parseLedger } from '../../../scripts/guardHomeLedger.mjs';

const LEDGER = 'reports/GELLATTI_HOME_MASTER_CHECKLIST.md';
const ledgerText = readFileSync(LEDGER, 'utf8');

const rows = (entries: Array<[string, string, string]>) =>
  new Map(entries.map(([id, status, evidence]) => [id, { status, evidence }]));

const HOME_FILE = ['src/features/home-creator/homeStageFlow.ts'];

describe('the guard refuses what it was built to refuse', () => {
  it('rejects a HOME functional change with no requirement row moved', () => {
    const before = rows([['H-83-1', 'IMPLEMENTED', 'x']]);
    const after = rows([['H-83-1', 'IMPLEMENTED', 'x']]);
    const verdict = decide({
      homeTouched: HOME_FILE,
      rowsBefore: before,
      rowsAfter: after,
      exemptionReason: null,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('no-requirement-row-moved');
  });

  it('still rejects it when only whitespace, a date or prose changed', () => {
    // Those edits change the FILE but not a parsed row, which is the whole design: the
    // obvious way to defeat a "did you touch the file" check is to touch the file.
    const identical: Array<[string, string, string]> = [['H-83-1', 'IMPLEMENTED', 'x']];
    const verdict = decide({
      homeTouched: HOME_FILE,
      rowsBefore: rows(identical),
      rowsAfter: rows(identical),
      exemptionReason: null,
    });
    expect(verdict.ok).toBe(false);
  });

  it('lets a change outside HOME through', () => {
    const verdict = decide({
      homeTouched: [],
      rowsBefore: rows([]),
      rowsAfter: rows([]),
      exemptionReason: null,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBe('no-home-change');
  });

  it('accepts a HOME change whose requirement row actually moved', () => {
    const verdict = decide({
      homeTouched: HOME_FILE,
      rowsBefore: rows([['H-83-1', 'IMPLEMENTED', 'old']]),
      rowsAfter: rows([['H-83-1', 'TESTED', 'homeStageFlow.test.ts, behavioural']]),
      exemptionReason: null,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.moved).toEqual(['H-83-1: IMPLEMENTED -> TESTED']);
  });

  it('accepts a status left alone when the EVIDENCE changed', () => {
    // Recording why a row is where it is counts as maintaining the ledger.
    const verdict = decide({
      homeTouched: HOME_FILE,
      rowsBefore: rows([['H-83-1', 'IMPLEMENTED', 'no proof']]),
      rowsAfter: rows([['H-83-1', 'IMPLEMENTED', 'module at src/…, still unproven']]),
      exemptionReason: null,
    });
    expect(verdict.ok).toBe(true);
  });

  it('honours an exemption, but not a token one', () => {
    const thin = decide({
      homeTouched: HOME_FILE,
      rowsBefore: rows([]),
      rowsAfter: rows([]),
      exemptionReason: 'n/a',
    });
    expect(thin.ok).toBe(false);
    expect(thin.reason).toBe('exemption-too-thin');

    const real = decide({
      homeTouched: HOME_FILE,
      rowsBefore: rows([]),
      rowsAfter: rows([]),
      exemptionReason: 'pure rename of a private helper, no requirement changes meaning',
    });
    expect(real.ok).toBe(true);
  });
});

describe('the guard reads the real ledger correctly', () => {
  const { rows: parsed, problems } = parseLedger(ledgerText);

  it('parses every requirement row at 17 columns with unique ids', () => {
    expect(parsed.size).toBe(211);
    expect(problems).toEqual([]);
  });

  it('survives the escaped pipe that broke naive parsing', () => {
    // `[HOME\|PRO]` is a legal escaped pipe. Splitting on every `|` shifted the fields
    // and reported four healthy rows as malformed.
    const escaped = ledgerText.split('\n').filter((l) => l.startsWith('| H-') && l.includes('\\|'));
    expect(escaped.length).toBeGreaterThanOrEqual(4);
    for (const id of ['H-10-1', 'H-11-1', 'H-11-4', 'H-12-2']) {
      expect(parsed.has(id)).toBe(true);
    }
  });

  it('refuses a status outside the allowed set', () => {
    const broken = ledgerText.replace('| H-83-1 |', '| H-83-1 |').split('\n');
    const i = broken.findIndex((l) => l.startsWith('| H-83-1 '));
    const cells = broken[i]!.split(/(?<!\\)\|/);
    cells[15] = ' ALMOST DONE ';
    broken[i] = cells.join('|');
    const { problems: bad } = parseLedger(broken.join('\n'));
    expect(bad.some((p) => p.includes('ALMOST DONE'))).toBe(true);
  });

  it('refuses a duplicate requirement id', () => {
    const line = ledgerText.split('\n').find((l) => l.startsWith('| H-83-1 '))!;
    const { problems: bad } = parseLedger(`${ledgerText}\n${line}`);
    expect(bad.some((p) => p.includes('duplicate requirement id H-83-1'))).toBe(true);
  });
});
