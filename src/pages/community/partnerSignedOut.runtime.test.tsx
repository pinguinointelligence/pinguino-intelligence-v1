/** @vitest-environment jsdom */
/**
 * GAP 1 + GAP 2 (owner 2026-09-19) — /partner for a visitor with no session.
 *
 * `gellatti_partner_workspace_v1` is REVOKED FROM ANON. The page used to read
 * it unconditionally, so a signed-out visitor following „Zgłoś się” was shown
 * „Nie udało się odczytać bezpiecznego panelu Partner." — the application
 * surface never rendered, and the product looked broken to exactly the person
 * it was trying to recruit.
 *
 * These contracts pin the fix from both sides: the protected read is NOT
 * attempted without a session, and the application surface IS rendered
 * instead — carrying the canonical `#partner-application` anchor every
 * „Zgłoś się” points at.
 *
 * They deliberately do NOT assert that anon may read the workspace: the RPC's
 * grants are unchanged and must stay that way.
 */
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPartnerWorkspace = vi.fn();
vi.mock('@/services/partner', () => ({
  getPartnerWorkspace: (...args: unknown[]) => getPartnerWorkspace(...args),
  claimReferralEvidence: vi.fn(),
}));

/* The application surface owns its own lifecycle and is exercised elsewhere.
   What is under test here is whether the PAGE lets it render at all. */
vi.mock('@/features/partner-application/PartnerApplicationPanel', () => ({
  PartnerApplicationPanel: () => (
    <div id="partner-application" data-testid="application-surface">
      <button type="button">Zgłoś się</button>
    </div>
  ),
}));
vi.mock('@/components/shared/DestinationSurface', () => ({
  DestinationSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const authState = { status: 'anon' as 'anon' | 'authed' | 'loading' };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) => selector(authState),
}));

const { PartnerPage } = await import('./PartnerPage');

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  getPartnerWorkspace.mockReset();
  getPartnerWorkspace.mockResolvedValue({ ok: true });
  authState.status = 'anon';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (entry = '/partner') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <PartnerPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
};

const surface = () => document.querySelector('[data-testid="application-surface"]');

describe('a signed-out visitor never touches the protected workspace', () => {
  it('does not call the revoked RPC at all', () => {
    mount();
    expect(getPartnerWorkspace).not.toHaveBeenCalled();
  });

  it('renders the application surface instead of a failure', () => {
    mount();
    expect(surface()).not.toBeNull();
    expect(document.body.textContent).not.toContain('Nie udało się odczytać');
  });

  it('exposes #partner-application, the canonical destination', () => {
    mount('/partner#partner-application');
    expect(document.getElementById('partner-application')).not.toBeNull();
    expect(getPartnerWorkspace).not.toHaveBeenCalled();
  });

  it('asks the visitor to apply, never merely to sign in', () => {
    mount();
    const cta = surface()!.querySelector('button')!.textContent ?? '';
    expect(cta).toContain('Zgłoś się');
    expect(cta).not.toContain('Zaloguj');
  });

  it('waits rather than guessing while the session is still resolving', () => {
    authState.status = 'loading';
    mount();
    // Neither the protected read nor a premature „not signed in” verdict.
    expect(getPartnerWorkspace).not.toHaveBeenCalled();
    expect(surface()).toBeNull();
  });
});

describe('an authenticated visitor keeps the existing lifecycle', () => {
  it('reads the workspace exactly as before', async () => {
    authState.status = 'authed';
    mount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getPartnerWorkspace).toHaveBeenCalled();
  });
});

describe('the first action of the funnel states the visitor’s intent', () => {
  it('never labels the application CTA as a login', async () => {
    // V11 §6: „Zaloguj się" is OUR internal step. Putting it on the button made
    // the first action of the recruitment funnel look like a login wall.
    const { cooperationCopy } = await import('@/copy/cooperation');
    expect(cooperationCopy.form.signInCta).toBe('Zgłoś się');
    expect(cooperationCopy.form.signInCta).not.toMatch(/zaloguj/i);
  });

  it('names the two-step shape so the auth modal is expected', async () => {
    const { cooperationCopy } = await import('@/copy/cooperation');
    expect(cooperationCopy.form.signInStep).toMatch(/Krok 1 z 2/);
  });
});
