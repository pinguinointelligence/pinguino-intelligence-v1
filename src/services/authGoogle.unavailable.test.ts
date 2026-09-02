import { describe, expect, it, vi } from 'vitest';

// Google sign-in must degrade exactly like every other auth call when the
// backend is not configured in this build: an honest "unavailable" result,
// never a throw and never a redirect attempt.
vi.mock('@/lib/supabase/client', () => ({ supabase: null, isSupabaseConfigured: false }));

import { signInWithGoogle } from './auth';

describe('signInWithGoogle — unconfigured client degrades safely', () => {
  it('resolves to the standard unavailable result', async () => {
    expect(await signInWithGoogle()).toEqual({
      ok: false,
      code: 'AUTH_UNAVAILABLE',
      message: 'Spróbuj ponownie za chwilę.',
    });
  });
});
