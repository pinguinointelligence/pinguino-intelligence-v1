// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { AccountModeSwitcher } from './AccountModeSwitcher';

describe('AccountModeSwitcher access-loading snapshot', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    useProCoreAccessStore.setState({ effectiveAccess: null, devPersona: null });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('renders an empty stable state before access resolves without a React update loop', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/account']}>
          <AccountModeSwitcher />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toBe('');
    expect(consoleError).not.toHaveBeenCalled();
  });
});
