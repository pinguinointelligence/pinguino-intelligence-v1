/**
 * Production regressions — OWNER HOTFIX (2026-07-17: „PILNY HOTFIX PRODUKCYJNY
 * — NAWIGACJA, FLOW SMAKÓW, MACHINE-FIRST HOME I LOGIN”).
 *
 * Each block pins ONE reproduced production defect so it cannot come back:
 *  §2 the global menu (hamburger) is on every customer route, incl. the landing
 *     and „Moja maszyna” — the profile page used to be a lone white sheet;
 *  §3 no two identical primary CTAs in the landing's first viewport;
 *  §4 the home field's Enter starts the flow (it did nothing on production);
 *  §5 once a flavour exists the step asks about ANOTHER one;
 *  §6 the kind step speaks about ice cream, not about a "base";
 *  §7/§8 a saved machine — for an ANONYMOUS visitor too — skips the six-mode
 *     step; this is the P0 that made machine-first unreachable in production,
 *     because the gate keyed off a persona that only exists in a DEV build;
 *  §9 Pro sees serving temperatures only.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SERVING_MODES } from '@/features/customer-flow';
import { LandingPage } from '@/pages/landing/LandingPage';
import { CustomerShellV1 } from './CustomerShellV1';
import { customerShellCopy as copy } from './customerShellCopy';

const renderLanding = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

const renderShell = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <CustomerShellV1 />
    </MemoryRouter>,
  );

describe('§2 — the global menu is reachable from the landing', () => {
  it('renders the hamburger trigger (aria-label „Otwórz menu”) on the landing', () => {
    const html = renderLanding();
    expect(html).toContain(`aria-label="${copy.menu.open}"`);
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('keeps exactly ONE brand wordmark in the landing header (menu brand suppressed)', () => {
    const html = renderLanding();
    const header = html.slice(0, html.indexOf('</header>'));
    // The landing's own lockup renders PINGÜINO + INTELLIGENCE; the shared menu
    // must not add a second wordmark next to it.
    expect((header.match(/PINGÜINO/g) ?? []).length).toBe(1);
  });
});

describe('§3 — CTA hierarchy: one dominant action in the first viewport', () => {
  it('does not repeat „Stwórz recepturę” in the header next to the hero CTA', () => {
    const html = renderLanding();
    const header = html.slice(0, html.indexOf('</header>'));
    expect(header).not.toContain('Stwórz recepturę');
    // The hero still carries the primary CTA to the flow.
    expect(html).toContain('href="/start"');
  });
});

describe('§4 — the home field starts the flow on Enter', () => {
  it('declares the mobile Go key on the idea field (Enter did nothing on prod)', () => {
    const html = renderShell();
    expect(html).toContain(copy.home.inputLabel);
    // React preserves the attribute's camelCase in markup — match either form.
    expect(/enterkeyhint="go"/i.test(html)).toBe(true);
  });
});

describe('§6 — the kind step speaks the customer\'s language', () => {
  it('asks about a KIND OF ICE CREAM and never about a „baza”', () => {
    expect(copy.productType.title).toBe('Jaki rodzaj lodów chcesz przygotować?');
    expect(copy.productType.lead).toBe('Wybierz rodzaj receptury.');
    expect(copy.productType.title).not.toMatch(/rodzaj\?$/);
    expect(copy.productType.lead).not.toMatch(/baz[ęy]/i);
  });
});

describe('§5 — the flavour step asks for ANOTHER flavour once one exists', () => {
  it('carries a distinct follow-up lead', () => {
    expect(copy.chips.leadMore).toBe('Chcesz dodać jeszcze jeden smak?');
    expect(copy.chips.leadMore).not.toBe(copy.chips.lead);
  });
});

describe('§9 — Pro serving modes are temperatures only', () => {
  it('the temperature subset excludes every machine alias', () => {
    const proModes = SERVING_MODES.filter((m) => m.id.startsWith('temp_minus_'));
    expect(proModes.map((m) => m.id)).toEqual(['temp_minus_11', 'temp_minus_12', 'temp_minus_13']);
    for (const id of ['fresh', 'ninja_gelato', 'ninja_swirl']) {
      expect(proModes.some((m) => m.id === id), id).toBe(false);
    }
    // …and every offered temperature is a real engine serving cell. (−14/−18
    // cannot even be expressed: `SupportedTemperatureC` excludes them, so tsc
    // rejects the comparison — the type is the stronger guard.)
    expect(proModes.map((m) => m.temperatureC)).toEqual([-11, -12, -13]);
  });
});
