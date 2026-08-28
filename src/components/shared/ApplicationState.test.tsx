import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApplicationState } from './ApplicationState';
import { EmptyState } from './EmptyState';

describe('ApplicationState', () => {
  it('announces loading and exposes the busy state', () => {
    const html = renderToStaticMarkup(<ApplicationState kind="loading" title="Wczytuję dane…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-application-state="loading"');
  });

  it('announces a failed read as an alert', () => {
    const html = renderToStaticMarkup(<ApplicationState kind="error" title="Brak połączenia" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-application-state="error"');
  });

  it('keeps the existing EmptyState API on the shared state family', () => {
    const html = renderToStaticMarkup(<EmptyState title="Brak receptur" body="Dodaj pierwszą." />);
    expect(html).toContain('data-application-state="empty"');
    expect(html).toContain('Brak receptur');
    expect(html).toContain('Dodaj pierwszą.');
  });
});
