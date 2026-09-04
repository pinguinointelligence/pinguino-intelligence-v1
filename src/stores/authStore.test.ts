import type { AuthChangeEvent } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  onAuthChange: vi.fn(),
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  callback: null as null | ((event: AuthChangeEvent, user: TestUser | null) => void),
}));

type TestUser = { id: string; email: string | null; displayName: string | null };
const USER: TestUser = { id: 'user-pro', email: 'pro@example.test', displayName: null };

vi.mock('@/services/auth', () => ({
  isAuthAvailable: true,
  getCurrentUser: h.getCurrentUser,
  onAuthChange: h.onAuthChange,
  signIn: h.signIn,
  signInWithGoogle: h.signInWithGoogle,
  signOut: h.signOut,
  signUp: h.signUp,
}));

import { __resetAuthStoreForTests, useAuthStore } from './authStore';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  h.callback = null;
  h.onAuthChange.mockImplementation(
    (callback: (event: AuthChangeEvent, user: TestUser | null) => void) => {
      h.callback = callback;
      return () => {};
    },
  );
  __resetAuthStoreForTests();
});

describe('auth projection stability', () => {
  it('a late empty boot snapshot cannot overwrite a newer SIGNED_IN event', async () => {
    let resolveSnapshot!: (user: TestUser | null) => void;
    h.getCurrentUser.mockReturnValue(
      new Promise<TestUser | null>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );

    useAuthStore.getState().init();
    h.callback?.('SIGNED_IN', USER);
    resolveSnapshot(null);
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ status: 'authed', user: USER });
  });

  it('does not turn a live Pro projection into guest on a null refresh callback', async () => {
    h.getCurrentUser.mockResolvedValue(USER);
    useAuthStore.getState().init();
    await flush();
    expect(useAuthStore.getState().status).toBe('authed');

    h.callback?.('TOKEN_REFRESHED', null);
    expect(useAuthStore.getState()).toMatchObject({ status: 'authed', user: USER });
  });

  it('does project anon for the authoritative SIGNED_OUT event', async () => {
    h.getCurrentUser.mockResolvedValue(USER);
    useAuthStore.getState().init();
    await flush();

    h.callback?.('SIGNED_OUT', null);
    expect(useAuthStore.getState()).toMatchObject({ status: 'anon', user: null });
  });

  it('keeps the current identity when the session snapshot read fails', async () => {
    h.getCurrentUser.mockRejectedValue(new Error('temporary storage read failure'));
    useAuthStore.setState({ status: 'authed', user: USER });
    useAuthStore.getState().init();
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ status: 'authed', user: USER });
  });
});
