/**
 * CustomerSurface bottom clearance (owner UX correction §9): the fixed paywall
 * must never overlap content. The surface reserves a spacer sized to the MEASURED
 * bar height (+ gap); until the first measurement it reserves a generous default.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomerSurface } from './CustomerSurface';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('CustomerSurface sticky-CTA clearance', () => {
  it('with a sticky CTA and no measurement yet, reserves a generous default (>= the old 72px)', () => {
    const html = render(
      <CustomerSurface hasStickyCta>
        <p>content</p>
      </CustomerSurface>,
    );
    // Fallback reserve is 148 + 16 = 164px — comfortably clears a captioned two-button bar.
    expect(html).toContain('height:164px');
  });

  it('reserves exactly the measured bar height + gap once known', () => {
    const html = render(
      <CustomerSurface hasStickyCta stickyReservePx={132}>
        <p>content</p>
      </CustomerSurface>,
    );
    expect(html).toContain('height:148px'); // 132 measured + 16 gap
  });

  it('without a sticky CTA, does NOT reserve the tall spacer', () => {
    const html = render(
      <CustomerSurface>
        <p>content</p>
      </CustomerSurface>,
    );
    expect(html).not.toContain('height:164px');
  });
});
