import { describe, expect, it } from 'vitest';

import {
  MAX_CURRENT_PARTNER_CODES,
  currentCodesOf,
  evaluateCodeClaim,
  findCodeHolder,
  remainingCodeSlots,
  replaceCurrentCode,
  reservedCodeSet,
  type PartnerCodeRecord,
} from './partnerCodeSlots';

const P1 = 'partner-1';
const P2 = 'partner-2';

const row = (
  code: string,
  partnerId: string,
  state: PartnerCodeRecord['state'],
): PartnerCodeRecord => ({
  code,
  partnerId,
  state,
});

describe('CS1 — a partner holds 0 to 3 current codes', () => {
  it('exposes the owner ceiling of 3', () => {
    expect(MAX_CURRENT_PARTNER_CODES).toBe(3);
  });

  it('reports remaining slots as codes are taken', () => {
    expect(remainingCodeSlots([], P1)).toBe(3);
    expect(remainingCodeSlots([row('TOMASZ', P1, 'current')], P1)).toBe(2);
    expect(
      remainingCodeSlots([row('TOMASZ', P1, 'current'), row('GELATTI24', P1, 'current')], P1),
    ).toBe(1);
  });

  it('allows the first three codes', () => {
    let registry: PartnerCodeRecord[] = [];
    for (const code of ['TOMASZ', 'GELATTI24', 'LODYFB']) {
      const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: code });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) registry = [...registry, row(outcome.code, P1, 'current')];
    }
    expect(currentCodesOf(registry, P1)).toHaveLength(3);
  });

  it('refuses a fourth current code', () => {
    const registry = [
      row('TOMASZ', P1, 'current'),
      row('GELATTI24', P1, 'current'),
      row('LODYFB', P1, 'current'),
    ];
    const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'CZWARTY' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('partner_active_code_limit_reached');
  });

  it("one partner's full slots do not restrict another partner", () => {
    const registry = [
      row('TOMASZ', P1, 'current'),
      row('GELATTI24', P1, 'current'),
      row('LODYFB', P1, 'current'),
    ];
    expect(evaluateCodeClaim({ registry, partnerId: P2, rawCode: 'MARIA1' }).ok).toBe(true);
  });
});

describe('CS3 — aliases do not consume current slots', () => {
  it('a partner with 3 aliases and 0 current codes has all 3 slots free', () => {
    const registry = [
      row('OLD1A', P1, 'alias'),
      row('OLD2A', P1, 'alias'),
      row('OLD3A', P1, 'alias'),
    ];
    expect(remainingCodeSlots(registry, P1)).toBe(3);
    expect(evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'NOWYKOD' }).ok).toBe(true);
  });

  it('blocked codes also do not consume slots', () => {
    const registry = [row('BADONE', P1, 'blocked')];
    expect(remainingCodeSlots(registry, P1)).toBe(3);
  });
});

describe('CS4 — global uniqueness across every partner, case-insensitively', () => {
  it("refuses another partner's current code", () => {
    const registry = [row('TOMASZ', P1, 'current')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P2, rawCode: 'TOMASZ' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('held_by_another_partner');
  });

  it('refuses regardless of case, spacing or accents', () => {
    const registry = [row('TOMASZ', P1, 'current')];
    for (const attempt of ['tomasz', 'To Masz', 'tomász', '  TOMASZ  ']) {
      const outcome = evaluateCodeClaim({ registry, partnerId: P2, rawCode: attempt });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe('held_by_another_partner');
    }
  });

  it('finds the holder irrespective of the written form', () => {
    const registry = [row('GELATTI24', P1, 'current')];
    expect(findCodeHolder(registry, 'gelatti24')?.partnerId).toBe(P1);
    expect(findCodeHolder(registry, 'NIEMA')).toBeNull();
  });
});

describe('CS2/CS5 — a historical alias stays with its original partner (X2)', () => {
  it("refuses another partner's ALIAS — the core owner override", () => {
    // Before this rule, a retired code was free for anyone to take, so an old
    // social post could start pointing at a different partner.
    const registry = [row('TOMASZ', P1, 'alias')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P2, rawCode: 'TOMASZ' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('held_by_another_partner');
  });

  it('lets the ORIGINAL partner reclaim their own alias', () => {
    const registry = [row('TOMASZ', P1, 'alias')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'TOMASZ' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reclaimedOwnAlias).toBe(true);
  });

  it('reclaiming an own alias still respects the 3-slot ceiling', () => {
    const registry = [
      row('TOMASZ', P1, 'alias'),
      row('A1111', P1, 'current'),
      row('B2222', P1, 'current'),
      row('C3333', P1, 'current'),
    ];
    const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'TOMASZ' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('partner_active_code_limit_reached');
  });

  it('a fresh claim of a never-used code is not flagged as a reclaim', () => {
    const outcome = evaluateCodeClaim({ registry: [], partnerId: P1, rawCode: 'SWIEZY' });
    expect(outcome.ok && outcome.reclaimedOwnAlias).toBe(false);
  });
});

describe('CS6 — blocked codes are unclaimable by anyone', () => {
  it('refuses another partner', () => {
    const registry = [row('BADONE', P1, 'blocked')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P2, rawCode: 'BADONE' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('blocked_code');
  });

  it('refuses even the original owner — only an admin can unblock', () => {
    const registry = [row('BADONE', P1, 'blocked')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'BADONE' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('blocked_code');
  });
});

describe('format refusals still apply (delegated to partnerCodes.ts)', () => {
  it('refuses a too-short code', () => {
    const outcome = evaluateCodeClaim({ registry: [], partnerId: P1, rawCode: 'AB' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('too_short');
  });

  it('refuses a protected word', () => {
    const outcome = evaluateCodeClaim({ registry: [], partnerId: P1, rawCode: 'ADMINX' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('banned_word');
  });

  it('reports the format reason ahead of an ownership reason', () => {
    // A too-long code held by someone else should say WHY it is malformed.
    const registry = [row('AAAAAAAAAAAAAAAAAAAA', P2, 'current')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'AAAAAAAAAAAAAAAAAAAA' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('too_long');
  });

  it('refuses a code the partner already holds as current', () => {
    const registry = [row('TOMASZ', P1, 'current')];
    const outcome = evaluateCodeClaim({ registry, partnerId: P1, rawCode: 'TOMASZ' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('already_current');
  });
});

describe('CS2/CS7 — replacing a code demotes the old one to an alias', () => {
  const registry = [row('TOMASZ', P1, 'current'), row('GELATTI24', P1, 'current')];

  it('produces an alias row for the outgoing code and a current row for the incoming one', () => {
    const result = replaceCurrentCode({
      registry,
      partnerId: P1,
      outgoingRawCode: 'TOMASZ',
      incomingRawCode: 'TOMASZPL',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { code: 'TOMASZ', partnerId: P1, state: 'alias' },
      { code: 'TOMASZPL', partnerId: P1, state: 'current' },
    ]);
  });

  it('lets a partner at the 3-code ceiling swap one code', () => {
    const full = [
      row('AAAAA', P1, 'current'),
      row('BBBBB', P1, 'current'),
      row('CCCCC', P1, 'current'),
    ];
    const result = replaceCurrentCode({
      registry: full,
      partnerId: P1,
      outgoingRawCode: 'CCCCC',
      incomingRawCode: 'DDDDD',
    });
    expect(result.ok).toBe(true);
  });

  it('refuses to replace a code the partner does not currently hold', () => {
    const result = replaceCurrentCode({
      registry,
      partnerId: P1,
      outgoingRawCode: 'NIEMOJE',
      incomingRawCode: 'NOWYKOD',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('outgoing_not_current');
  });

  it("refuses to replace another partner's code", () => {
    const mixed = [row('TOMASZ', P2, 'current')];
    const result = replaceCurrentCode({
      registry: mixed,
      partnerId: P1,
      outgoingRawCode: 'TOMASZ',
      incomingRawCode: 'NOWYKOD',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('outgoing_not_current');
  });

  it('refuses when the incoming code belongs to somebody else', () => {
    const mixed = [row('TOMASZ', P1, 'current'), row('ZAJETY', P2, 'alias')];
    const result = replaceCurrentCode({
      registry: mixed,
      partnerId: P1,
      outgoingRawCode: 'TOMASZ',
      incomingRawCode: 'ZAJETY',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('held_by_another_partner');
  });

  it('lets a partner swap back to their own earlier alias', () => {
    const withAlias = [row('STARY', P1, 'alias'), row('TOMASZ', P1, 'current')];
    const result = replaceCurrentCode({
      registry: withAlias,
      partnerId: P1,
      outgoingRawCode: 'TOMASZ',
      incomingRawCode: 'STARY',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toContainEqual({ code: 'STARY', partnerId: P1, state: 'current' });
      expect(result.rows).toContainEqual({ code: 'TOMASZ', partnerId: P1, state: 'alias' });
    }
  });

  it('never mutates the input registry', () => {
    const input = [row('TOMASZ', P1, 'current')];
    const snapshot = JSON.stringify(input);
    replaceCurrentCode({
      registry: input,
      partnerId: P1,
      outgoingRawCode: 'TOMASZ',
      incomingRawCode: 'NOWYKOD',
    });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('CS4 — reservedCodeSet feeds collision-free suggestions', () => {
  it('includes current, alias and blocked codes from every partner', () => {
    const registry = [
      row('TOMASZ', P1, 'current'),
      row('STARY', P1, 'alias'),
      row('BADONE', P2, 'blocked'),
      row('MARIA1', P2, 'current'),
    ];
    expect(reservedCodeSet(registry)).toEqual(new Set(['TOMASZ', 'STARY', 'BADONE', 'MARIA1']));
  });

  it('normalizes what it reserves', () => {
    expect(reservedCodeSet([row('tomasz', P1, 'alias')]).has('TOMASZ')).toBe(true);
  });
});
