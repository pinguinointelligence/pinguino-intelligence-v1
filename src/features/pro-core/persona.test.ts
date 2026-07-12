import { describe, expect, it } from 'vitest';
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import { personaFromEffectiveAccess, resolveProCorePersona } from './persona';

const access = (over: Partial<EffectiveAccess>): EffectiveAccess => ({
  canHome: false, canPro: false, canPartner: false, canAdmin: false,
  exactGrams: false, saveRecipes: false, professionalScaling: false, partnerAnalytics: false,
  accountAdministration: false, allowedModes: [], activeSourcesByScope: {}, denialReasons: [],
  ...over,
});

describe('personaFromEffectiveAccess — scope-based, Pro wins over Home', () => {
  it('Pro scope resolves to pro (even alongside Home)', () => {
    expect(personaFromEffectiveAccess(access({ canPro: true }))).toBe('pro');
    expect(personaFromEffectiveAccess(access({ canPro: true, canHome: true }))).toBe('pro');
  });
  it('Home-only scope resolves to home', () => {
    expect(personaFromEffectiveAccess(access({ canHome: true }))).toBe('home');
  });
  it('no scope resolves to demo (signed-in-but-unentitled included)', () => {
    expect(personaFromEffectiveAccess(access({}))).toBe('demo');
    expect(personaFromEffectiveAccess(access({ canAdmin: true }))).toBe('demo'); // admin ≠ home/pro
  });
  it('an approved partner surfaces only through the scope its entitlement grants', () => {
    // partner whose entitlement grants pro scope
    expect(personaFromEffectiveAccess(access({ canPartner: true, canPro: true }))).toBe('pro');
    // partner mode without a home/pro scope is not a pro-core paid persona
    expect(personaFromEffectiveAccess(access({ canPartner: true }))).toBe('demo');
  });
});

describe('resolveProCorePersona — DEV override / EffectiveAccess / honest demo fallback', () => {
  it('DEV override wins in development', () => {
    expect(resolveProCorePersona({ effectiveAccess: null, devPersona: 'home', isDev: true })).toBe('home');
    expect(resolveProCorePersona({ effectiveAccess: access({ canPro: true }), devPersona: 'demo', isDev: true })).toBe('demo');
  });
  it('the DEV override is ignored outside development', () => {
    expect(resolveProCorePersona({ effectiveAccess: null, devPersona: 'pro', isDev: false })).toBe('demo');
    expect(resolveProCorePersona({ effectiveAccess: access({ canHome: true }), devPersona: 'pro', isDev: false })).toBe('home');
  });
  it('maps real EffectiveAccess when present', () => {
    expect(resolveProCorePersona({ effectiveAccess: access({ canPro: true }), devPersona: null, isDev: true })).toBe('pro');
  });
  it('falls back to an honest demo when nothing is wired (never guesses a paid scope)', () => {
    expect(resolveProCorePersona({ effectiveAccess: null, devPersona: null, isDev: true })).toBe('demo');
    expect(resolveProCorePersona({ effectiveAccess: null, devPersona: null, isDev: false })).toBe('demo');
  });
});
