/// <reference types="node" />
/**
 * D-CODE-03 — the Codes form says whether a code is free while it is typed,
 * using the server's own answer, in one sentence, never the raw reason.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CODE_REFUSAL_COPY,
  codeAvailabilityLine,
  serverCodeForm,
  worthAsking,
} from './codeAvailability';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The latest definition of the availability RPC, found by content, dollar-quote aware. */
const latestAvailabilityRpc = (): string => {
  const opener = 'create or replace function public.gellatti_partner_code_claim_refusal_v1(';
  let found: string | undefined;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.lastIndexOf(opener);
    if (start < 0) continue;
    const tag = /as (\$[a-z]*\$)/.exec(sql.slice(start))?.[1];
    if (!tag) continue;
    const open = sql.indexOf(tag, start) + tag.length;
    found = sql.slice(start, sql.indexOf(tag, open) + tag.length);
  }
  if (!found) throw new Error('no migration defines the availability RPC');
  return found;
};

const RPC = latestAvailabilityRpc();

describe('the copy covers exactly what the server can answer', () => {
  it('one sentence per refusal the SQL returns — no more, no fewer', () => {
    const returned = [...new Set([...RPC.matchAll(/return '([a-z_]+)'/g)].map((m) => m[1] ?? ''))];
    expect(Object.keys(CODE_REFUSAL_COPY).sort()).toEqual(returned.sort());
  });

  it('no sentence leaks a raw reason', () => {
    for (const [reason, text] of Object.entries(CODE_REFUSAL_COPY)) {
      expect(text, reason).not.toContain('_');
      expect(text.toLowerCase(), reason).not.toContain(reason);
    }
  });

  it('asks about the same string the server will claim', () => {
    expect(RPC).toContain("upper(regexp_replace(coalesce(p_code, ''), '\\s', '', 'g'))");
    expect(serverCodeForm('kasia 12 34')).toBe('KASIA1234');
  });

  it('the service calls this RPC with its real parameter names', () => {
    expect(RPC).toMatch(/\(\s*p_partner_id uuid,\s*p_code text\s*\)/);
    expect(read('../../services/partner.ts')).toMatch(
      /rpc\('gellatti_partner_code_claim_refusal_v1', \{\s*p_partner_id: partnerId,\s*p_code: code,?\s*\}\)/,
    );
  });
});

describe('what the partner reads while typing', () => {
  const answered = (refusal: string | null) => ({ state: 'answered' as const, refusal });

  it('nothing for an empty field', () => {
    expect(codeAvailabilityLine('', answered(null))).toBeNull();
    expect(codeAvailabilityLine('   ', answered(null))).toBeNull();
  });

  it('below the minimum: the rule, not an error — and the server is not asked', () => {
    expect(worthAsking('kas')).toBe(false);
    expect(codeAvailabilityLine('kas', { state: 'waiting' })).toEqual({
      tone: 'neutral',
      text: expect.stringContaining('znaków'),
    });
  });

  it('while the server is asked: a neutral "checking"', () => {
    expect(codeAvailabilityLine('kasia1', { state: 'waiting' })?.tone).toBe('neutral');
  });

  it('a free code says so', () => {
    expect(codeAvailabilityLine('kasia1', answered(null))).toEqual({
      tone: 'ok',
      text: 'Kod jest dostępny.',
    });
  });

  it('every refusal reads as its own sentence', () => {
    for (const [reason, text] of Object.entries(CODE_REFUSAL_COPY)) {
      expect(codeAvailabilityLine('kasia1', answered(reason))).toEqual({ tone: 'error', text });
    }
  });

  it('an answer nobody taught the page is still a sentence, not the raw value', () => {
    const line = codeAvailabilityLine('kasia1', answered('some_new_reason'));
    expect(line?.tone).toBe('error');
    expect(line?.text).not.toContain('some_new_reason');
  });

  it('a failed check claims nothing — the create guard still decides', () => {
    expect(codeAvailabilityLine('kasia1', { state: 'failed' })).toBeNull();
  });
});

describe('the Codes form uses it', () => {
  const page = read('../../pages/community/PartnerPage.tsx');

  it('asks while typing, shows the line, and will not submit a refused code', () => {
    expect(page).toContain('useCodeAvailability(data.partner?.id, code)');
    expect(page).toContain('data-testid="code-availability"');
    expect(page).toContain("availability?.tone === 'error'");
  });
});
