/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { AppHeaderAccountSlot } from './AppHeaderAccountSlot';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

const render = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AppHeaderAccountSlot />
      </MemoryRouter>,
    );
  });
  return host.innerHTML;
};

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useAuthStore.setState({ status: 'loading', user: null });
});

describe('AppHeaderAccountSlot — one canonical auth identity', () => {
  it('renders the canonical sign-in action only for anonymous state', async () => {
    useAuthStore.setState({ status: 'anon', user: null });
    const html = await render();
    const control = host.querySelector<HTMLButtonElement>('[data-testid="app-header-login"]');
    expect(html).toContain('data-testid="app-header-login"');
    expect(html).toContain('data-auth-state="anon"');
    expect(control?.textContent).toBe('Zaloguj');
    expect(control?.className).toContain('h-11');
    expect(control?.className).toContain('w-auto');
    expect(control?.className).toContain('px-3');
    expect(control?.className).not.toContain('max-w-52');
    expect(control?.className).not.toContain('truncate');
  });

  it('renders a bounded sign-out action without leaking account identity', async () => {
    const signOut = vi.fn(async () => undefined);
    useAuthStore.setState({
      status: 'authed',
      user: {
        id: 'user-pro',
        email: 'very-long-owner-address-that-must-never-reach-the-header@example.test',
        displayName: 'Very Long Owner Name That Must Never Reach The Header',
      },
      signOut,
    });
    const html = await render();
    const control = host.querySelector<HTMLButtonElement>('[data-testid="app-header-account"]');
    expect(html).toContain('data-testid="app-header-account"');
    expect(html).toContain('data-auth-state="authed"');
    expect(control?.textContent).toBe('Wyloguj');
    expect(html).not.toContain('very-long-owner-address');
    expect(html).not.toContain('Very Long Owner Name');
    expect(html).not.toContain('data-testid="app-header-login"');

    await act(async () => control?.click());
    expect(signOut).toHaveBeenCalledOnce();
  });
});
