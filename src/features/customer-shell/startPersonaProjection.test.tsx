/**
 * AGENT D — `/start` entitlement P0: the persona → RENDERED SHELL joint.
 *
 * Completes the chain proven in `startEntitlementChain.test.tsx` (real store →
 * production-semantics persona): here the resolved persona is injected via the
 * repo's established hook-mock pattern (ProWorkspacePage.test.tsx — zustand v5
 * serves the INITIAL state to static-markup renders, so the hook is the correct
 * seam to vary) and the shell's rendered output is asserted per persona:
 *
 *  - the `data-persona` trace flips with the entitlement persona — pre-fix the
 *    shell was pinned to a component-local `useState('demo')` (54d58b1:211) and
 *    a paying Home/Pro user could never leave the Demo experience;
 *  - NO persona sees a gram digit or the upgrade paywall on the statically
 *    reachable opening screen (the deep matrix — grams / paywall / save /
 *    machine flow — is pinned at the pure seam in customerShellAccess.test.ts,
 *    which the shell provably consumes);
 *  - the Demo opening screen is byte-stable across personas except the persona
 *    trace + selector — the frozen Demo redaction cannot regress by persona
 *    plumbing alone.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { customerShellCopy as copy } from './customerShellCopy';

let mockPersona: ProCorePersona = 'demo';
// Mocked by resolved module id → covers both the '@/…' and relative importers.
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

const { CustomerShellV1 } = await import('./CustomerShellV1');

const renderAs = (persona: ProCorePersona) => {
  mockPersona = persona;
  return renderToStaticMarkup(
    <MemoryRouter>
      <CustomerShellV1 />
    </MemoryRouter>,
  );
};

const PERSONAS: readonly ProCorePersona[] = ['demo', 'home', 'pro'];

describe('the shell renders the ENTITLEMENT persona (no hardcoded demo)', () => {
  it('data-persona traces the injected persona for demo / home / pro', () => {
    for (const persona of PERSONAS) {
      expect(renderAs(persona), persona).toContain(`data-persona="${persona}"`);
    }
  });

  it('home and pro are NOT rendered as demo (the audit-proven defect)', () => {
    for (const persona of ['home', 'pro'] as const) {
      expect(renderAs(persona), persona).not.toContain('data-persona="demo"');
    }
  });
});

describe('opening screen — honest for every persona', () => {
  it('no gram digit and no upgrade paywall for any persona', () => {
    for (const persona of PERSONAS) {
      const html = renderAs(persona);
      expect(/\b\d[\d.,]*\s?g\b/.test(html), persona).toBe(false);
      expect(html, persona).not.toContain(copy.upgrade.body);
    }
  });

  it('the frozen Demo screen differs from Home/Pro ONLY by the persona plumbing', () => {
    // Neutralize the two intentional persona artifacts (trace + DEV selector
    // option state); everything else must be byte-identical — the persona wiring
    // alone can never alter the redacted Demo opening surface.
    const neutralize = (html: string) =>
      html
        .replace(/data-persona="[a-z]+"/g, 'data-persona="X"')
        // The DEV selector's controlled <select> marks the current persona's
        // <option> as selected in static markup; normalize it away.
        .replace(/ selected=""/g, '');
    const demo = neutralize(renderAs('demo'));
    expect(neutralize(renderAs('home'))).toBe(demo);
    expect(neutralize(renderAs('pro'))).toBe(demo);
  });
});
