import { describe, expect, it } from 'vitest';
import {
  belongsInSitemap,
  isCommunityContent,
  isDiscoverable,
  robotsPolicyFor,
  visibilityOf,
} from './visibility';

describe('§4/§11 — direct sharing must NEVER publish a recipe', () => {
  it('an existing private recipe stays private', () => {
    expect(visibilityOf({ hasActiveShare: false, hasLivePublication: false })).toBe('private');
  });

  it('sharing makes a recipe UNLISTED — not Community content, not discoverable', () => {
    const visibility = visibilityOf({ hasActiveShare: true, hasLivePublication: false });
    expect(visibility).toBe('unlisted');
    expect(isCommunityContent(visibility)).toBe(false);
    expect(isDiscoverable(visibility)).toBe(false);
  });

  it('only an explicit publication is Community content', () => {
    const visibility = visibilityOf({ hasActiveShare: false, hasLivePublication: true });
    expect(visibility).toBe('published');
    expect(isCommunityContent(visibility)).toBe(true);
    expect(isDiscoverable(visibility)).toBe(true);
  });

  it('a published recipe that is also shared stays published — sharing adds reach, not exposure', () => {
    expect(visibilityOf({ hasActiveShare: true, hasLivePublication: true })).toBe('published');
  });
});

describe('§11/§46 — direct-share pages are noindex and never in a sitemap', () => {
  it('marks direct shares noindex,nofollow', () => {
    expect(robotsPolicyFor('direct_share')).toBe('noindex,nofollow');
    expect(belongsInSitemap('direct_share')).toBe(false);
  });

  it('allows Community surfaces to be indexed and listed', () => {
    expect(robotsPolicyFor('community_publication')).toBe('index,follow');
    expect(robotsPolicyFor('creator_profile')).toBe('index,follow');
    expect(belongsInSitemap('community_publication')).toBe(true);
    expect(belongsInSitemap('creator_profile')).toBe(true);
  });
});
