import { describe, expect, it } from 'vitest';
import { affiliateCopyEn, affiliateCopyPl, fillTemplate, resolveAffiliateCopy } from './affiliate';

const keyPaths = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => keyPaths(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      keyPaths(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
};

const allText = JSON.stringify([affiliateCopyPl, affiliateCopyEn]);

describe('affiliate copy', () => {
  it('keeps both locales on identical key sets', () => {
    expect(keyPaths(affiliateCopyEn).sort()).toEqual(keyPaths(affiliateCopyPl).sort());
  });

  it('resolves Polish by default and English on request', () => {
    expect(resolveAffiliateCopy()).toBe(affiliateCopyPl);
    expect(resolveAffiliateCopy('en')).toBe(affiliateCopyEn);
  });

  // D01 — the promise is precise, never a vague forever-income claim.
  it('never promises lifetime or guaranteed income', () => {
    expect(allText).not.toMatch(/lifetime|dożywotni|na zawsze|forever/i);
    expect(allText).not.toMatch(/gwarantujemy|guaranteed|zarobisz|you will earn/i);
    expect(allText).not.toMatch(/pasywny dochód|passive income/i);
  });

  // D02 — it must say what actually pays: successful, paid renewals.
  it('states that commission comes from successful paid renewals', () => {
    expect(affiliateCopyPl.recurring.body).toMatch(/odnowieni/i);
    expect(affiliateCopyPl.recurring.body).toMatch(/opłacon/i);
    expect(affiliateCopyPl.hero.titleLine2).toMatch(/odnowieniu/i);
    expect(affiliateCopyPl.recurring.honest).toMatch(/nieudana|zwrócona|nieopłacona/i);
  });

  // D03 — attribution is explained in customer words.
  it('explains attribution simply', () => {
    expect(affiliateCopyPl.hero.lede).toMatch(/przypisan/i);
    expect(affiliateCopyPl.recurring.steps.some((step) => /przypisan/i.test(step.title))).toBe(
      true,
    );
  });

  // D06 / C09 — Elite carries no public number anywhere.
  it('never states an Elite rate', () => {
    for (const copy of [affiliateCopyPl, affiliateCopyEn]) {
      const eliteText = JSON.stringify([
        copy.rates.eliteName,
        copy.rates.eliteTerms,
        copy.rates.eliteTalk,
        copy.rates.eliteBody,
        copy.rates.eliteCta,
        copy.calculator.eliteState,
        copy.calculator.eliteCta,
      ]);
      expect(eliteText).not.toMatch(/\d/);
    }
    expect(affiliateCopyPl.rates.eliteTerms).toBe('Indywidualne warunki.');
    expect(affiliateCopyPl.rates.eliteTalk).toBe('Porozmawiajmy.');
  });

  // C07 / C08 / E08 — no rate may be typed into copy at all; the page reads
  // every figure from publicRateAuthority at render time.
  it('contains no euro amount and no rate figure', () => {
    expect(allText).not.toMatch(/\d+[.,]\d{2}\s?(€|EUR|eur)/);
    expect(allText).not.toMatch(/(€|EUR)\s?\d/);
    for (const rate of ['1,99', '4,99', '2,49', '5,99', '1.99', '4.99', '2.49', '5.99']) {
      expect(allText).not.toContain(rate);
    }
  });

  // D05 — the Gold threshold is interpolated from the canonical authority,
  // never written into a Polish sentence.
  it('parameterises the Gold threshold instead of hardcoding 100', () => {
    expect(affiliateCopyPl.rates.goldBlurbTemplate).toContain('{threshold}');
    expect(affiliateCopyPl.rates.goldBadgeTemplate).toContain('{threshold}');
    expect(affiliateCopyEn.rates.goldBlurbTemplate).toContain('{threshold}');
    expect(allText).not.toMatch(/\b100\b/);
  });

  // D07 — no internal vocabulary may surface to a customer.
  it('never leaks internal or backend terminology', () => {
    const forbidden = [
      /partner_/i,
      /commission_entries/i,
      /referral_attributions/i,
      /supabase/i,
      /\bRLS\b/,
      /\bSQL\b/,
      /\bRPC\b/i,
      /solver/i,
      /mapper/i,
      /\bPI-ING\b/,
      /stripe/i,
      /webhook/i,
      /snake_case/i,
      /jsonb/i,
      /\bDB\b/,
      /more_information/i,
      /under_review/i,
      /\btier\b/i,
      /livemode/i,
    ];
    for (const pattern of forbidden) {
      expect(allText).not.toMatch(pattern);
    }
  });

  // The public page is not the dashboard: it must not imply it shows anyone's
  // private figures.
  it('exposes no private affiliate data vocabulary on the public sections', () => {
    const publicSections = JSON.stringify([
      affiliateCopyPl.hero,
      affiliateCopyPl.recurring,
      affiliateCopyPl.rates,
      affiliateCopyPl.audience,
      affiliateCopyPl.how,
    ]);
    expect(publicSections).not.toMatch(/wypłat|payout|IBAN|konto bankowe/i);
  });

  it('fills templates and leaves unknown tokens visible', () => {
    expect(fillTemplate('od {threshold} klientów', { threshold: 100 })).toBe('od 100 klientów');
    expect(fillTemplate('{current} / {threshold}', { current: 76, threshold: 100 })).toBe(
      '76 / 100',
    );
    expect(fillTemplate('{missing}', {})).toBe('{missing}');
  });
});
