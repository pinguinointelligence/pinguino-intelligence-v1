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
    for (const entry of ['root', 'start', 'home'] as const) {
      expect(destination(entry, pro)).toBe('/pro/recipe');
    }
  });

  it('sends Home to the existing Home experience and leaves /home stable on refresh', () => {
    const home = access({ canHome: true });
    expect(destination('root', home)).toBe('/home');
    expect(destination('start', home)).toBe('/home');
    expect(destination('home', home)).toBeNull();
  });

  it('does not invent a role before authentication or before server access resolves', () => {
    expect(destination('root', access({ canAdmin: true }), 'anon')).toBeNull();
    expect(destination('root', null, 'authed')).toBeNull();
    expect(destination('home', access({}), 'authed')).toBeNull();
  });
});
