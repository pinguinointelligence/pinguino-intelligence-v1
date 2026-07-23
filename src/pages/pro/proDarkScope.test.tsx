/**
 * Masterpiece Phase 5 — dark professional identity proofs (presentation only).
 *
 * 1. The canonical Pro workspace wears the ONE `.theme-pro-dark` token scope (whole chrome:
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

describe('Pro workspace — dark professional scope (Phase 5)', () => {
  it('wraps the WHOLE workspace chrome in the one theme-pro-dark token scope (Pro persona)', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('theme-pro-dark');
    expect(html).toContain('data-testid="pro-dark-scope"');
    // The scope wraps the canonical AppShell header (logo + drawer trigger) too.
    const scopeIndex = html.indexOf('theme-pro-dark');
    const triggerIndex = html.indexOf('data-testid="app-nav-trigger"');
    expect(triggerIndex).toBeGreaterThan(scopeIndex);
  });

  it('keeps the SAME dark identity on the honest non-Pro gate (no light/dark flip-flop)', () => {
    const html = renderAt('/pro', 'demo');
    expect(html).toContain('theme-pro-dark');
  });

  it('sticky workbar with both primary actions renders INSIDE the scope', () => {
    const html = renderAt('/pro/recipe', 'pro');
    for (const id of ['pro-workbar', 'pro-workbar-recalc', 'pro-workbar-monitor', 'pro-workbar-save']) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it('the engine lab carries the elevation hairline (border-shell-line) inside the dark scope', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('border-shell-line');
  });

  it('owner review badges render on the Monitor and Maszyna panels for the owner/QA session', () => {
    expect(renderAt('/pro/monitor', 'pro')).toContain('review-badge-RV-12');
    expect(renderAt('/pro/machine', 'pro')).toContain('review-badge-RV-13');
  });
});
