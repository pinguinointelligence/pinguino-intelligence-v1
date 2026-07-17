import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage';
import { landingCopy as copy } from './landingCopy';

/** Node-env static render (repo convention). */
const render = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

describe('LandingPage — public landing per spec §6 (Slice A)', () => {
  it('renders the §6.1 hero verbatim: headline, subline and both CTAs', () => {
    const html = render();
    expect(html).toContain('Idealna receptura. Dopasowana do Twojej maszyny lub temperatury.');
    expect(html).toContain('Wybierz smak, urządzenie lub temperaturę i ilość. PINGÜINO zajmie się resztą.');
    expect(html).toContain(copy.hero.ctaPrimary); // „Stwórz recepturę”
    expect(html).toContain(copy.hero.ctaSecondary); // „Zobacz, jak działa”
  });

  it('routes the primary CTA to /start and the secondary CTA to the how-it-works anchor', () => {
    const html = render();
    expect(html).toContain('href="/start"');
    expect(html).toContain('href="#jak-to-dziala"');
    expect(html).toContain('id="jak-to-dziala"');
  });

  it('mounts the REAL Monitor readout at #monitor-demo (Slice F — no imitation)', () => {
    const html = render();
    expect(html).toContain('id="monitor-demo"');
    expect(html).toContain(copy.monitor.exampleTag); // honestly tagged as an example
    // The REAL engine-driven readout: an integer 1–10 score with the Polish
    // aria pattern, and the §13 trait rows by their consumer names.
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(/\b(10|[1-9])\/10\b/.test(text)).toBe(true);
    expect(html).toContain('na 10'); // ariaText „X na 10 — …"
    for (const trait of ['Słodycz', 'Kremowość', 'Stabilność']) {
      expect(html).toContain(trait);
    }
  });

  it('renders every §6.3 section: how-it-works, Home, Pro, locks, plans, FAQ, footer', () => {
    const html = render();
    expect(html).toContain(copy.how.title);
    expect(html).toContain(copy.homeSection.title);
    expect(html).toContain(copy.proSection.title);
    expect(html).toContain(copy.advantage.title);
    expect(html).toContain(copy.plans.title);
    expect(html).toContain(copy.faq.title);
    expect(html).toContain(copy.footer.tagline);
    // Plan comparison links to the real subscription page.
    expect(html).toContain('href="/subscription"');
  });

  it('invents NO prices and no percent-style certainty (honesty rules)', () => {
    // Visible TEXT only — class attributes legitimately contain % (CSS units).
    const text = render().replace(/<[^>]*>/g, ' ');
    expect(/\d+\s?(zł|PLN|€|\$|EUR|USD)/i.test(text)).toBe(false);
    expect(/\d+\s?%/.test(text)).toBe(false);
    // The only score shown is the REAL engine-driven integer /10 (Slice F).
    expect(/\b(10|[1-9])\/10\b/.test(text)).toBe(true);
    expect(/\d+[.,]\d+\s*\/\s*10/.test(text)).toBe(false); // no decimal scores (§15.1)
  });

  it('is light-first: white paper root, no dark shell classes', () => {
    const html = render();
    expect(html).toContain('bg-paper');
    expect(html).not.toContain('bg-shell');
    expect(html).not.toContain('#0c0d0f');
  });

  it('uses gold ONLY inside the Monitor readout (owner decision: optimum only)', () => {
    const html = render();
    // Gold may appear 0+ times depending on the REAL demo result's golden rows,
    // but never outside the monitor demo card: strip the card and assert the
    // rest of the landing carries no gold text at all.
    const monitorStart = html.indexOf('id="monitor-demo"');
    expect(monitorStart).toBeGreaterThan(-1);
    const beforeCard = html.slice(0, monitorStart);
    const afterCard = html.slice(html.indexOf('</section>', monitorStart));
    expect(beforeCard).not.toContain('text-gold');
    expect(afterCard).not.toContain('text-gold');
  });
});
