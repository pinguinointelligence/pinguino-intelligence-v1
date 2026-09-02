import { describe, expect, it } from 'vitest';
import {
  ALL_COMMUNITY_EVENTS,
  COMMUNITY_EVENTS,
  PARTNER_EVENTS,
  SHARE_EVENTS,
  assertEventPayloadSafe,
  eventPayloadViolations,
} from './analyticsEvents';

describe('§47 — the event catalogue is closed and carries no personal data', () => {
  it('covers every event the spec names, with no duplicates', () => {
    expect(COMMUNITY_EVENTS).toHaveLength(6);
    expect(SHARE_EVENTS).toHaveLength(8);
    expect(PARTNER_EVENTS).toHaveLength(6);
    expect(new Set(ALL_COMMUNITY_EVENTS).size).toBe(ALL_COMMUNITY_EVENTS.length);
    expect(ALL_COMMUNITY_EVENTS).toContain('shared_recipe_subscription_attributed');
    expect(ALL_COMMUNITY_EVENTS).toContain('partner_commission_reversed');
  });

  it('accepts an id-and-count payload', () => {
    expect(
      eventPayloadViolations({ publication_id: 'pub-1', version_number: 3, attributed: true }),
    ).toEqual([]);
  });

  it('refuses personal data', () => {
    const violations = eventPayloadViolations({ email: 'a@b.c', handle: 'marysia' });
    expect(violations.map((violation) => violation.key).sort()).toEqual(['email', 'handle']);
    expect(violations.every((violation) => violation.reason === 'personal_data')).toBe(true);
  });

  it('refuses a formulation leaking through telemetry (§16)', () => {
    const violations = eventPayloadViolations({ planned_grams: 512 });
    expect(violations).toEqual([{ key: 'planned_grams', reason: 'formulation_leak' }]);
    expect(() => assertEventPayloadSafe('shared_recipe_opened', { planned_grams: 512 })).toThrow(
      /unsafe analytics payload/,
    );
  });

  it('never lets a raw share token be logged', () => {
    expect(eventPayloadViolations({ share_token: 'abc' })).toEqual([
      { key: 'share_token', reason: 'personal_data' },
    ]);
  });
});
