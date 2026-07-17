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

  it('keeps the Slice F Monitor seam (#monitor-demo) with the static §6.2 example', () => {
    const html = render();
    expect(html).toContain('id="monitor-demo"');
    expect(html).toContain(copy.monitor.score); // 9/10 (spec example)
    expect(html).toContain(copy.monitor.verdict); // Świetnie dopasowana (§15.1 wording)
    expect(html).toContain('w optymalnym zakresie');
    expect(html).toContain(copy.monitor.exampleTag); // honestly tagged as an example
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
    // The only score shown is the spec's own §6.2 example, as an integer /10.
    expect(text).toContain('9/10');
    expect(/\d+[.,]\d+\s*\/\s*10/.test(text)).toBe(false); // no decimal scores (§15.1)
  });

  it('is light-first: white paper root, no dark shell classes', () => {
    const html = render();
    expect(html).toContain('bg-paper');
    expect(html).not.toContain('bg-shell');
    expect(html).not.toContain('#0c0d0f');
  });

  it('uses gold ONLY for the optimum readout (owner decision)', () => {
    const html = render();
    const goldTextUses = html.match(/text-gold/g) ?? [];
    expect(goldTextUses.length).toBe(1); // the single golden-range row value
  });
});
