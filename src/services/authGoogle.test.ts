/**
 * signInWithGoogle — provider call shape and the redirectTo open-redirect
 * guard. The vendor client is mocked; `window` is stubbed per-test (node env).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithOAuth } },
}));

import { signInWithGoogle } from './auth';

type OAuthCall = { provider: string; options?: { redirectTo?: string } };
const firstCallArg = (): OAuthCall => signInWithOAuth.mock.calls[0]?.[0] as OAuthCall;

const globalRef = globalThis as { window?: { location: { origin: string } } };
const setWindowOrigin = (origin: string) => {
  globalRef.window = { location: { origin } };
};

afterEach(() => {
  delete globalRef.window;
  signInWithOAuth.mockReset();
});

describe('signInWithGoogle — provider + validated redirectTo', () => {
  it('passes the current origin as redirectTo when it is an app origin', async () => {
    setWindowOrigin('https://staging.pinguinoai.com');
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'x' }, error: null });

    expect(await signInWithGoogle()).toEqual({ ok: true, needsConfirmation: false });
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    const call = firstCallArg();
    expect(call.provider).toBe('google');
    expect(call.options?.redirectTo).toBe('https://staging.pinguinoai.com');
  });

  it('omits redirectTo for a non-allowlisted origin (backend Site URL wins)', async () => {
    setWindowOrigin('https://evil.example.com');
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'x' }, error: null });

    expect(await signInWithGoogle()).toEqual({ ok: true, needsConfirmation: false });
    const call = firstCallArg();
    expect(call.provider).toBe('google');
    expect(call.options?.redirectTo).toBeUndefined();
  });

  it('omits redirectTo when there is no window at all', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'x' }, error: null });

    expect(await signInWithGoogle()).toEqual({ ok: true, needsConfirmation: false });
    const call = firstCallArg();
    expect(call.options?.redirectTo).toBeUndefined();
  });

  it('surfaces a provider error as an honest { ok: false } result', async () => {
    setWindowOrigin('http://localhost:5173');
    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Provider is not enabled' },
    });

    expect(await signInWithGoogle()).toEqual({ ok: false, message: 'Provider is not enabled' });
  });
});
