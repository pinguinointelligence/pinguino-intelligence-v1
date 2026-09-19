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

  it('renders the nine-step Tour in the one canonical shell without a local header', () => {
    const html = render(<HowItWorksPage />, '/how-it-works?step=7');
    expect(html).toContain('data-testid="knowledge-tour"');
    expect(html).toContain('data-active-step="7"');
    expect(html).toContain('data-owner-asset="07.png"');
    expect(html.match(/class="knowledge-tour__dot"/g)).toHaveLength(9);
    expect(html.match(/data-testid="app-nav-trigger"/g)).toHaveLength(1);
    expect(html.match(/data-testid="home-pro-switch"/g)).toHaveLength(1);
    expect(html.match(/data-logo-source="\/brand\/gellatti-wordmark-graphite.svg"/g)).toHaveLength(
      1,
    );
    expect(html).not.toMatch(/gellatti AI/i);
    expect(html).not.toMatch(/API|Mapper|readiness/i);
    expect(html).not.toContain('DestinationSurface');
  });

  it('keeps HOME machines at Step 8 and professional production at Step 9 in every mode', () => {
    persona = 'home';
    const home = render(<HowItWorksPage />, '/how-it-works?step=8');
    expect(home).toContain('data-owner-asset="08.png"');
    expect(home.match(/class="knowledge-tour__dot"/g)).toHaveLength(9);

    persona = 'pro';
    const proHomeMachines = render(<HowItWorksPage />, '/how-it-works?step=8');
    expect(proHomeMachines).toContain('data-owner-asset="08.png"');
    expect(proHomeMachines).not.toContain('data-audience=');

    const proProduction = render(<HowItWorksPage />, '/how-it-works?step=9');
    expect(proProduction).toContain('data-owner-asset="09.png"');
    expect(proProduction.match(/class="knowledge-tour__dot"/g)).toHaveLength(9);
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

  /* Production v3 §6 (owner decision 2026-09-18): Partie is one page — the work in
     progress, a quiet way to the production history, and the history itself (paged).
     No fifth tab; the former „Etykiety” tab is the Etykiety section (`/labels`). */
  it('exposes Partie with the work in progress and the production history on one page', () => {
    const html = render(<ProductionHubPage />, '/production');
    expect(html).not.toContain('data-testid="production-tab-');
    expect(html).toContain('data-testid="production-current"');
    expect(html).toContain('data-testid="production-history-jump"');
    expect(html).toContain('id="production-history"');
    expect(html).toContain('data-testid="production-history"');
    expect(render(<ProductionHubPage />, '/production?tab=history')).toContain(
      'data-testid="production-history"',
    );
    // `?tab=labels` lands on Etykiety instead of a second label viewer.
    expect(render(<ProductionHubPage />, '/production?tab=labels')).not.toContain(
      'data-testid="production-labels"',
    );
  });

  it('shows HOME the real batches surface, but no production history and no labels', () => {
    /* OD-32 (Owner, 19.09.2026): a signed-in HOME customer runs real durable batches, so they
       get „W toku" and „Kontynuuj partię" — it is the only way back to a run started on
       another device. What must NOT arrive with it is the PRO history: lot codes, masses and
       label versions are `canViewProductionHistory`, which HOME does not have. */
    persona = 'home';
    const html = render(<ProductionHubPage />, '/production');
    expect(html).toContain('data-testid="production-batches"');
    expect(html).toContain('data-testid="production-current"');
    // The durable in-progress surface, not HOME's old device-local card.
    expect(html).not.toContain('data-testid="production-history"');
    expect(html).not.toContain('data-testid="production-history-jump"');
    expect(html).not.toContain('Otwórz etykietę');
    // Arriving here never creates a batch.
    expect(html).not.toContain('data-testid="production-process"');
  });

  it('gives PRO the production history HOME does not get', () => {
    // The other half of the same rule: without this, gating history proves nothing.
    persona = 'pro';
    const html = render(<ProductionHubPage />, '/production');
    expect(html).toContain('data-testid="production-batches"');
    expect(html).toContain('data-testid="production-history"');
  });

  it('keeps Production gated without a plan', () => {
    persona = 'demo';
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
