/**
 * AuthModal static markup — the Google button renders only when auth is
 * available, and post-OAuth-redirect notices surface with honest copy
 * (calm for user-cancelled, error tone for real failures). Stores are mocked
 * with the repo's selector-passthrough harness (static markup renders the
 * server snapshot, so real zustand setState would not be visible here).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import type { AuthModalNotice } from './authModalStore';

const h = vi.hoisted(() => ({
  auth: {
    available: false,
    signIn: async () => ({ ok: false as const, message: 'unused' }),
    signUp: async () => ({ ok: false as const, message: 'unused' }),
    signInWithGoogle: async () => ({ ok: false as const, message: 'unused' }),
  },
  modal: {
    notice: null as { kind: string; detail: string | null } | null,
    clearNotice: () => {},
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof h.auth) => unknown) => sel(h.auth),
}));
vi.mock('./authModalStore', () => ({
  useAuthModalStore: (sel: (s: typeof h.modal) => unknown) => sel(h.modal),
}));

import { AuthModal } from './AuthModal';

const a = copy.auth;
const render = () => renderToStaticMarkup(<AuthModal onClose={() => {}} />);
const setNotice = (notice: AuthModalNotice | null) => {
  h.modal.notice = notice;
};

beforeEach(() => {
  h.auth.available = false;
  setNotice(null);
});

describe('AuthModal — Google sign-in button', () => {
  it('renders "Continue with Google" alongside the email form when auth is available', () => {
    h.auth.available = true;
    const html = render();
    expect(html).toContain(a.continueWithGoogle);
    expect(html).toContain(a.email);
    expect(html).toContain(a.password);
  });

  it('does NOT render the Google button when auth is unavailable in this build', () => {
    h.auth.available = false;
    const html = render();
    expect(html).toContain(a.unavailable);
    expect(html).not.toContain(a.continueWithGoogle);
  });
});

describe('AuthModal — post-OAuth-redirect notices', () => {
  it('shows the calm cancelled message (never the error tone) for oauth-cancelled', () => {
    h.auth.available = true;
    setNotice({ kind: 'oauth-cancelled', detail: 'User denied access' });
    const html = render();
    expect(html).toContain(a.googleCancelled);
    expect(html).not.toContain(a.googleFailed);
    // The raw provider description is not surfaced for a simple cancel.
    expect(html).not.toContain('User denied access');
  });

  it('shows the failure message with the provider detail for oauth-failed', () => {
    h.auth.available = true;
    setNotice({ kind: 'oauth-failed', detail: 'Provider unavailable' });
    const html = render();
    expect(html).toContain(a.googleFailed);
    expect(html).toContain('Provider unavailable');
  });

  it('renders no notice at all on a plain open', () => {
    h.auth.available = true;
    const html = render();
    expect(html).not.toContain(a.googleCancelled);
    expect(html).not.toContain(a.googleFailed);
  });
});
