import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

let persona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => persona,
}));

const { AccountSettingsPage, HowItWorksPage, ProductsHubPage, ProductionHubPage, FranchisePage } =
  await import('./GlobalDestinationPages');

const render = (element: ReactNode, path = '/') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('canonical global destination hubs', () => {
  beforeEach(() => {
    persona = 'pro';
  });

  it('explains one simple public flow without exposing internal tools', () => {
    const html = render(<HowItWorksPage />);
    for (const step of ['Pomysł', 'Składniki', 'Gellatti', 'Receptura', 'Produkcja']) {
      expect(html).toContain(step);
    }
    expect(html).not.toMatch(/API|Mapper|readiness/i);
  });

  it('keeps Franchise separate from the Collaboration destination', () => {
    const html = render(<FranchisePage />, '/franchise');
    expect(html).toContain('Zapytaj o Franchise');
    expect(html).not.toContain('href="/work-with-us"');
  });

  it('consolidates customer product intake under one Products destination', () => {
    persona = 'home';
    const html = render(<ProductsHubPage />, '/products');
    expect(html).toContain('Katalog produktów');
    expect(html).toContain('href="/products/scan"');
    expect(html).not.toContain('href="/products/import"');
    expect(html).toContain('Skanuj produkt');
    expect(html).toContain('Katalog Gellatti');
    expect(html).toContain('★ Ulubione');
  });

  it('exposes one Pro Production hub with Current, History and Labels', () => {
    const html = render(<ProductionHubPage />, '/production');
    expect(html).toContain('data-testid="production-tab-current"');
    expect(html).toContain('data-testid="production-tab-history"');
    expect(html).toContain('data-testid="production-tab-labels"');
    expect(html).toContain('data-testid="production-current"');
    expect(render(<ProductionHubPage />, '/production?tab=history')).toContain(
      'data-testid="production-history"',
    );
    expect(render(<ProductionHubPage />, '/production?tab=labels')).toContain(
      'data-testid="production-labels"',
    );
  });

  it('keeps Production gated from Home without pretending it works', () => {
    persona = 'home';
    const html = render(<ProductionHubPage />, '/production');
    expect(html).toContain('Produkcja jest dostępna w planie Pro');
    expect(html).not.toContain('data-testid="production-current"');
  });

  it('keeps the account page shallow and does not duplicate Product or Machine settings', () => {
    const html = render(<AccountSettingsPage />, '/account');
    expect(html).toContain('Profil');
    expect(html).toContain('Plan i płatności');
    expect(html).toContain('Język');
    expect(html).toContain('Bezpieczeństwo');
    expect(html).not.toContain('Twoje produkty');
    expect(html).not.toContain('Domyślna maszyna');
  });
});
