import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogVerificationBadge } from './CatalogVerificationBadge';

/**
 * OWNER DECISION (2026-08-30). This badge used to describe its own COLOUR —
 * „GREEN · dane etykiety zweryfikowane" / „BLUE · dane manualne,
 * niezweryfikowane" — and painted the second one in a blue the Gellatti palette
 * does not contain. The contract that mattered is preserved and made stricter:
 * provenance is still explicit and still never carried by colour alone, but the
 * words now name the STATE, and no customer-facing string names a colour.
 */
describe('CatalogVerificationBadge', () => {
  const verified = () =>
    renderToStaticMarkup(<CatalogVerificationBadge status="verified" tone="dark" />);
  const manual = () =>
    renderToStaticMarkup(<CatalogVerificationBadge status="manual_unverified" tone="light" />);

  it('states provenance in words, never by colour alone', () => {
    expect(verified()).toContain('data-catalog-verification="verified"');
    expect(verified()).toContain('Zweryfikowany');
    expect(verified()).toContain('✓');
    expect(verified()).toContain('ZWERYFIKOWANE · dane z etykiety');

    expect(manual()).toContain('data-catalog-verification="manual_unverified"');
    expect(manual()).toContain('Dodany manualnie');
    expect(manual()).toContain('✎');
    expect(manual()).toContain('DO WERYFIKACJI · dane wprowadzone ręcznie');
  });

  it('names no colour in customer-facing copy', () => {
    // The permanent Gellatti language rule: copy describes the state, not an
    // internal implementation detail or a colour code.
    for (const html of [verified(), manual()]) {
      for (const colour of ['GREEN', 'BLUE', 'ZIELON', 'NIEBIESK']) {
        expect(html).not.toContain(colour);
      }
    }
  });

  it('takes the unverified tone from the attention tokens, not a blue', () => {
    const html = manual();
    expect(html).toContain('var(--g-attention-ink)');
    expect(html).toContain('var(--g-attention-surface)');
    // The palette has no blue: the old hues and Tailwind's slate are both gone.
    for (const stale of ['#a9b4c7', '#dbe3ef', 'slate-']) {
      expect(html).not.toContain(stale);
    }
  });
});
