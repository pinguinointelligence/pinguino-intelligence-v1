/// <reference types="node" />
/**
 * C-APP-02 / C-APP-03 — the application asks for what the decision needs, and
 * nothing more.
 *
 * C-APP-03 ("asks for no unnecessary private information") is the kind of rule
 * that quietly rots: a later field is always easy to justify one at a time. So
 * it is a guard rather than a promise. The list below is deliberately blunt —
 * if a field genuinely becomes necessary, this test should be changed in the
 * same commit that adds it, with the reason in the message.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cooperationCopyPl, cooperationCopyEn } from '@/copy/cooperation';

const panel = readFileSync(new URL('./PartnerApplicationPanel.tsx', import.meta.url), 'utf8');

describe('C-APP-02: the application captures what the decision needs', () => {
  it('asks for identity, reach, channels, plan and consent', () => {
    for (const key of [
      'displayName', //   public/creator name
      'country',
      'languages',
      'platforms', //     platform selection
      'primaryLink', //   platform URL
      'otherLinks', //    site / blog / newsletter
      'audience', //      audience / topic
      'audienceSize',
      'note', //          description + promotion plan
      'proposedSlug', //  code suggestion
      'consent',
    ] as const) {
      expect(panel, `${key} must be on the form`).toContain(`c.form.${key}`);
    }
  });

  it('every field is offered in both locales', () => {
    expect(Object.keys(cooperationCopyPl.form).sort()).toEqual(
      Object.keys(cooperationCopyEn.form).sort(),
    );
  });

  it('audience size is a band, never an exact number', () => {
    // An exact follower count is more personal data than a tier decision uses.
    expect(panel).toContain('audienceSizeOptions');
    expect(panel).not.toMatch(/type="number"/);
    for (const copy of [cooperationCopyPl, cooperationCopyEn]) {
      expect(copy.form.audienceSizeOptions.length).toBeGreaterThan(2);
      // The empty option is the unselected state; the rest must be ranges.
      for (const option of copy.form.audienceSizeOptions.slice(1)) {
        expect(option.value).toMatch(/^(under_|over_|\d)/);
      }
    }
  });

  it('consent is required, and never pre-ticked', () => {
    expect(panel).toContain('draft.consent === true');
    // Submit is gated on it, so it cannot become a decorative sentence.
    expect(panel).toMatch(/canSubmit[\s\S]{0,200}draft\.consent === true/);
    // The initial draft must start unchecked.
    expect(panel).toMatch(/consent:\s*false/);
  });
});

describe('C-APP-03: no unnecessary private information', () => {
  /**
   * None of these is needed to decide whether someone may promote Gellatti.
   * Payout identity is collected LATER by Stripe Connect, which is the party
   * that actually needs it — this form must never become a second place where
   * that data sits.
   */
  const FORBIDDEN: readonly [RegExp, string][] = [
    [/birth|urodz|\bdob\b/i, 'date of birth'],
    [/\baddress\b|adres(?!ie)/i, 'postal address'],
    [/phone|telefon/i, 'phone number'],
    [/\bpesel\b|\bnip\b|\bvat\b|tax[_ ]?id|\bssn\b/i, 'national or tax identifier'],
    [/passport|dowód osobisty|id[_ ]?number/i, 'identity document'],
    [/\biban\b|bank[_ ]?account|numer konta/i, 'bank details'],
    [/salary|income|dochód|zarobki/i, 'income'],
    [/gender|płeć|\bage\b|wiek/i, 'gender or age'],
  ];

  it('the form collects none of them', () => {
    for (const [pattern, what] of FORBIDDEN) {
      expect(panel, `application form must not ask for ${what}`).not.toMatch(pattern);
    }
  });

  it('neither locale offers a label for them', () => {
    for (const copy of [cooperationCopyPl, cooperationCopyEn]) {
      const labels = Object.values(copy.form)
        .flatMap((value) =>
          typeof value === 'string'
            ? [value]
            : Array.isArray(value)
              ? value.map((option) => option.label)
              : [],
        )
        .join(' | ');
      for (const [pattern, what] of FORBIDDEN) {
        expect(labels, `copy must not ask for ${what}`).not.toMatch(pattern);
      }
    }
  });
});
