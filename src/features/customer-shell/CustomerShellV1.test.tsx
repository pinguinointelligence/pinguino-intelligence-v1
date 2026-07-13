import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomerShellV1 } from './CustomerShellV1';
import { customerShellCopy as copy } from './customerShellCopy';

/**
 * Light render smoke test (node env, static markup — the repo's convention).
 * Asserts the headline renders and that the initial Demo screen never leaks a
 * digit-gram value (redaction is enforced upstream by buildCustomerRecipeView,
 * so no gram number can appear before a recipe is even requested).
 */
describe('CustomerShellV1', () => {
  it('renders the home headline', () => {
    const html = renderToStaticMarkup(<CustomerShellV1 />);
    expect(html).toContain(copy.home.headline);
    expect(html).toContain('Co dzisiaj robimy?');
  });

  it('shows the example affordance and the voice/text entry', () => {
    const html = renderToStaticMarkup(<CustomerShellV1 />);
    expect(html).toContain(copy.home.tryExample);
    expect(html).toContain(copy.home.placeholder);
    // No SpeechRecognition in node → the mic renders its unavailable state.
    expect(html).toContain(copy.mic.unavailable);
  });

  it('leaks no digit-gram value on the initial Demo screen', () => {
    const html = renderToStaticMarkup(<CustomerShellV1 />);
    // e.g. "620 g" / "5g" — a number immediately bound to a grams unit.
    expect(/\b\d[\d.,]*\s?g\b/.test(html)).toBe(false);
  });
});
