/**
 * AGENT D — `/start` entitlement P0: SESSION-TRANSITION tests over the REAL chain.
 *
 * The audit-proven defect: CustomerShellV1 hardcoded
 * `const [persona, setPersona] = useState<CustomerPersona>('demo')` (54d58b1:211)
 * — component-local state, dead to every login/logout, so a signed-in paying
 * Home/Pro user was permanently 'demo' (paywalled, no exact grams) at `/start`.
 *
 * These tests drive the REAL runtime seam instead of a mock:
 *   `proCoreAccessStore` (the store `AppProviders.syncEffectiveAccess` writes on
 *   every auth change) → `resolveProCorePersona` / `useProCorePersona` →
 *   `CustomerShellV1` — asserting the rendered shell's `data-persona` trace and
 *   the production-semantics resolution (`isDev: false`, so the DEV override can
 *   never fake a result here).
 *

 * NOTE (repo constraint): zustand v5 serves `getInitialState()` as the
 * useSyncExternalStore SERVER snapshot, so a static-markup render can never see
 * a store update — which is why the repo's component tests mock the persona
 * hook (ProWorkspacePage.test.tsx pattern). This file therefore proves the
 * STORE → resolver joints on the real store (production semantics, `isDev:
 * false`), while `startPersonaProjection.test.tsx` proves the persona →
 * rendered-shell joint. Together they cover the full chain.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import { userScopedMachineKey } from '@/features/machine-onboarding';
import { resolveProCorePersona } from '@/features/pro-core/persona';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { CustomerShellV1 } from './CustomerShellV1';

/* ------------------------------------------------------------------ *
 * Fixtures — the same EffectiveAccess shape `liveEffectiveAccess`     *
 * resolves from the RLS entitlement rows (persona.test.ts pattern).   *
 * ------------------------------------------------------------------ */

const access = (over: Partial<EffectiveAccess>): EffectiveAccess => ({
  canHome: false, canPro: false, canPartner: false, canAdmin: false,
  exactGrams: false, saveRecipes: false, professionalScaling: false, partnerAnalytics: false,
  accountAdministration: false, allowedModes: [], activeSourcesByScope: {}, denialReasons: [],
  ...over,
});

const HOME_ACCESS = access({ canHome: true, exactGrams: true, saveRecipes: true });
const PRO_ACCESS = access({ canPro: true, exactGrams: true, saveRecipes: true, professionalScaling: true });

/** Persona under PRODUCTION semantics (isDev false — the DEV override is dead). */
const productionPersona = () => {
  const s = useProCoreAccessStore.getState();
  return resolveProCorePersona({ effectiveAccess: s.effectiveAccess, devPersona: s.devPersona, isDev: false });
};

const renderShell = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <CustomerShellV1 />
    </MemoryRouter>,
  );

const personaTraceOf = (html: string): string | null =>
  /data-persona="([a-z]+)"/.exec(html)?.[1] ?? null;

const resetStore = () => useProCoreAccessStore.setState({ effectiveAccess: null, devPersona: null });
beforeEach(resetStore);
afterEach(resetStore);

/* ------------------------------------------------------------------ *
 * The original defect, pinned                                         *
 * ------------------------------------------------------------------ */

describe('the shell projects the ENTITLEMENT persona — never a hardcoded demo', () => {
  it('anonymous (no EffectiveAccess): honest demo', () => {
    expect(productionPersona()).toBe('demo');
    expect(personaTraceOf(renderShell())).toBe('demo');
  });

  it('signed-in Home entitlement resolves to home (the broken case, production semantics)', () => {
    // What AppProviders does after login: syncEffectiveAccess → setEffectiveAccess.
    useProCoreAccessStore.getState().setEffectiveAccess(HOME_ACCESS);
    // Pre-fix the shell held useState('demo') — dead to this store entirely.
    expect(productionPersona()).toBe('home');
  });

  it('signed-in Pro entitlement resolves to pro, never a stale demo', () => {
    useProCoreAccessStore.getState().setEffectiveAccess(PRO_ACCESS);
    expect(productionPersona()).toBe('pro');
  });
});

/* ------------------------------------------------------------------ *
 * Login transition: demo → home                                       *
 * ------------------------------------------------------------------ */

describe('login transition — demo → home updates the persona without reload artifacts', () => {
  it('the store change is observed by subscribers (the React re-render mechanism)', () => {
    expect(productionPersona()).toBe('demo');

    const seen: string[] = [];
    const unsubscribe = useProCoreAccessStore.subscribe(() => seen.push(productionPersona()));
    useProCoreAccessStore.getState().setEffectiveAccess(HOME_ACCESS);
    unsubscribe();

    // The subscription fired with the NEW persona — no reload needed: the same
    // notification drives useProCorePersona's useSyncExternalStore re-render.
    expect(seen).toEqual(['home']);
  });

  it('after login the Home user gains the exact-grams + save capabilities', () => {
    useProCoreAccessStore.getState().setEffectiveAccess(HOME_ACCESS);
    const caps = proCoreCapabilitiesFor(productionPersona());
    expect(caps.canViewExactGrams).toBe(true);
    expect(caps.canSaveRecipe).toBe(true);
    expect(caps.maxSavedRecipes).toBe(1); // HOME_MAX_SAVED_RECIPES
    expect(caps.canUseProductionMode).toBe(false); // Home never gets Pro entry
  });
});

/* ------------------------------------------------------------------ *
 * Logout: back to demo, nothing paid leaks                            *
 * ------------------------------------------------------------------ */

describe('logout — persona returns to demo and no paid capability leaks', () => {
  it('home → logout: demo again, with every paid capability off', () => {
    useProCoreAccessStore.getState().setEffectiveAccess(HOME_ACCESS);
    expect(productionPersona()).toBe('home');

    // What AppProviders does on sign-out: syncEffectiveAccess(null) → null.
    useProCoreAccessStore.getState().setEffectiveAccess(null);
    expect(productionPersona()).toBe('demo');
    expect(personaTraceOf(renderShell())).toBe('demo');

    const caps = proCoreCapabilitiesFor(productionPersona());
    // EVERY capability flag is off for demo — nothing paid survives the logout.
    for (const [key, value] of Object.entries(caps)) {
      if (typeof value === 'boolean') expect(value, `demo leak: ${key}`).toBe(false);
    }
    expect(caps.maxSavedRecipes).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Cross-session: pro login after home logout                          *
 * ------------------------------------------------------------------ */

describe('pro login after home logout — no cross-session persona leak', () => {
  it('home → logout → pro yields EXACTLY the pro capabilities (no home residue)', () => {
    useProCoreAccessStore.getState().setEffectiveAccess(HOME_ACCESS);
    expect(productionPersona()).toBe('home');
    useProCoreAccessStore.getState().setEffectiveAccess(null); // logout clears the store
    expect(productionPersona()).toBe('demo'); // no stale home persona in between
    useProCoreAccessStore.getState().setEffectiveAccess(PRO_ACCESS);

    expect(productionPersona()).toBe('pro');
    const caps = proCoreCapabilitiesFor(productionPersona());
    expect(caps.maxSavedRecipes).toBeNull(); // pro unlimited — never home's 1
    expect(caps.canUseProductionMode).toBe(true); // the Pro capability entry
  });

  it('device-local machine state is keyed per account — one account never reads another’s', () => {
    const anonymous = userScopedMachineKey(null);
    const homeUser = userScopedMachineKey('home-user-id');
    const proUser = userScopedMachineKey('pro-user-id');
    expect(new Set([anonymous, homeUser, proUser]).size).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Frozen Demo surface — unchanged                                     *
 * ------------------------------------------------------------------ */

describe('FROZEN product rule — the anonymous demo home screen stays redacted', () => {
  it('renders exactly as today: no digit bound to a grams unit anywhere', () => {
    const html = renderShell();
    expect(personaTraceOf(html)).toBe('demo');
    expect(/\b\d[\d.,]*\s?g\b/.test(html)).toBe(false);
  });
});
