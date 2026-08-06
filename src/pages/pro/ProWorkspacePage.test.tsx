/**
 * PINGÜINO Pro workspace — the ONE canonical Pro product (owner P0 contract).
 *
 * Static-markup render (node env, no DOM). The runtime persona is mocked directly (rather
 * than poking the zustand store, whose alias/relative import identity is not stable under
 * vitest) so the gate is deterministic: non-Pro personas see the honest PINGÜINO Pro upsell
 * (no workspace); Pro sees the full 9-section nav on STABLE /pro/<section> paths (direct
 * link + refresh restore the section). Sections surface the REAL version section and HONEST
 * backend/"arrives later" states — never a fabricated screen.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
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
        {/* Mirror the real route table: /pro + the stable /pro/:section paths. */}
        <Routes>
          <Route path="/pro" element={<ProWorkspacePage />} />
          <Route path="/pro/:section" element={<ProWorkspacePage />} />
        </Routes>
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

  it('keeps every former tab destination reachable (one hamburger, stable routes)', async () => {
    // ONE-SCREEN architecture (owner, 2026-07-24): the visible tab row is GONE — every
    // destination lives in the canonical nav config with its stable /pro/<section> route.
    const { APP_NAV_ITEMS } = await import('@/features/shell/appNav');
    const proRoutes = APP_NAV_ITEMS.filter((i) => i.group === 'pro').map((i) => i.to);
    for (const section of [
      'recipe',
      'monitor',
      'versions',
      'production',
      'history',
      'costs',
      'exports',
      'settings',
      'machine',
      'tools',
    ]) {
      expect(proRoutes, section).toContain(`/pro/${section}`);
    }
    // …and a titled section page renders for the Pro persona (no tab row, no gate).
    const html = renderAt('/pro/settings', 'pro');
    expect(html).toContain(w.title);
    expect(html).toContain(w.tabs.settings);
    expect(html).not.toMatch(/role="tablist"/);
    // Gate copy must be absent for a Pro user.
    expect(html).not.toContain(w.gate.message);
  });

  it('surfaces the REAL recipe-versions section on the Wersje tab', () => {
    const html = renderAt('/pro/versions', 'pro');
    expect(html).toContain('data-testid="pro-core-versions"');
  });

  it('keeps Profile, Monitor, Production and Summary in one right-side workspace', () => {
    const production = renderAt('/pro/production', 'pro');
    expect(production).toContain('data-testid="pro-context-tabs"');
    expect(production).toContain('data-testid="pro-context-production"');
    expect(production).toContain('W PRZYGOTOWANIU');
    expect(production).toContain('data-testid="pro-context-summary-tab"');

    const history = renderAt('/pro/history', 'pro');
    expect(history).toContain('data-testid="pro-panel-history"');

    const costs = renderAt('/pro/costs', 'pro');
    expect(costs).toContain(w.soon.costs);
    expect(costs).toContain('data-testid="pro-slice-backend"');
  });

  it('renders the professional machine selector on the Maszyna tab (S4) and keeps the settings link', () => {
    const html = renderAt('/pro/machine', 'pro');
    expect(html).toContain('data-testid="pro-machine-selector"');
    expect(html).toContain('data-testid="pro-machine-professional"');
    expect(html).toContain(copy.proMachine.professional.title);
    expect(html).toContain('href="/profile/machine"');
  });
});
