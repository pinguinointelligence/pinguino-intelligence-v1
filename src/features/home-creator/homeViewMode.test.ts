import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPERIENCE_FALLBACK,
  homeLocationForProModule,
  homePathForLocation,
  proModuleFromPath,
  proUrlRedirectForHomeSubscriber,
  resolveDefaultLandingView,
  resolveViewSwitchPresentation,
  segmentTreatment,
  viewEntitlementFrom,
  viewSwitchSegments,
  type ViewEntitlement,
} from './homeViewMode';

const anonymous: ViewEntitlement = { authed: false, canHome: false, canPro: false };
const freeAccount: ViewEntitlement = { authed: true, canHome: false, canPro: false };
const homeSubscriber: ViewEntitlement = { authed: true, canHome: true, canPro: false };
const proSubscriber: ViewEntitlement = { authed: true, canHome: true, canPro: true };
const proOnly: ViewEntitlement = { authed: true, canHome: false, canPro: true };

describe('HOME/PRO switch presentation (§11)', () => {
  it('shows both segments to an anonymous visitor', () => {
    expect(resolveViewSwitchPresentation(anonymous)).toBe('demo_switch');
    expect(viewSwitchSegments('demo_switch')).toEqual(['home', 'pro']);
  });

  it('shows both segments to a signed-in user without a plan', () => {
    expect(resolveViewSwitchPresentation(freeAccount)).toBe('demo_switch');
  });

  it('NEVER renders PRO for an active HOME subscriber (§11B, §74)', () => {
    expect(resolveViewSwitchPresentation(homeSubscriber)).toBe('home_only');
    expect(viewSwitchSegments('home_only')).toEqual(['home']);
    expect(viewSwitchSegments('home_only')).not.toContain('pro');
  });

  it('shows both segments to an active PRO subscriber (§11C)', () => {
    expect(resolveViewSwitchPresentation(proSubscriber)).toBe('full_switch');
    expect(resolveViewSwitchPresentation(proOnly)).toBe('full_switch');
  });

  it('reverses the treatment when PRO is the active view (§11)', () => {
    expect(segmentTreatment('home', 'home')).toBe('active');
    expect(segmentTreatment('pro', 'home')).toBe('inactive');
    expect(segmentTreatment('home', 'pro')).toBe('inactive');
    expect(segmentTreatment('pro', 'pro')).toBe('active');
  });

  it('maps EffectiveAccess without ever reading a price id', () => {
    expect(viewEntitlementFrom(true, null)).toEqual({
      authed: true,
      canHome: false,
      canPro: false,
    });
    expect(viewEntitlementFrom(true, { canHome: true, canPro: false } as never)).toEqual({
      authed: true,
      canHome: true,
      canPro: false,
    });
  });
});

describe('default landing view (§12, §75)', () => {
  it('defaults a PRO subscriber to PRO', () => {
    expect(resolveDefaultLandingView({ entitlement: proSubscriber, defaultExperience: null })).toBe(
      'pro',
    );
    expect(DEFAULT_EXPERIENCE_FALLBACK).toBe('pro');
  });

  it('honours an explicit HOME setting for a PRO subscriber', () => {
    expect(
      resolveDefaultLandingView({ entitlement: proSubscriber, defaultExperience: 'home' }),
    ).toBe('home');
  });

  it('always lands a HOME subscriber in HOME regardless of the stored setting', () => {
    expect(
      resolveDefaultLandingView({ entitlement: homeSubscriber, defaultExperience: 'pro' }),
    ).toBe('home');
  });

  it('lands demo visitors in HOME — the public root is the creator (§9)', () => {
    expect(resolveDefaultLandingView({ entitlement: anonymous, defaultExperience: 'pro' })).toBe(
      'home',
    );
  });
});

describe('PRO module → HOME mapping (§15)', () => {
  it('parses the PRO section URLs', () => {
    expect(proModuleFromPath('/pro')).toBe('recipe');
    expect(proModuleFromPath('/pro/')).toBe('recipe');
    expect(proModuleFromPath('/pro/recipe')).toBe('recipe');
    expect(proModuleFromPath('/pro/production')).toBe('production');
    expect(proModuleFromPath('/pro/monitor')).toBe('monitor');
    expect(proModuleFromPath('/community')).toBeNull();
    expect(proModuleFromPath('/pro/unknown-thing')).toBeNull();
  });

  it('maps Produkcja to HOME preparation and Monitor/Etykieta to the recipe screen', () => {
    expect(homeLocationForProModule('production')).toBe('preparation');
    expect(homeLocationForProModule('monitor')).toBe('recipe');
    expect(homeLocationForProModule('label')).toBe('recipe');
    expect(homeLocationForProModule('recipe')).toBe('recipe');
    expect(homeLocationForProModule('versions')).toBe('recipe');
  });

  it('routes HOME locations to the one sequential HOME page', () => {
    expect(homePathForLocation('recipe')).toBe('/#recipe');
    expect(homePathForLocation('preparation')).toBe('/#preparation');
    expect(homePathForLocation('account')).toBe('/account');
  });
});

describe('legacy /pro URLs for a HOME subscriber (§13)', () => {
  it('redirects a HOME subscriber into the matching HOME location — never a wall', () => {
    expect(
      proUrlRedirectForHomeSubscriber({
        entitlement: homeSubscriber,
        pathname: '/pro/recipe',
      }),
    ).toBe('/#recipe');
    expect(
      proUrlRedirectForHomeSubscriber({
        entitlement: homeSubscriber,
        pathname: '/pro/production',
      }),
    ).toBe('/#preparation');
    expect(
      proUrlRedirectForHomeSubscriber({
        entitlement: homeSubscriber,
        pathname: '/pro/costs',
      }),
    ).toBe('/#recipe');
  });

  it('leaves PRO subscribers and demo explorers on the PRO URL', () => {
    for (const entitlement of [proSubscriber, proOnly, anonymous, freeAccount]) {
      expect(proUrlRedirectForHomeSubscriber({ entitlement, pathname: '/pro/recipe' })).toBeNull();
    }
  });

  it('does not touch non-PRO URLs', () => {
    expect(
      proUrlRedirectForHomeSubscriber({
        entitlement: homeSubscriber,
        pathname: '/community',
      }),
    ).toBeNull();
  });
});
