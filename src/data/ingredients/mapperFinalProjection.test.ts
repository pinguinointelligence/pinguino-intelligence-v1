import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import { INGREDIENT_INTAKE_HEADERS } from './ingredientIntakeColumns';

const MAPPER_PATH = resolve(
  process.cwd(),
  'docs/ingredients/validation/mapper_basement.csv',
);
const EXPECTED_FILE_SHA256 =
  'a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6';
const EXPECTED_ID_ORDER_SHA256 =
  '23285271075afecf8fae216aa65a8e430b3d1592a52c0fdff69086552e3c34f8';

const source = readFileSync(MAPPER_PATH, 'utf8');
const table = parseCsv(source);
const header = table[0] ?? [];
const rows = table.slice(1).filter((row) => row.some((cell) => cell !== ''));
const ingredientIdColumn = header.indexOf('ingredient_id');
const ingredientIds = rows.map((row) => row[ingredientIdColumn] ?? '');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('FINAL_FROZEN Mapper repository projection', () => {
  it('pins the certified file byte-for-byte', () => {
    expect(sha256(source)).toBe(EXPECTED_FILE_SHA256);
  });

  it('contains exactly 2541 rows and the frozen 62-column header', () => {
    expect(rows).toHaveLength(2541);
    expect(header).toEqual([...INGREDIENT_INTAKE_HEADERS]);
    for (const row of rows) expect(row).toHaveLength(62);
  });

  it('has 2541 unique canonical ingredient IDs in the certified order', () => {
    expect(new Set(ingredientIds).size).toBe(2541);
    expect(ingredientIds.every((id) => /^PI-ING-\d{6}$/.test(id))).toBe(true);
    expect(sha256(ingredientIds.join('\n'))).toBe(EXPECTED_ID_ORDER_SHA256);
    expect(ingredientIds.at(0)).toBe('PI-ING-000001');
    expect(ingredientIds.at(-1)).toBe('PI-ING-002566');
  });
});
