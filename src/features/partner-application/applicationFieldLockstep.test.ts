/// <reference types="node" />
/**
 * Every answer the form collects must survive the writer.
 *
 * `gellatti_submit_partner_application_v1` builds its stored payload from an
 * explicit allow-list. A key the form sends that the writer does not name is
 * discarded silently: the RPC still returns success, the row is still created,
 * and the answer is simply absent from a jsonb column that has no shape. So
 * nothing fails, and nobody finds out until a reviewer opens an application and
 * the interesting field is blank.
 *
 * Three answers were being lost that way — the free-text note (pre-existing),
 * and consent plus audienceSize (added by C-APP-02 without checking the
 * writer). This lockstep is what makes the next one visible.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(new URL('./PartnerApplicationPanel.tsx', import.meta.url), 'utf8');

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260910160000_partner_application_stop_dropping_answers.sql',
    import.meta.url,
  ),
  'utf8',
);

/** The keys the form actually puts in its draft. */
const draftKeys = (): string[] => {
  const block = panel.match(/useState<PartnerApplicationDraft>\(\{([\s\S]*?)\}\)/);
  expect(block, 'the draft initialiser must be findable').toBeTruthy();
  return [...block![1].matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
};

/** The keys the writer is willing to store, plus the aliases it accepts. */
const writerAccepts = (): Set<string> => {
  const keys = new Set<string>();
  for (const m of migration.matchAll(/p_application->>?'([a-zA-Z]+)'/g)) keys.add(m[1]);
  for (const m of migration.matchAll(/^\s*'([a-zA-Z]+)',/gm)) keys.add(m[1]);
  return keys;
};

describe('form ↔ writer lockstep', () => {
  it('the writer accepts every key the form sends', () => {
    const accepted = writerAccepts();
    for (const key of draftKeys()) {
      expect(accepted.has(key), `"${key}" is collected by the form but the writer drops it`).toBe(
        true,
      );
    }
  });

  it('the three answers that were being lost are named explicitly', () => {
    const accepted = writerAccepts();
    // note → mapped onto the canonical `description`
    expect(accepted.has('note')).toBe(true);
    expect(accepted.has('description')).toBe(true);
    // consent → mapped onto the canonical `termsAccepted`, both spellings kept
    expect(accepted.has('consent')).toBe(true);
    expect(accepted.has('termsAccepted')).toBe(true);
    // audienceSize → stored under its own name
    expect(accepted.has('audienceSize')).toBe(true);
  });

  it('consent survives whichever spelling a deployed client sends', () => {
    // A client deployed before the migration still sends `consent`. Losing the
    // consent someone actually gave, during a rollout, is not an acceptable
    // window.
    expect(migration).toMatch(/termsAccepted'\)::boolean,\s*\n?\s*\(p_application->>'consent'\)/);
  });
});
