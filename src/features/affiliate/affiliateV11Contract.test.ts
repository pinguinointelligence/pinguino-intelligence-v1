import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { affiliateCopyEn, affiliateCopyPl } from '@/copy/affiliate';

const affiliateCopy = { pl: affiliateCopyPl, en: affiliateCopyEn } as const;

/**
 * AFFILIATE LANDING — DESIGN Version 11, section A2 (owner 2026-09-19).
 *
 * Three things this pins, all of which were actually wrong on the served page:
 *
 * 1. ONE application intent, ONE destination. Every „Zgłoś się" used to scroll
 *    to a band further down this page, which then linked to /partner — two hops
 *    to reach a form that exists in exactly one place. The landing sells; the
 *    application lives at /partner#partner-application.
 * 2. NO DEAD ANCHORS. `#affiliate-rates` and `#affiliate-calculator` were ids
 *    nothing pointed at, and `#affiliate-application` lost its caller when the
 *    CTAs were redirected.
 * 3. ONE OFFER IN EVERY LANGUAGE. English advertised „15 months for the price
 *    of 12" beside a „15" figure while Polish advertised 3 extra months beside
 *    a „3" — the same deal described as two different products.
 */
const SRC = join(process.cwd(), 'src');
const page = readFileSync(join(SRC, 'pages', 'destinations', 'AffiliatePage.tsx'), 'utf8');
/** The file with its prose removed: the comments quote what they replaced. */
const code = page.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const APPLICATION = '/partner#partner-application';

describe('every application CTA reaches the one real form', () => {
  it('points at least four actions straight at /partner#partner-application', () => {
    // hero · Elite · individual terms · the closing band
    const hits = code.split(`href="${APPLICATION}"`).length - 1;
    expect(hits).toBeGreaterThanOrEqual(4);
  });

  it('never routes an application intent through a local anchor first', () => {
    expect(code).not.toContain('href="#affiliate-application"');
  });

  it('does not send the applicant to /partner without the form on it', () => {
    expect(code).not.toMatch(/href="\/partner"/);
  });

  it('does not grow a second application form on the landing', () => {
    // There is one application surface in the product, and it is not here.
    expect(code).not.toMatch(/PartnerApplicationPanel|partner-application"\s*>/);
  });
});

describe('no anchor without a caller', () => {
  const idsIn = (source: string) =>
    [...source.matchAll(/id="([a-z0-9-]+)"/g)].map((match) => match[1]!);
  const hrefsIn = (source: string) =>
    [...source.matchAll(/href="#([a-z0-9-]+)"/g)].map((match) => match[1]!);

  it('has retired the ids V11 no longer uses', () => {
    const ids = idsIn(code);
    expect(ids).not.toContain('affiliate-rates');
    expect(ids).not.toContain('affiliate-calculator');
    expect(ids).not.toContain('affiliate-application');
  });

  it('keeps #affiliate-how, which a live action still points at', () => {
    expect(idsIn(code)).toContain('affiliate-how');
    expect(hrefsIn(code)).toContain('affiliate-how');
  });

  it('leaves no in-page link pointing at something that is not there', () => {
    const ids = new Set(idsIn(code));
    for (const target of hrefsIn(code)) {
      expect(ids.has(target), `#${target} has no target on the page`).toBe(true);
    }
  });

  it('names the destination it reaches, in both languages', () => {
    // The hero's second action promised „Jak to działa" and landed on a section
    // headed „Jak działa wynagrodzenie".
    expect(affiliateCopy.pl.cta.secondary).toBe('Jak działa wynagrodzenie');
    expect(affiliateCopy.pl.recurring.eyebrow).toBe('Jak działa wynagrodzenie');
    expect(affiliateCopy.en.cta.secondary).toBe('How commission works');
  });
});

describe('the customer bonus is one offer, compactly stated', () => {
  it('is the same figure in every language', () => {
    for (const locale of ['pl', 'en'] as const) {
      expect(affiliateCopy[locale].customerBenefit.figure).toBe('3');
    }
  });

  it('never advertises the superseded „15 months" framing anywhere', () => {
    const everything = JSON.stringify(affiliateCopy);
    expect(everything).not.toMatch(/15 months/i);
    expect(everything).not.toMatch(/15 miesi/i);
  });

  it('still says the bonus belongs to an ANNUAL plan', () => {
    expect(affiliateCopy.pl.customerBenefit.monthlyNote).toMatch(/roczn/i);
    expect(affiliateCopy.en.customerBenefit.monthlyNote).toMatch(/annual/i);
  });

  it('draws a low band, not the slab it used to be', () => {
    /* V11 `.a-bonus`: 14 px radius, 16/20 padding, a 46 px figure. The corner
       is DECLARED at 14 and SERVES at the canvas's 12, because
       `.gellatti-destination` normalises every `rounded-[Npx]` to its token —
       the same rule every other card on this canvas obeys. */
    expect(code).toMatch(/rounded-\[14px\][^"]*bg-\[#15171b\]/);
    expect(code).toMatch(/text-\[46px\]/);
    // The 104/120 px figure and the 20 px panel are gone.
    expect(code).not.toMatch(/text-\[104px\]|text-\[120px\]/);
  });

  it('stacks on a phone instead of shrinking the band', () => {
    expect(code).toMatch(/flex-col[^"]*sm:flex-row/);
  });
});

describe('the two programmes stay two programmes', () => {
  it('keeps the „Poleć Gellatti" bridge quiet and separate', () => {
    expect(code).toContain('affiliate-referral-bridge');
    expect(code).toContain('/account?section=referral');
  });

  it('never sends a referral visitor into the Affiliate application', () => {
    const bridge = code.slice(code.indexOf('affiliate-referral-bridge'));
    expect(bridge).not.toContain(APPLICATION);
  });
});
