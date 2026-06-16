/// <reference types="node" />
/**
 * Phase Ingredients 1 (Slice 2) — the ingredients service must be read-only
 * (no write path to the PI Pro library), reference no privileged server role,
 * and pull in no OpenAI/Stripe.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const SERVICE = readFileSync(join(SRC, 'services', 'ingredients.ts'), 'utf8');

describe('ingredients service security', () => {
  it('is read-only (no insert/update/upsert/delete)', () => {
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(SERVICE.includes(write), `ingredients.ts must not ${write}`).toBe(false);
    }
  });

  it('never references a privileged server role', () => {
    expect(/service[_-]?role/i.test(SERVICE)).toBe(false);
  });

  it('pulls in no OpenAI/Stripe', () => {
    expect(/\b(openai|stripe)\b/i.test(SERVICE)).toBe(false);
  });
});
