/**
 * Design-review mode (Masterpiece UX/UI Phase 3) — gating + registry + visibility proofs.
 *
 * The owner-binding rule under test: red `DO PRZEGLĄDU` markers are visible ONLY to owner/QA
 * review sessions (dev build or the staging `VITE_DESIGN_REVIEW=1` deploy, AND the pro
 * capability). Normal customers — demo/home personas, and ANY persona on an unflagged
 * production build — never see a marker. Nothing is removed: the registry only flags items.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { isReviewModeEnabled } from './reviewMode';
import { REVIEW_ITEMS, reviewItemsForPath } from './reviewItems';

let mockPersona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

const { ReviewBadge } = await import('./ReviewBadge');
const { DesignReviewOverlay, ReviewOverlayPanel } = await import('./ReviewOverlay');

describe('isReviewModeEnabled (pure resolver)', () => {
  it('is OFF for every persona on a production build without the staging flag', () => {
    for (const persona of ['demo', 'home', 'pro'] as const) {
      expect(isReviewModeEnabled({ isDev: false, envFlag: undefined, persona })).toBe(false);
    }
  });

  it('is OFF for demo/home customers even on staging (flag set) and in dev', () => {
    for (const persona of ['demo', 'home'] as const) {
      expect(isReviewModeEnabled({ isDev: false, envFlag: '1', persona })).toBe(false);
      expect(isReviewModeEnabled({ isDev: true, envFlag: undefined, persona })).toBe(false);
    }
  });

  it('is ON only for the owner/QA (pro) capability in dev or on the flagged staging deploy', () => {
    expect(isReviewModeEnabled({ isDev: true, envFlag: undefined, persona: 'pro' })).toBe(true);
    expect(isReviewModeEnabled({ isDev: false, envFlag: '1', persona: 'pro' })).toBe(true);
  });

  it('ignores unknown flag values (only the explicit "1" opts in)', () => {
    expect(isReviewModeEnabled({ isDev: false, envFlag: 'true', persona: 'pro' })).toBe(false);
    expect(isReviewModeEnabled({ isDev: false, envFlag: '', persona: 'pro' })).toBe(false);
  });
});

describe('review registry (docs/design/PINGUINO_REVIEW_ITEMS.md mirror)', () => {
  it('every item has a stable unique RV-id, a reason, a suggestion, and a PENDING owner decision', () => {
    const ids = REVIEW_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of REVIEW_ITEMS) {
      expect(item.id).toMatch(/^RV-\d{2}$/);
      expect(item.reason.length).toBeGreaterThan(10);
      expect(item.ownerDecision).toBe('pending');
    }
  });

  it('never suggests automatic removal — "remove-later" is an owner decision, not an action', () => {
    // The registry has no executable removal semantics: suggestions are labels only.
    const allowed = ['keep', 'rename', 'merge', 'relocate', 'hide-by-capability', 'remove-later'];
    for (const item of REVIEW_ITEMS) expect(allowed).toContain(item.suggestion);
  });

  it('resolves current-route items by exact path', () => {
    const ids = reviewItemsForPath('/pro/monitor').map((item) => item.id);
    expect(ids).toContain('RV-12');
    expect(reviewItemsForPath('/some/unknown')).toHaveLength(0);
  });
});

describe('marker visibility (customers NEVER see red tags)', () => {
  const renderBadge = (persona: ProCorePersona) => {
    mockPersona = persona;
    return renderToStaticMarkup(<ReviewBadge itemId="RV-12" />);
  };
  const renderOverlay = (persona: ProCorePersona) => {
    mockPersona = persona;
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={['/pro/monitor']}>
        <DesignReviewOverlay />
      </MemoryRouter>,
    );
  };

  it('demo and home customer sessions render NO badge and NO overlay (empty output)', () => {
    expect(renderBadge('demo')).toBe('');
    expect(renderBadge('home')).toBe('');
    expect(renderOverlay('demo')).toBe('');
    expect(renderOverlay('home')).toBe('');
  });

  it('the owner/QA (pro) session in this dev test build sees the badge with reason + text meaning', () => {
    const html = renderBadge('pro');
    expect(html).toContain('DO PRZEGLĄDU');
    expect(html).toContain('review-badge-RV-12');
    expect(html).toContain('RV-12:'); // reason surfaced via title
  });

  it('the owner/QA session sees the collapsed overlay pill (never auto-expanded)', () => {
    const html = renderOverlay('pro');
    expect(html).toContain('design-review-overlay');
    expect(html).toContain('design-review-toggle');
    // Collapsed by default — the review list never obscures the page.
    expect(html).not.toContain('review-overlay-item-');
  });

  it('the expanded panel lists the current-route item and the FULL registry (nothing hidden)', () => {
    const html = renderToStaticMarkup(<ReviewOverlayPanel pathname="/pro/monitor" />);
    expect(html).toContain('review-overlay-item-RV-12');
    for (const item of REVIEW_ITEMS) expect(html).toContain(`review-overlay-item-${item.id}`);
    expect(html).toContain('Nic nie zostało');
  });
});
