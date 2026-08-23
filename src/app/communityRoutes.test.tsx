/**
 * Community routing contract.
 *
 * The riskiest thing about `/@handle` is COLLISION: a public handle namespace
 * sitting at the root of the URL space, next to every application route. So
 * this file proves three things with a real router match, not by reading the
 * route table:
 *   1. the Community/share routes resolve to their pages;
 *   2. an application route is NEVER captured by the handle route;
 *   3. every word that could collide is in the reserved-handle list, which the
 *      database enforces too.
 */
import { matchRoutes, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  RESERVED_HANDLES,
  handleFromPath,
  isHandlePath,
} from '@/features/community/domain/creatorHandle';

/** The Community subset of the route table, in declaration order. */
const ROUTES: RouteObject[] = [
  { path: '/', id: 'landing' },
  { path: '/start', id: 'start' },
  { path: '/community', id: 'community' },
  { path: '/top100', id: 'top100' },
  { path: '/:handle', id: 'creator' },
  { path: '/:handle/:slug', id: 'publication' },
  { path: '/share/:token', id: 'share' },
  { path: '/received/:shareLinkId', id: 'received' },
  { path: '/recipes', id: 'recipes' },
  { path: '/pro', id: 'pro' },
  { path: '/pro/:section', id: 'pro-section' },
  { path: '/products', id: 'products' },
  { path: '/account', id: 'account' },
  { path: '/subscription', id: 'subscription' },
  { path: '*', id: 'not-found' },
];

const match = (pathname: string) => {
  const matches = matchRoutes(ROUTES, pathname);
  return { id: matches?.at(-1)?.route.id, params: matches?.at(-1)?.params ?? {} };
};

describe('the public handle namespace resolves', () => {
  it('routes /@marysia to the creator profile', () => {
    expect(match('/@marysia')).toEqual({ id: 'creator', params: { handle: '@marysia' } });
    expect(isHandlePath('@marysia')).toBe(true);
    expect(handleFromPath('@marysia')).toBe('marysia');
  });

  it('routes /@marysia/pistachio-salted-caramel to the public recipe page', () => {
    expect(match('/@marysia/pistachio-salted-caramel')).toEqual({
      id: 'publication',
      params: { handle: '@marysia', slug: 'pistachio-salted-caramel' },
    });
  });

  it('routes the unlisted share and the token-free reopen', () => {
    expect(match('/share/kJ8s-Zq2_1aBcDeFgHiJkLmNoPqRsTuV')).toEqual({
      id: 'share',
      params: { token: 'kJ8s-Zq2_1aBcDeFgHiJkLmNoPqRsTuV' },
    });
    expect(match('/received/9f1c2f6e-0000-4000-8000-000000000000').id).toBe('received');
  });

  it('routes Community discovery and the TOP 100 board', () => {
    expect(match('/community').id).toBe('community');
    expect(match('/top100').id).toBe('top100');
  });
});

describe('a handle can never capture an application route', () => {
  it('leaves every existing route matching its own page', () => {
    for (const [pathname, expected] of [
      ['/', 'landing'],
      ['/start', 'start'],
      ['/recipes', 'recipes'],
      ['/pro', 'pro'],
      ['/pro/recipe', 'pro-section'],
      ['/products', 'products'],
      ['/account', 'account'],
      ['/subscription', 'subscription'],
      ['/community', 'community'],
      ['/top100', 'top100'],
    ] as const) {
      expect(match(pathname).id, pathname).toBe(expected);
    }
  });

  it('never lets a bare word BE a handle — the `@` prefix is required', () => {
    // `/marysia` matches the dynamic route structurally, but the gate refuses
    // it, so the user sees the same 404 they saw before this feature existed.
    expect(isHandlePath('marysia')).toBe(false);
    expect(handleFromPath('marysia')).toBeNull();
  });

  it('refuses a reserved handle at the route gate, not only in the database', () => {
    for (const reserved of ['@admin', '@share', '@pro', '@recipes', '@gellatti']) {
      expect(isHandlePath(reserved), reserved).toBe(false);
    }
  });

  it('refuses a malformed handle before any request is made', () => {
    for (const bad of ['@', '@ab', '@a'.padEnd(40, 'a'), '@mary sia', '@../etc']) {
      expect(isHandlePath(bad), bad).toBe(false);
    }
  });

  it('reserves every top-level route word, so it could not be claimed anyway', () => {
    const reserved = new Set(RESERVED_HANDLES);
    const topLevelWords = ROUTES.map((route) => route.path ?? '')
      .filter((path) => /^\/[a-z0-9]+$/.test(path))
      .map((path) => path.slice(1));
    expect(topLevelWords.length).toBeGreaterThan(0);
    for (const word of topLevelWords) {
      expect(reserved.has(word), `route /${word} must be a reserved handle`).toBe(true);
    }
  });

  it('reserves the words a handle would otherwise shadow inside a nested route', () => {
    const reserved = new Set(RESERVED_HANDLES);
    for (const word of ['pro', 'products', 'share', 'recipes', 'account', 'community']) {
      expect(reserved.has(word), word).toBe(true);
    }
  });
});
