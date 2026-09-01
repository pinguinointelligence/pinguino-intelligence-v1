import { describe, expect, it } from 'vitest';

import {
  MAX_SUBJECT_LENGTH,
  OPERATIONAL_SUBJECTS,
  buildCustomerSubject,
  buildEmailMetadata,
  buildOperationalSubject,
  buildSubjectPrefix,
  joinIdentifierParts,
  sanitizeSubjectIdentifier,
  type OperationalSubjectKey,
} from './emailSubject';

const KEYS = Object.keys(OPERATIONAL_SUBJECTS) as OperationalSubjectKey[];

describe("ES1/ES6 — the owner's documented subjects are reproduced exactly", () => {
  // Every example the owner wrote in the correction, asserted literally.
  const OWNER_EXAMPLES: ReadonlyArray<readonly [OperationalSubjectKey, string]> = [
    ['partnerApplicationNew', '[GELLATTI][PARTNER][APPLICATION][NEW]'],
    ['partnerApplicationMoreInfo', '[GELLATTI][PARTNER][APPLICATION][MORE-INFO]'],
    ['partnerApplicationApproved', '[GELLATTI][PARTNER][APPLICATION][APPROVED]'],
    ['partnerConnectActionRequired', '[GELLATTI][PARTNER][CONNECT][ACTION-REQUIRED]'],
    ['partnerPayoutReady', '[GELLATTI][PARTNER][PAYOUT][READY]'],
    ['partnerPayoutFailed', '[GELLATTI][PARTNER][PAYOUT][FAILED]'],
    ['partnerRefundReversal', '[GELLATTI][PARTNER][REFUND][REVERSAL]'],
    ['machineInquiryNew', '[GELLATTI][MACHINE][INQUIRY][NEW]'],
    ['mobileInquiryNew', '[GELLATTI][MOBILE][INQUIRY][NEW]'],
    ['trailerInquiryNew', '[GELLATTI][TRAILER][INQUIRY][NEW]'],
    ['franchiseInquiryNew', '[GELLATTI][FRANCHISE][INQUIRY][NEW]'],
    ['referralReward', '[GELLATTI][REFERRAL][REWARD]'],
    ['referralReversal', '[GELLATTI][REFERRAL][REVERSAL]'],
  ];

  for (const [key, expected] of OWNER_EXAMPLES) {
    it(`${key} → ${expected}`, () => {
      expect(buildOperationalSubject({ key, environment: 'production' })).toBe(expected);
    });
  }

  it("reproduces the owner's two full worked examples", () => {
    expect(
      buildOperationalSubject({
        key: 'trailerInquiryNew',
        identifier: joinIdentifierParts('Spain', 'V4B', 'ES-2026-00142'),
        environment: 'production',
      }),
    ).toBe('[GELLATTI][TRAILER][INQUIRY][NEW] Spain · V4B · ES-2026-00142');

    expect(
      buildOperationalSubject({
        key: 'partnerApplicationNew',
        identifier: joinIdentifierParts('GelatoConAnna', 'Italy'),
        environment: 'production',
      }),
    ).toBe('[GELLATTI][PARTNER][APPLICATION][NEW] GelatoConAnna · Italy');
  });
});

describe('ES6 — the taxonomy is a closed, exhaustive set', () => {
  it('every declared key produces a subject', () => {
    for (const key of KEYS) {
      expect(buildOperationalSubject({ key, environment: 'production' }), key).toMatch(
        /^\[GELLATTI\]/,
      );
    }
  });

  it('covers all four inquiry areas required by the product architecture', () => {
    const inquiryAreas = KEYS.filter((k) => OPERATIONAL_SUBJECTS[k].event === 'INQUIRY').map(
      (k) => OPERATIONAL_SUBJECTS[k].area,
    );
    expect(new Set(inquiryAreas)).toEqual(new Set(['MACHINE', 'MOBILE', 'TRAILER', 'FRANCHISE']));
  });

  it('every subject begins with the GELLATTI root token', () => {
    for (const key of KEYS) {
      expect(
        buildOperationalSubject({ key, environment: 'production' }).startsWith('[GELLATTI]'),
      ).toBe(true);
    }
  });

  it('produces a unique prefix for every key — no two events collide in a filter', () => {
    const prefixes = KEYS.map((k) => buildSubjectPrefix(OPERATIONAL_SUBJECTS[k], 'production'));
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('ES2 — prefixes are stable across languages', () => {
  it('a localized identifier never alters the bracket prefix', () => {
    const pl = buildOperationalSubject({
      key: 'franchiseInquiryNew',
      identifier: 'Kraków · Lokal firmowy',
      environment: 'production',
    });
    const en = buildOperationalSubject({
      key: 'franchiseInquiryNew',
      identifier: 'Krakow · Company location',
      environment: 'production',
    });
    const prefix = '[GELLATTI][FRANCHISE][INQUIRY][NEW]';
    expect(pl.startsWith(prefix)).toBe(true);
    expect(en.startsWith(prefix)).toBe(true);
  });

  it('prefix tokens are ASCII uppercase only, so filters are never accent-sensitive', () => {
    for (const key of KEYS) {
      const prefix = buildSubjectPrefix(OPERATIONAL_SUBJECTS[key], 'production');
      expect(prefix, key).toMatch(/^(\[[A-Z-]+\])+$/);
    }
  });
});

describe('ES4 — non-production is marked in the subject', () => {
  it('marks staging', () => {
    expect(buildOperationalSubject({ key: 'partnerPayoutReady', environment: 'staging' })).toBe(
      '[GELLATTI][PARTNER][PAYOUT][READY][STAGING]',
    );
  });

  it('marks development', () => {
    expect(buildOperationalSubject({ key: 'partnerPayoutReady', environment: 'development' })).toBe(
      '[GELLATTI][PARTNER][PAYOUT][READY][DEVELOPMENT]',
    );
  });

  it('leaves production unmarked', () => {
    expect(
      buildOperationalSubject({ key: 'partnerPayoutReady', environment: 'production' }),
    ).not.toContain('PRODUCTION');
  });

  it('marks a customer-facing subject off production too', () => {
    expect(
      buildCustomerSubject({
        localizedSubject: 'Twoje zgłoszenie dotarło',
        environment: 'staging',
      }),
    ).toBe('[STAGING] Twoje zgłoszenie dotarło');
  });
});

describe('ES5 — identifier sanitisation and header-injection defence', () => {
  it('strips CR and LF so a header cannot be injected', () => {
    const subject = buildOperationalSubject({
      key: 'partnerApplicationNew',
      identifier: 'Anna\r\nBcc: attacker@example.com',
      environment: 'production',
    });
    expect(subject).not.toContain('\r');
    expect(subject).not.toContain('\n');
    expect(subject).toBe('[GELLATTI][PARTNER][APPLICATION][NEW] Anna Bcc: attacker@example.com');
  });

  it('strips control characters', () => {
    expect(sanitizeSubjectIdentifier('a\u0000b\u0007c')).toBe('abc');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(sanitizeSubjectIdentifier('  Spain    ·   V4B  ')).toBe('Spain · V4B');
  });

  it('never exceeds the maximum subject length', () => {
    const subject = buildOperationalSubject({
      key: 'trailerInquiryNew',
      identifier: 'x'.repeat(500),
      environment: 'production',
    });
    expect(subject.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
  });

  it('truncation removes identifier characters, never prefix tokens', () => {
    const subject = buildOperationalSubject({
      key: 'trailerInquiryNew',
      identifier: 'y'.repeat(500),
      environment: 'production',
    });
    // the whole bracket prefix must survive so the filter still matches
    expect(subject.startsWith('[GELLATTI][TRAILER][INQUIRY][NEW]')).toBe(true);
    expect(subject.endsWith('…')).toBe(true);
  });

  it('omits the separator entirely when there is no identifier', () => {
    expect(buildOperationalSubject({ key: 'referralReward', environment: 'production' })).toBe(
      '[GELLATTI][REFERRAL][REWARD]',
    );
  });

  it('treats a whitespace-only identifier as absent', () => {
    expect(
      buildOperationalSubject({
        key: 'referralReward',
        identifier: '   ',
        environment: 'production',
      }),
    ).toBe('[GELLATTI][REFERRAL][REWARD]');
  });
});

describe('joinIdentifierParts', () => {
  it('joins with the owner’s middle-dot separator', () => {
    expect(joinIdentifierParts('Spain', 'V4B', 'ES-2026-00142')).toBe(
      'Spain · V4B · ES-2026-00142',
    );
  });

  it('drops empty, null and undefined parts rather than leaving gaps', () => {
    expect(joinIdentifierParts('Spain', null, undefined, '', 'ES-1')).toBe('Spain · ES-1');
  });

  it('returns an empty string when nothing usable is supplied', () => {
    expect(joinIdentifierParts(null, undefined, '  ')).toBe('');
  });
});

describe('ES3 — metadata is additional, never the routing authority', () => {
  it('carries the four documented fields', () => {
    expect(
      buildEmailMetadata({ key: 'machineInquiryNew', entityId: 'lead-42', environment: 'staging' }),
    ).toEqual({ area: 'MACHINE', event: 'INQUIRY', entity_id: 'lead-42', environment: 'staging' });
  });

  it('is frozen', () => {
    const meta = buildEmailMetadata({
      key: 'machineInquiryNew',
      entityId: 'lead-42',
      environment: 'production',
    });
    expect(Object.isFrozen(meta)).toBe(true);
  });

  it('the subject alone still identifies the message without any metadata', () => {
    // ES3: filtering must never DEPEND on the custom header.
    for (const key of KEYS) {
      const subject = buildOperationalSubject({ key, environment: 'production' });
      const meta = buildEmailMetadata({ key, entityId: 'x', environment: 'production' });
      expect(subject, key).toContain(`[${meta.area}]`);
      expect(subject, key).toContain(`[${meta.event}]`);
    }
  });
});

describe('ES7 — customer subjects carry no internal taxonomy', () => {
  it('has no bracket prefix in production', () => {
    const subject = buildCustomerSubject({
      localizedSubject: 'Twoje zgłoszenie do programu Partner dotarło',
      environment: 'production',
    });
    expect(subject).toBe('Twoje zgłoszenie do programu Partner dotarło');
    expect(subject).not.toContain('[GELLATTI]');
  });

  it('keeps the customer subject within the length ceiling', () => {
    const subject = buildCustomerSubject({
      localizedSubject: 'z'.repeat(400),
      environment: 'production',
    });
    expect(subject.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
  });

  it('sanitises customer subjects too', () => {
    expect(
      buildCustomerSubject({ localizedSubject: 'Cześć\r\nBcc: x@y.z', environment: 'production' }),
    ).toBe('Cześć Bcc: x@y.z');
  });
});
