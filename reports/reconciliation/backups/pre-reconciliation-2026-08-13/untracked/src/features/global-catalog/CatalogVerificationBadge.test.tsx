import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogVerificationBadge } from './CatalogVerificationBadge';

describe('CatalogVerificationBadge', () => {
  it('keeps GREEN and BLUE provenance explicit without relying on color alone', () => {
    const verified = renderToStaticMarkup(
      <CatalogVerificationBadge status="verified" tone="dark" />,
    );
    const manual = renderToStaticMarkup(
      <CatalogVerificationBadge status="manual_unverified" tone="light" />,
    );

    expect(verified).toContain('data-catalog-verification="verified"');
    expect(verified).toContain('Zweryfikowany');
    expect(verified).toContain('✓');
    expect(verified).toContain('dane etykiety zweryfikowane');
    expect(manual).toContain('data-catalog-verification="manual_unverified"');
    expect(manual).toContain('Dodany manualnie');
    expect(manual).toContain('✎');
    expect(manual).toContain('dane manualne, niezweryfikowane');
  });
});
