/**
 * OWNER 2026-09-03 — CONTEXTUAL „Wróć" on the Versions page.
 *
 * Two entry paths, two different correct answers:
 *   Workbench ••• → Wersje  ⇒ a back control that returns to that exact section.
 *   Hamburger  → Wersje     ⇒ NO back control, because there is no workbench
 *                             context to return to and implying one would lie.
 *
 * The origin is carried in the URL rather than read from browser history: the
 * owner's requirement is that it be canonical and survive a refresh, and
 * `history.back()` satisfies neither.
 */
import { describe, expect, it } from 'vitest';
import {
  WORKBENCH_ORIGIN_PARAM,
  isWorkbenchOrigin,
  withWorkbenchOrigin,
  workbenchOriginForSection,
  workbenchOriginReturnPath,
} from './workbenchOrigin';
import { APP_NAV_ITEMS } from '@/features/shell/appNav';

describe('workbench origin contract', () => {
  it('names the current workbench section as the origin', () => {
    expect(workbenchOriginForSection('recipe')).toBe('recipe');
    expect(workbenchOriginForSection('monitor')).toBe('monitor');
    expect(workbenchOriginForSection('production')).toBe('production');
    // `/pro` with no section IS the recipe workbench.
    expect(workbenchOriginForSection(undefined)).toBe('recipe');
    expect(workbenchOriginForSection('')).toBe('recipe');
  });

  it('refuses to invent an origin for a non-workbench section', () => {
    // Opening Wersje from Wersje, or from any plain section page, is not a
    // workbench context — it must not produce a back control.
    for (const section of ['versions', 'costs', 'exports', 'settings', 'machine', 'tools']) {
      expect(workbenchOriginForSection(section), section).toBeNull();
    }
  });

  it('builds the canonical URL and reads it back', () => {
    expect(withWorkbenchOrigin('/pro/versions', 'monitor')).toBe(
      `/pro/versions?${WORKBENCH_ORIGIN_PARAM}=monitor`,
    );
    // No origin ⇒ no parameter at all, so the global entry stays a clean URL.
    expect(withWorkbenchOrigin('/pro/versions', null)).toBe('/pro/versions');
    expect(workbenchOriginReturnPath('monitor')).toBe('/pro/monitor');
    expect(workbenchOriginReturnPath('production')).toBe('/pro/production');
  });

  it('treats a hand-edited or absent origin as no origin', () => {
    // A back control that leads nowhere is worse than none, so anything that is
    // not a real workbench section is discarded rather than trusted.
    for (const value of [null, undefined, '', 'versions', '/etc/passwd', 'https://evil.example']) {
      expect(isWorkbenchOrigin(value), String(value)).toBe(false);
      expect(workbenchOriginReturnPath(value), String(value)).toBeNull();
    }
  });

  it('is refresh-safe: the origin lives in the URL, not in session state', () => {
    // A remounted router (what a refresh produces) still resolves the same
    // return path from the same address.
    const url = withWorkbenchOrigin('/pro/versions', 'recipe');
    const readBack = new URL(url, 'https://staging.pinguinoai.com').searchParams.get(
      WORKBENCH_ORIGIN_PARAM,
    );
    expect(workbenchOriginReturnPath(readBack)).toBe('/pro/recipe');
  });

  it('the GLOBAL navigation entry carries no origin', () => {
    const versionsItem = APP_NAV_ITEMS.find((item) => item.to === '/pro/versions');
    // The hamburger destination is the plain address. If this ever gains a
    // `?from=`, the global entry would start showing a contextual back.
    expect(versionsItem?.to ?? '/pro/versions').not.toContain(WORKBENCH_ORIGIN_PARAM);
  });
});
