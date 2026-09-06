/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    expect(html).toContain('data-testid="app-header-login"');
    expect(html).toContain('data-auth-state="anon"');
    expect(html).toContain('Zaloguj się');
  });

  it('renders the live account identity for an authenticated Pro session', async () => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'user-pro', email: 'pro@example.test', displayName: null },
    });
    const html = await render();
    expect(html).toContain('data-testid="app-header-account"');
    expect(html).toContain('data-auth-state="authed"');
    expect(html).toContain('pro@example.test');
    expect(html).not.toContain('data-testid="app-header-login"');
  });
});
