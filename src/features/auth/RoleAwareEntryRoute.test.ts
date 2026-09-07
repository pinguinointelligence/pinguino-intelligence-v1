import { describe, expect, it } from 'vitest';
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import {
  ADMIN_OVERVIEW_PATH,
  roleAwareEntryDestination,
  type RoleAwareEntry,
} from './roleAwareEntry';

const access = (overrides: Partial<EffectiveAccess>): EffectiveAccess => ({
  canHome: false,
  canPro: false,
  canPartner: false,
  canAdmin: false,
  exactGrams: false,
  saveRecipes: true,
  professionalScaling: false,
  partnerAnalytics: false,
  accountAdministration: false,
  allowedModes: [],
  activeSourcesByScope: {},
  denialReasons: [],
  ...overrides,
});

const destination = (
  entry: RoleAwareEntry,
  effectiveAccess: EffectiveAccess | null,
  authStatus: 'loading' | 'authed' | 'anon' = 'authed',
) => roleAwareEntryDestination({ entry, authStatus, effectiveAccess });

describe('role-aware login and ordinary entry routing', () => {
  it('sends Admin directly to the canonical operational overview from every normal entry', () => {
    const admin = access({ canAdmin: true, canHome: true, canPro: true });
    expect(ADMIN_OVERVIEW_PATH).toBe('/admin/overview');
    for (const entry of ['root', 'start', 'home'] as const) {
      expect(destination(entry, admin)).toBe(ADMIN_OVERVIEW_PATH);
    }
  });

  it('sends Pro to the existing canonical Pro recipe workspace, never Admin', () => {
    const pro = access({ canPro: true, exactGrams: true, professionalScaling: true });
    // SUPERSEDED for `home` — 2026-09-02. `home` was in this list, which meant a PRO
    // subscriber could not reach HOME by ANY route: the always-visible HOME segment
    // (owner §11B) navigates there and was bounced straight back. Confirmed served.
    for (const entry of ['root', 'start'] as const) {
      expect(destination(entry, pro)).toBe('/pro/recipe');
    }
  });

  it('lets a PRO subscriber reach HOME, because `/home` asks for it explicitly', () => {
    const pro = access({ canPro: true, exactGrams: true, professionalScaling: true });
    // The account default answers the AMBIGUOUS entries; it must not override a
    // customer who explicitly asked for HOME.
    expect(destination('home', pro)).toBeNull();
    expect(
      roleAwareEntryDestination({
        entry: 'home',
        authStatus: 'authed',
        effectiveAccess: access({ canPro: true, exactGrams: true, professionalScaling: true }),
        defaultExperience: 'pro',
      }),
    ).toBeNull();
  });

  it('still sends an Admin to Admin even when HOME is asked for explicitly', () => {
    expect(destination('home', access({ canAdmin: true }))).toBe(ADMIN_OVERVIEW_PATH);
  });

  /**
   * OWNER SUPERSESSION — HOME Creator V1 §9 (2026-08-30). The public root IS the HOME
   * Creator now, so a HOME subscriber is no longer hopped onward to `/home`; they
   * render in place. The rule this test protects is unchanged in substance: a HOME
   * subscriber must never be sent into PRO, and must never be sent to Admin.
   */
  it('renders a Home subscriber in place — the root IS their product (§9)', () => {
    const home = access({ canHome: true });
    expect(destination('root', home)).toBeNull();
    expect(destination('start', home)).toBeNull();
    expect(destination('home', home)).toBeNull();
  });

  /** §12: the login default is the STATED account setting, never the last view. */
  it('honours a PRO subscriber who chose to start in HOME', () => {
    const pro = access({ canPro: true, canHome: true });
    expect(
      roleAwareEntryDestination({
        entry: 'root',
        authStatus: 'authed',
        effectiveAccess: pro,
        defaultExperience: 'home',
      }),
    ).toBeNull();
    expect(
      roleAwareEntryDestination({
        entry: 'root',
        authStatus: 'authed',
        effectiveAccess: pro,
        defaultExperience: 'pro',
      }),
    ).toBe('/pro/recipe');
    // Unknown setting falls back to the owner default (PRO), never to a stored view.
    expect(
      roleAwareEntryDestination({
        entry: 'root',
        authStatus: 'authed',
        effectiveAccess: pro,
        defaultExperience: null,
      }),
    ).toBe('/pro/recipe');
  });

  /** §11B: Admin still outranks every plan, from every entry. */
  it('keeps Admin ahead of a HOME-preferring PRO setting', () => {
    expect(
      roleAwareEntryDestination({
        entry: 'root',
        authStatus: 'authed',
        effectiveAccess: access({ canAdmin: true, canPro: true, canHome: true }),
        defaultExperience: 'home',
      }),
    ).toBe(ADMIN_OVERVIEW_PATH);
  });

  it('does not invent a role before authentication or before server access resolves', () => {
    expect(destination('root', access({ canAdmin: true }), 'anon')).toBeNull();
    expect(destination('root', null, 'authed')).toBeNull();
    expect(destination('home', access({}), 'authed')).toBeNull();
  });
});
