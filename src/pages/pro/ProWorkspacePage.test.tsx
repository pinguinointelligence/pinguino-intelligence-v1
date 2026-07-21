/**
 * PINGÜINO Pro workspace (/pro) — S3 contract.
 *
 * Static-markup render (node env, no DOM). The runtime persona is mocked directly (rather
 * than poking the zustand store, whose alias/relative import identity is not stable under
 * vitest) so the gate is deterministic: non-Pro personas see the honest PINGÜINO Pro upsell
 * (no workspace); Pro sees the full 9-tab nav. Deep-linked tabs surface the REAL version
 * section and HONEST backend/"arrives later" states — never a fabricated screen.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

let mockPersona: ProCorePersona = 'pro';
// Mocked by resolved module id → covers both the '@/...' and relative importers of the hook.
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

const { ProWorkspacePage } = await import('./ProWorkspacePage');

const w = copy.proWorkspace;

const renderAt = (path: string, persona: ProCorePersona) => {
  mockPersona = persona;
  // The Wersje tab reaches react-query hooks (RecipeVersionsSection) — provide a client.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ProWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ProWorkspacePage (S3)', () => {
  it('gates non-Pro personas behind an honest PINGÜINO Pro upsell (no workspace nav)', () => {
    for (const persona of ['home', 'demo'] as ProCorePersona[]) {
      const html = renderAt('/pro', persona);
      expect(html).toContain(w.gate.message);
      expect(html).toContain(w.gate.cta);
      // The tab nav must NOT be present for a gated persona.
      expect(html).not.toContain('data-testid="pro-tab-versions"');
    }
  });

  it('renders the full 9-tab nav for the Pro persona', () => {
    const html = renderAt('/pro?tab=settings', 'pro');
    expect(html).toContain(w.title);
    for (const label of Object.values(w.tabs)) {
      expect(html).toContain(label);
    }
    // Gate copy must be absent for a Pro user.
    expect(html).not.toContain(w.gate.message);
  });

  it('surfaces the REAL recipe-versions section on the Wersje tab', () => {
    const html = renderAt('/pro?tab=versions', 'pro');
    expect(html).toContain('data-testid="pro-core-versions"');
  });

  it('shows an honest backend indicator + "arrives later" note on Produkcja/Koszty', () => {
    const production = renderAt('/pro?tab=production', 'pro');
    expect(production).toContain(w.soon.production);
    expect(production).toContain('data-testid="pro-slice-backend"');

    const costs = renderAt('/pro?tab=costs', 'pro');
    expect(costs).toContain(w.soon.costs);
    expect(costs).toContain('data-testid="pro-slice-backend"');
  });

  it('renders the professional machine selector on the Maszyna tab (S4) and keeps the settings link', () => {
    const html = renderAt('/pro?tab=machine', 'pro');
    expect(html).toContain('data-testid="pro-machine-selector"');
    expect(html).toContain('data-testid="pro-machine-professional"');
    expect(html).toContain(copy.proMachine.professional.title);
    expect(html).toContain('href="/profile/machine"');
  });
});
