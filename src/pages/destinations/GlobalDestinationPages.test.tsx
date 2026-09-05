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

  it('renders the eight-step Tour in the one canonical shell without a local header', () => {
    const html = render(<HowItWorksPage />, '/how-it-works?step=7');
    expect(html).toContain('data-testid="knowledge-tour"');
    expect(html).toContain('data-active-step="7"');
    expect(html).toContain('data-owner-asset="07.png"');
    expect(html.match(/class="knowledge-tour__dot"/g)).toHaveLength(8);
    expect(html.match(/data-testid="app-nav-trigger"/g)).toHaveLength(1);
    expect(html.match(/data-testid="home-pro-switch"/g)).toHaveLength(1);
    expect(html.match(/data-logo-source="\/brand\/gellatti-wordmark-graphite.svg"/g)).toHaveLength(
      1,
    );
    expect(html).not.toMatch(/gellatti AI/i);
    expect(html).not.toMatch(/API|Mapper|readiness/i);
    expect(html).not.toContain('DestinationSurface');
  });

  it('selects the exact source ending for Home and Pro while keeping eight steps', () => {
    persona = 'home';
    const home = render(<HowItWorksPage />, '/how-it-works?step=8');
    expect(home).toContain('data-audience="home"');
    expect(home).toContain('data-owner-asset="08.png"');
    expect(home.match(/class="knowledge-tour__dot"/g)).toHaveLength(8);

    persona = 'pro';
    const pro = render(<HowItWorksPage />, '/how-it-works?step=8');
    expect(pro).toContain('data-audience="pro"');
    expect(pro).toContain('data-owner-asset="09.png"');
    expect(pro.match(/class="knowledge-tour__dot"/g)).toHaveLength(8);
  });

  it('keeps Franchise separate from the Collaboration destination', () => {
    const html = render(<FranchisePage />, '/franchise');
    expect(html).toContain('Zapytaj o Franchise');
    expect(html).not.toContain('href="/work-with-us"');
  });

  it('consolidates customer product intake under one Products destination', () => {
    persona = 'home';
    const html = render(<ProductsHubPage />, '/products');
    // V2.1 §5: the destination lockup names the page itself.
    expect(html).toContain('Produkty');
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
