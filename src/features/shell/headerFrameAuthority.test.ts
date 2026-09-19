import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HEADER_ACCOUNT_MAX_WIDTH_PX,
  HEADER_ACCOUNT_SAFE_GAP_PX,
} from './applicationScaleAuthority';
import { PRO_FRAME_INLINE_GUTTER_PX, PRO_FRAME_MAX_WIDTH_PX } from './proFrameGeometry';

const read = (path: string) => readFileSync(resolve(import.meta.dirname, '..', '..', path), 'utf8');
/* The stylesheets' comments discuss these selectors by name, so judge the
   declarations only — the comment-matching trap has bitten three contracts. */
const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};

const v21 = rules(read('styles/gellatti-v2-1.css'));
const tokens = rules(read('styles/tokens.css'));
const desktop = v21.slice(v21.indexOf('@media (min-width: 68.5rem)'));
const shell = read('features/shell/AppShell.tsx');
const slot = read('features/shell/AppHeaderAccountSlot.tsx');
const slotClass = slot.match(/const SLOT_CLASS =\s*'([^']+)'/)?.[1] ?? '';

/**
 * OWNER 2026-09-12 — DESKTOP / WEB DESIGN CORRECTION §1 and §8, and the
 * ADDITIONAL LOCK: the header navigation block is EXACTLY the body frame — same
 * left edge, same right edge, same width, 0 px offset. Hamburger, logo,
 * HOME | PRO and the module strip all live inside it.
 */
describe('the header lives in the body frame', () => {
  it('sizes the desktop header row through the same tokens as the body frame', () => {
    const row = block(desktop, '.app-shell-header-row');
    const frame = block(desktop, '.pro-workbench-frame');
    for (const token of ['var(--pro-frame-max-width)', 'var(--pro-frame-inline-gutter)']) {
      expect(row, token).toContain(token);
      expect(frame, token).toContain(token);
    }
    expect(row).not.toContain('1776px');
    expect(row).not.toContain('57.6px');
  });

  it('gives the scale authority the same frame and clearance the stylesheets use', () => {
    expect(tokens).toContain(`--pro-frame-max-width: ${PRO_FRAME_MAX_WIDTH_PX}px`);
    expect(tokens).toContain(`--pro-frame-inline-gutter: ${PRO_FRAME_INLINE_GUTTER_PX}px`);
    expect(tokens).toContain(`--pro-header-account-gap: ${HEADER_ACCOUNT_SAFE_GAP_PX}px`);
  });
});

/**
 * OWNER 2026-09-12 — FINAL RESPONSIVE TRIGGER. The account stands in its own
 * lane just past the end of the PRO navigation (the frame's right edge), at the
 * hard minimum clearance — the ONLY element outside the frame. When that lane
 * does not fit, the one application scale reduces everything. Inside the
 * display column's track the clearance could never be restored by scaling —
 * both sides of it shrink together — which is why the account is not there.
 */
describe('the account lane', () => {
  it('keeps the module strip on the canvas and the account in one lane after it', () => {
    const canvasAt = shell.indexOf("cn('contents', APP_HEADER_CANVAS, DESKTOP_WORKBENCH_COLUMNS)");
    const laneAt = shell.indexOf('data-testid="app-header-account-lane"');
    const accountAt = shell.indexOf('<AppHeaderAccountSlot />');
    expect(canvasAt).toBeGreaterThan(-1);
    expect(laneAt).toBeGreaterThan(canvasAt);
    expect(accountAt).toBeGreaterThan(laneAt);
    expect(accountAt).toBeLessThan(shell.indexOf('</header>'));
    expect(shell.match(/<AppHeaderAccountSlot \/>/g)).toHaveLength(1);
    expect(shell).not.toContain('pro-workbench-header-trailing');
    expect(v21).not.toContain('pro-workbench-header-trailing');
  });

  it('stands the lane exactly the safe clearance past the frame edge', () => {
    const lane = block(desktop, '.app-header-account-lane');
    expect(lane).toMatch(/position:\s*absolute/);
    expect(lane).toMatch(/left:\s*calc\(100% \+ var\(--pro-header-account-gap\)\)/);
    expect(lane).toMatch(/display:\s*flex/);
  });

  it('hands the lane to the scale authority, which measures it', () => {
    expect(shell).toContain('const accountLaneRef = useApplicationScaleAuthority();');
    expect(shell).toContain('ref={accountLaneRef}');
  });

  it('never squeezes the account to make room', () => {
    expect(slotClass).toContain('app-header-account-slot');
    expect(slotClass).toContain('shrink-0');
    expect(slotClass).not.toContain('min-w-0');
    expect(slot.match(/className="min-w-0 truncate"/g)).toHaveLength(2);
  });

  it('caps the account at 208 px and lets the scale authority narrow it', () => {
    // RESPONSIVE HANDOFF CORRECTION: the account yields before the layout
    // changes mode — 208 px at most, narrowed progressively by the authority's
    // budget, truncated with an ellipsis and the full value in the tooltip.
    expect(slotClass).toContain(
      `max-w-[min(${HEADER_ACCOUNT_MAX_WIDTH_PX}px,var(--gellatti-account-max-width,${HEADER_ACCOUNT_MAX_WIDTH_PX}px))]`,
    );
    expect(slotClass).not.toContain('max-w-52');
    expect(slot).toContain('title={user.email ?? undefined}');
  });
});
