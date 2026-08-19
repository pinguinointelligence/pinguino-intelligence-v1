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
const { cockpitTabFromRoute, routeForCockpitTab } = await import('./workbenchRoute');

const w = copy.proWorkspace;

describe('workbench URL authority', () => {
  it('round-trips all four modules through stable routes', () => {
    expect(cockpitTabFromRoute('recipe', null)).toBe('profile');
    expect(cockpitTabFromRoute('monitor', null)).toBe('monitor');
    expect(cockpitTabFromRoute('production', null)).toBe('production');
    expect(cockpitTabFromRoute('recipe', 'summary')).toBe('summary');
    expect(routeForCockpitTab('profile')).toBe('/pro/recipe');
    expect(routeForCockpitTab('monitor')).toBe('/pro/monitor');
    expect(routeForCockpitTab('production')).toBe('/pro/production');
    expect(routeForCockpitTab('summary')).toBe('/pro/recipe?panel=summary');
  });
});

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

  it('keeps workbench sections reachable by deep link without promoting them globally', async () => {
    const { APP_NAV_ITEMS } = await import('@/features/shell/appNav');
    const globalRoutes = APP_NAV_ITEMS.map((item) => item.to);
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
      const sectionHtml = renderAt(`/pro/${section}`, 'pro');
      expect(sectionHtml, section).toContain('data-testid="pro-light-scope"');
      expect(sectionHtml, section).not.toContain(w.gate.message);
      if (section !== 'recipe' && section !== 'production') {
        expect(globalRoutes, section).not.toContain(`/pro/${section}`);
      }
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
    expect(production).toContain('Wymaga receptury wykonawczej');
    expect(production).not.toContain('Brak zatwierdzonego uprawnienia PRODUCTION dla:');
    expect(production).not.toContain('new-recipe-0-');
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
    expect(html).toContain('href="/machine"');
  });
});
