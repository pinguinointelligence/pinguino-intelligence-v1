// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    available: true,
    status: 'authed',
    user: { id: 'owner-a', email: 'owner@example.test' },
  }),
}));
vi.mock('@/services/executableRecipeHandoff', () => ({
  ExecutableRecipeHandoffError: class ExecutableRecipeHandoffError extends Error {},
  openExecutableRecipeTemplate: mocks.open,
}));

const { ProWorkspacePage } = await import('./ProWorkspacePage');

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('Pro executable-template URL lifecycle', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    mocks.open.mockReset();
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
              <Route path="/pro/:section" element={<><LocationProbe /><ProWorkspacePage /></>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  };

  it('consumes a successful handoff URL so reload cannot rematerialize the template', async () => {
    mocks.open.mockResolvedValue({ template: { displayName: 'Rocero' } });
    await renderAt('/pro/recipe?source=executable_template&libraryTemplate=fantasy-rocero-v1');
    await act(async () => { await Promise.resolve(); });

    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/pro/recipe');

    await act(async () => root.unmount());
    root = createRoot(host);
    await renderAt('/pro/recipe');
    await act(async () => { await Promise.resolve(); });
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });

  it('does not expose the previous recipe workbench while materialization is pending', async () => {
    mocks.open.mockImplementation(() => new Promise(() => {}));
    await renderAt('/pro/recipe?source=executable_template&libraryTemplate=fantasy-rocero-v1');
    expect(host.textContent).toContain('Otwieramy dokładną wersję receptury');
    expect(host.querySelector('[data-testid="pro-viewport-region"]')).toBeNull();
  });
});
