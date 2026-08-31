/// <reference types="node" />
/**
 * Partner code SLOTS + ALIAS OWNERSHIP migration guard (20260831200000).
 *
 * Proven statically against the SQL text (comment-stripped). No live DB.
 * Drift between src/billing/domain/partnerCodeSlots.ts and the SQL breaks this
 * test — the TS module and the database must enforce the SAME owner rules.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MAX_CURRENT_PARTNER_CODES,
  evaluateCodeClaim,
  type CodeClaimRefusalReason,
} from './partnerCodeSlots';
import {
  OFFENSIVE_CODE_WORDS,
  PARTNER_CODE_MAX_LENGTH,
  PARTNER_CODE_MIN_LENGTH,
  PROTECTED_CODE_WORDS,
} from './partnerCodes';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260831200000_partner_code_slots_and_alias_ownership.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, ''); // strip line comments

describe('X2 — alias ownership: uniqueness becomes global', () => {
  it('creates a GLOBAL, CASE-INSENSITIVE unique index on code and on slug', () => {
    // Live staging stores some codes lowercase, so a plain (code) index would
    // let a second partner take the uppercase spelling of an existing code.
    expect(CODE).toMatch(
      /create unique index if not exists partner_codes_code_global_uniq\s*\n?\s*on public\.partner_codes \(upper\(code\)\)/,
    );
    expect(CODE).toMatch(
      /create unique index if not exists partner_codes_slug_global_uniq\s*\n?\s*on public\.partner_codes \(lower\(slug\)\)/,
    );
  });

  it('the pre-flight duplicate check is case-insensitive too, matching the index', () => {
    expect(CODE).toContain('group by upper(code)');
    expect(CODE).toContain('group by lower(slug)');
  });

  it('the new indexes are NOT scoped to active rows — that was the whole defect', () => {
    const codeIndex =
      /create unique index if not exists partner_codes_code_global_uniq[^;]*/.exec(CODE)?.[0] ?? '';
    const slugIndex =
      /create unique index if not exists partner_codes_slug_global_uniq[^;]*/.exec(CODE)?.[0] ?? '';
    expect(codeIndex).not.toMatch(/where/i);
    expect(slugIndex).not.toMatch(/where/i);
  });

  it('drops the old active-only partial indexes', () => {
    expect(CODE).toContain('drop index if exists public.partner_codes_code_active_uniq');
    expect(CODE).toContain('drop index if exists public.partner_codes_slug_active_uniq');
  });

  it('creates the replacements BEFORE dropping the old ones (namespace never unprotected)', () => {
    expect(CODE.indexOf('partner_codes_code_global_uniq')).toBeLessThan(
      CODE.indexOf('drop index if exists public.partner_codes_code_active_uniq'),
    );
  });

  it('refuses to run when duplicate code or slug text already exists', () => {
    expect(CODE).toMatch(/raise exception[\s\S]*?duplicate code text already exists/);
    expect(CODE).toMatch(/raise exception[\s\S]*?duplicate slug already exists/);
  });
});

describe('X3 — slot ceiling', () => {
  it('enforces the same ceiling the TS module exports', () => {
    expect(MAX_CURRENT_PARTNER_CODES).toBe(3);
    expect(CODE).toMatch(new RegExp(`v_active >= ${MAX_CURRENT_PARTNER_CODES}`));
    expect(CODE).toMatch(new RegExp(`maximum ${MAX_CURRENT_PARTNER_CODES}`));
  });

  it('uses a trigger, because a CHECK cannot see sibling rows', () => {
    expect(CODE).toContain('create or replace function public.enforce_partner_code_slot_limit()');
    expect(CODE).toMatch(
      /create trigger partner_codes_slot_limit\s+before insert or update of status, partner_id on public\.partner_codes/,
    );
  });

  it('counts only ACTIVE rows, so aliases and blocked codes never consume a slot (CS3)', () => {
    const fn =
      /create or replace function public\.enforce_partner_code_slot_limit\(\)[\s\S]*?\$\$;/.exec(
        CODE,
      )?.[0] ?? '';
    expect(fn).toMatch(/where partner_id = new\.partner_id\s*\n?\s*and status = 'active'/);
  });

  it('never blocks archiving or blocking a code', () => {
    const fn =
      /create or replace function public\.enforce_partner_code_slot_limit\(\)[\s\S]*?\$\$;/.exec(
        CODE,
      )?.[0] ?? '';
    // a transition to any non-active status returns immediately
    expect(fn).toMatch(/if new\.status is distinct from 'active' then\s*\n?\s*return new;/);
  });

  it('excludes the row being updated from its own count', () => {
    const fn =
      /create or replace function public\.enforce_partner_code_slot_limit\(\)[\s\S]*?\$\$;/.exec(
        CODE,
      )?.[0] ?? '';
    expect(fn).toContain('id is distinct from new.id');
  });

  it('is not executable by clients', () => {
    expect(CODE).toContain(
      'revoke all on function public.enforce_partner_code_slot_limit() from public, anon, authenticated',
    );
  });
});

describe('claim guard mirrors evaluateCodeClaim()', () => {
  const guard =
    /create or replace function public\.gellatti_partner_code_claim_refusal_v1[\s\S]*?\$\$;/.exec(
      CODE,
    )?.[0] ?? '';

  it('exists and is stable + security definer', () => {
    expect(guard).toContain('stable');
    expect(guard).toContain('security definer');
    expect(guard).toContain('set search_path = public');
  });

  it('returns the ownership refusal reasons that existed at this migration', () => {
    // 20260831200000 shipped the ceiling reason as `slot_limit_reached`. It was
    // renamed to the canonical `partner_active_code_limit_reached` by
    // 20260831200200 — see the supersession test below. This migration is
    // applied history and is deliberately not edited.
    for (const reason of ['held_by_another_partner', 'blocked_code', 'already_current'] as const) {
      expect(guard, reason).toContain(`'${reason}'`);
    }
    expect(guard).toContain("'slot_limit_reached'");
  });

  it('returns the format refusal reasons too', () => {
    for (const reason of ['too_short', 'too_long', 'invalid_characters']) {
      expect(guard, reason).toContain(`'${reason}'`);
    }
  });

  it('uses the same length bounds as partnerCodes.ts', () => {
    expect(PARTNER_CODE_MIN_LENGTH).toBe(5);
    expect(PARTNER_CODE_MAX_LENGTH).toBe(16);
    expect(guard).toMatch(new RegExp(`length\\(v_code\\) < ${PARTNER_CODE_MIN_LENGTH}`));
    expect(guard).toMatch(new RegExp(`length\\(v_code\\) > ${PARTNER_CODE_MAX_LENGTH}`));
  });

  it('checks blocked BEFORE other-partner, matching the TS refusal precedence (CS6 > CS4)', () => {
    expect(guard.indexOf("'blocked_code'")).toBeLessThan(
      guard.indexOf("'held_by_another_partner'"),
    );
  });

  it('treats a retired code held by another partner as unclaimable (the X2 fix)', () => {
    // the holder lookup must NOT filter by status — any row blocks the claim
    expect(guard).toMatch(
      /select \* into v_holder from public\.partner_codes where upper\(code\) = v_code;/,
    );
    expect(guard).not.toMatch(/where upper\(code\) = v_code and status = 'active'/);
  });

  it('normalizes case and whitespace before lookup (CS4)', () => {
    expect(guard).toMatch(/upper\(regexp_replace\(/);
  });

  it('is callable by authenticated users but not anon', () => {
    expect(CODE).toContain(
      'revoke all on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) from public, anon',
    );
    expect(CODE).toContain(
      'grant execute on function public.gellatti_partner_code_claim_refusal_v1(uuid, text) to authenticated',
    );
  });
});

describe('safety invariants', () => {
  it('never drops or recreates the partner_codes table itself', () => {
    expect(/drop table[^;]*partner_codes/i.test(CODE)).toBe(false);
    expect(/create table[^;]*partner_codes/i.test(CODE)).toBe(false);
  });

  it('never touches the ledger, attribution or payout tables', () => {
    for (const table of [
      'commission_entries',
      'commission_adjustments',
      'referral_attributions',
      'referral_clicks',
      'partner_payouts',
      'payout_batches',
    ]) {
      expect(
        new RegExp(`(drop|alter|delete from|update)[^;]*\\b${table}\\b`, 'i').test(CODE),
        table,
      ).toBe(false);
    }
  });

  it('adds no write grants for clients', () => {
    expect(/grant (insert|update|delete)/i.test(CODE)).toBe(false);
  });

  it('documents a rollback', () => {
    // the rollback plan lives in comments, so assert against the raw SQL
    expect(SQL).toContain('ROLLBACK');
    expect(SQL).toContain('create unique index partner_codes_code_active_uniq');
  });
});

describe('PC3 banned words — the follow-up migration the live probe forced', () => {
  const BANNED_SQL = readFileSync(
    join(REPO, 'supabase', 'migrations', '20260831200100_partner_code_banned_words.sql'),
    'utf8',
  );
  const BANNED = BANNED_SQL.replace(/--.*$/gm, '');

  /** The word array the SQL guard actually loops over, parsed from the source. */
  function sqlBannedWords(): string[] {
    const block = /foreach v_banned in array array\[([\s\S]*?)\]/.exec(BANNED)?.[1] ?? '';
    return [...block.matchAll(/'([A-Z]+)'/g)].map((m) => m[1]);
  }

  it('PARITY: the SQL list equals the TS list exactly — no drift in either direction', () => {
    // This is the contract the live defect earned. It fails if EITHER side
    // gains or loses a word: a TS-only addition leaves the database weaker
    // (the original defect), and a SQL-only addition silently refuses codes
    // the application would have accepted.
    const ts = [...PROTECTED_CODE_WORDS, ...OFFENSIVE_CODE_WORDS];
    expect(new Set(sqlBannedWords())).toEqual(new Set(ts));
  });

  it('PARITY: the counts match, so a duplicate cannot mask a missing word', () => {
    const ts = [...PROTECTED_CODE_WORDS, ...OFFENSIVE_CODE_WORDS];
    expect(sqlBannedWords()).toHaveLength(new Set(ts).size);
  });

  it('carries every protected word the TS module protects', () => {
    for (const word of PROTECTED_CODE_WORDS) {
      expect(sqlBannedWords(), word).toContain(word);
    }
  });

  it('carries every offensive word the TS module rejects', () => {
    for (const word of OFFENSIVE_CODE_WORDS) {
      expect(sqlBannedWords(), word).toContain(word);
    }
  });

  it('the words proven refused on the live database are all in the list', () => {
    // ADMINX, PINGUINO1, STRIPEX, MYPAYOUT were verified as `banned_word`
    // against real staging after applying 20260831200100.
    for (const stem of ['ADMIN', 'PINGUINO', 'STRIPE', 'PAYOUT']) {
      expect(sqlBannedWords(), stem).toContain(stem);
    }
  });

  it('matches by containment, exactly as PC3 does', () => {
    expect(BANNED).toContain('position(v_banned in v_code) > 0');
    expect(BANNED).toContain("return 'banned_word'");
  });

  it('checks banned words BEFORE the ownership lookup', () => {
    // a banned code should report WHY it is banned, not who happens to hold it
    expect(BANNED.indexOf("return 'banned_word'")).toBeLessThan(
      BANNED.indexOf('select * into v_holder'),
    );
  });

  it('does not re-validate or rewrite existing codes', () => {
    expect(/update public\.partner_codes/i.test(BANNED)).toBe(false);
    expect(BANNED_SQL).toContain('Existing codes are NOT re-validated');
  });

  it('keeps the case-insensitive lookup from the previous migration', () => {
    expect(BANNED).toContain('where upper(code) = v_code');
  });
});

describe('ONE canonical ceiling reason (owner ruling §3)', () => {
  const DEDUPE = readFileSync(
    join(REPO, 'supabase', 'migrations', '20260831200200_partner_code_slot_limit_dedupe.sql'),
    'utf8',
  ).replace(/--.*$/gm, '');

  it('the latest claim-guard definition emits the canonical identifier', () => {
    expect(DEDUPE).toContain("return 'partner_active_code_limit_reached'");
    expect(DEDUPE).not.toContain("return 'slot_limit_reached'");
  });

  it('the TS domain uses the identical string, so there is no second spelling', () => {
    const outcome = evaluateCodeClaim({
      registry: [
        { code: 'AAAAA', partnerId: 'p1', state: 'current' },
        { code: 'BBBBB', partnerId: 'p1', state: 'current' },
        { code: 'CCCCC', partnerId: 'p1', state: 'current' },
      ],
      partnerId: 'p1',
      rawCode: 'DDDDD',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('partner_active_code_limit_reached');
  });

  it('the redundant trigger and function are dropped, the canonical guard untouched', () => {
    expect(DEDUPE).toContain('drop trigger if exists partner_codes_slot_limit');
    expect(DEDUPE).toContain('drop function if exists public.enforce_partner_code_slot_limit()');
    expect(DEDUPE).not.toMatch(/(drop|create or replace)[^;]*gellatti_partner_code_guard_v1/);
  });

  it('does not rewrite any historical migration', () => {
    expect(DEDUPE).not.toContain('20260826122000');
    expect(/update public\.partner_codes/i.test(DEDUPE)).toBe(false);
  });
});
