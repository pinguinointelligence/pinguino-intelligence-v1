/**
 * White precision Pro identity proofs (presentation only).
 *
 * 1. The canonical Pro workspace wears the ONE `.theme-pro-light` token scope (whole chrome:
 *    header + workbar + tabs + panels) — for the Pro persona AND the honest gate view, so the
 *    Pro identity is consistent before and after entitlement.
 * 2. The engine lab surface carries the elevation hairline inside the scope.
 * 3. The sticky workbar primary actions render INSIDE the scope (no scroll-to-recalculate).
 * 4. Owner review badges (RV-12/RV-13) render on their panels for the owner/QA session in this
 *    dev test build — and designReview.test.tsx proves customers never see them.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

let mockPersona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

const { ProWorkspacePage } = await import('./ProWorkspacePage');

const renderAt = (path: string, persona: ProCorePersona) => {
  mockPersona = persona;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pro" element={<ProWorkspacePage />} />
          <Route path="/pro/:section" element={<ProWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Pro workspace — white precision scope', () => {
  it('wraps the WHOLE workspace chrome in the one theme-pro-light token scope (Pro persona)', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('theme-pro-light');
    expect(html).toContain('data-testid="pro-light-scope"');
    // The scope wraps the canonical AppShell header (logo + drawer trigger) too.
    const scopeIndex = html.indexOf('theme-pro-light');
    const triggerIndex = html.indexOf('data-testid="app-nav-trigger"');
    expect(triggerIndex).toBeGreaterThan(scopeIndex);
  });

  it('keeps the SAME white identity on the honest non-Pro gate', () => {
    const html = renderAt('/pro', 'demo');
    expect(html).toContain('theme-pro-light');
  });

  it('command bar, profile tabs and bottom-left save render INSIDE the scope', () => {
    const html = renderAt('/pro/recipe', 'pro');
    for (const id of [
      'pro-workbar',
      'pro-workbar-recalc',
      'pro-context-tabs',
      'pro-workbar-save',
    ]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it('the engine lab carries the precision hairline inside the light scope', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('border-ivory/10');
    expect(html).toContain('data-testid="workbench-editor-pane"');
    expect(html).toContain('data-testid="pro-monitor-panel"');
    expect(html).toContain('lg:w-[62%]');
    expect(html).toContain('lg:w-[38%]');
  });

  it('keeps the informational bracket and the review tools route', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('bracket-note');
    expect(html).toContain('data-readiness="WYMAGA KALIBRACJI"');
    expect(renderAt('/pro/tools', 'pro')).toContain('data-testid="pro-review-zone"');
  });

  it('owner review badges render on the Monitor and Maszyna panels for the owner/QA session', () => {
    expect(renderAt('/pro/monitor', 'pro')).toContain('review-marked-monitor-owner-diagnostic');
    expect(renderAt('/pro/machine', 'pro')).toContain('review-badge-RV-13');
  });
});
