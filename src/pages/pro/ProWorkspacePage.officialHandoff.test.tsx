// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openOfficial: vi.fn(), openExecutable: vi.fn() }));

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      available: true,
      status: 'authed',
      user: { id: 'pro-a', email: 'pro@example.test' },
    }),
}));
vi.mock('@/services/executableRecipeHandoff', () => ({
  ExecutableRecipeHandoffError: class ExecutableRecipeHandoffError extends Error {},
  openExecutableRecipeTemplate: mocks.openExecutable,
}));
vi.mock('@/services/officialRecipeHandoff', () => ({
  OfficialRecipeHandoffError: class OfficialRecipeHandoffError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  openOfficialRecipe: mocks.openOfficial,
}));

const { ProWorkspacePage } = await import('./ProWorkspacePage');
const { OfficialRecipeHandoffError } = await import('@/services/officialRecipeHandoff');

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe('Pro official recipe URL lifecycle', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    mocks.openOfficial.mockReset();
    mocks.openExecutable.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const renderAt = async (path: string) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/pro/:section"
                element={
                  <>
                    <LocationProbe />
                    <ProWorkspacePage />
                  </>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  };
  const officialUrl =
    '/pro/recipe?source=official_recipe&officialRecipe=classic-dark-chocolate&returnTo=%2Frecipes';

  it('opens the working copy once, consumes the URL and says the original is unchanged', async () => {
    mocks.openOfficial.mockResolvedValue({
      recipe: { name: 'Ciemna czekolada', processNotice: 'Tara — składnik podlega obróbce cieplnej.' },
      lines: [{ marketProduct: { productCode: 'PR-ING-007172' } }, { marketProduct: null }],
      country: 'PL',
      countryResolution: 'resolved',
    });
    await renderAt(officialUrl);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.openOfficial).toHaveBeenCalledTimes(1);
    expect(mocks.openOfficial).toHaveBeenCalledWith('classic-dark-chocolate', 'pro-a');
    expect(mocks.openExecutable).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/pro/recipe');
    const ready = host.querySelector('[data-testid="pro-official-handoff-ready"]');
    expect(ready?.textContent).toContain('Ciemna czekolada');
    expect(ready?.textContent).toContain('oryginał Gellatti pozostaje bez zmian');
    expect(ready?.textContent).toContain('(PL): 1 z 2');
    expect(ready?.textContent).toContain('Tara — składnik podlega obróbce cieplnej.');
  });

  it('keeps the current draft and explains a blocked official recipe', async () => {
    mocks.openOfficial.mockRejectedValue(
      new OfficialRecipeHandoffError('unresolved_identity', 'Tej receptury nie otworzymy jeszcze do pracy.'),
    );
    await renderAt(officialUrl);
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.querySelector('[data-testid="pro-official-handoff-blocked"]')?.textContent).toBe(
      'Tej receptury nie otworzymy jeszcze do pracy.',
    );
    expect(host.querySelector('[data-testid="pro-official-handoff-ready"]')).toBeNull();
  });

  it('does not expose the previous workbench while the working copy is being built', async () => {
    mocks.openOfficial.mockImplementation(() => new Promise(() => {}));
    await renderAt(officialUrl);
    expect(host.textContent).toContain('Otwieramy recepturę Gellatti');
    expect(host.querySelector('[data-testid="pro-viewport-region"]')).toBeNull();
  });
});
