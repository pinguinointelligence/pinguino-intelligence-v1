/**
 * `.theme-pro-dark` CONTRAST PROOF (owner P0 UX repair, 2026-07-24).
 *
 * The owner rejected the staging /pro/recipe design: CharcoalPanel (`bg-ink text-ivory`)
 * washed out ivory-on-ivory because the dark scope remaps `--color-ink` to ivory for
 * text/actions. This suite proves — from the REAL stylesheet values, not assumptions —
 * that the repair holds:
 *
 *  1. token level: every surface token inside `.theme-pro-dark` is DARK and reads at
 *     ≥ 4.5:1 (WCAG AA) against the ivory text token; `--color-charcoal` stays a dark
 *     surface (the regression that caused the blank beige panels is impossible);
 *  2. component level: the Monitor / right-panel components are rendered with a REAL
 *     engine result and every text node's computed color pair (Tailwind class →
 *     resolved token → alpha-composited over its effective background) is ≥ 4.5:1.
 *
 * The resolver reads `src/styles/tokens.css` + `src/styles/theme-pro-dark.css`
 * directly, so a future token change that breaks contrast fails HERE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { calculateRecipe, proposeCorrections, type RecipeResult } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { OverallScoreCard } from '@/features/pi-panel/OverallScoreCard';
import { UserMonitorPro } from '@/features/user-monitor';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { ReviewMarkedModule } from '@/features/design-review/ReviewMarkedModule';

/* ───────────────────────── stylesheet → token resolution ───────────────────────── */

const STYLES_DIR = import.meta.dirname;
const tokensCss = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8');
const proDarkCss = readFileSync(join(STYLES_DIR, 'theme-pro-dark.css'), 'utf8');

function parseVars(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]!] = match[2]!.trim();
  }
  return vars;
}

/** The EFFECTIVE custom-property table inside `.theme-pro-dark` (base + overrides). */
const THEME: Record<string, string> = { ...parseVars(tokensCss), ...parseVars(proDarkCss) };

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseHex(value: string): RGBA | null {
  const hex = value.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
  if (!m) return null;
  const h = m[1]!;
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0], 16),
      g: parseInt(h[1]! + h[1], 16),
      b: parseInt(h[2]! + h[2], 16),
      a: 1,
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** Resolve a token value (follows `var(--x)` chains) to RGBA. */
function resolveToken(name: string): RGBA | null {
  let value = THEME[name];
  for (let i = 0; value !== undefined && i < 8; i += 1) {
    const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value.trim());
    if (!ref) break;
    value = THEME[ref[1]!];
  }
  return value === undefined ? null : parseHex(value);
}

/** Non-token colors reachable in the audited markup (Tailwind defaults + CSS keywords). */
const EXTRA_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  'amber-200': '#fde68a',
  'amber-300': '#fcd34d',
  'amber-700': '#b45309',
  'stone-300': '#d6d3d1',
  'stone-400': '#a8a29e',
  'stone-500': '#78716c',
  'stone-600': '#57534e',
};

/** `text-ivory/65` → RGBA; returns null for unknown/none. */
function classColor(utility: string): RGBA | 'transparent' | null {
  const m = /^(?:text|bg)-([a-z0-9-]+(?:-[a-z0-9]+)*)(?:\/(\d{1,3}|\[(0?\.\d+)\]))?$/.exec(utility);
  if (!m) return null;
  const name = m[1]!;
  if (name === 'transparent') return 'transparent';
  const base = resolveToken(`--color-${name}`) ?? parseHex(EXTRA_COLORS[name] ?? '');
  if (!base) return null;
  let alpha = base.a;
  if (m[2] !== undefined) {
    alpha = m[3] !== undefined ? Number(m[3]) : Number(m[2]) / 100;
  }
  return { ...base, a: alpha };
}

/* ─────────────────────────── WCAG math (sRGB, exact) ─────────────────────────── */

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(c: RGBA): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrastRatio(a: RGBA, b: RGBA): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Alpha-composite `top` over an OPAQUE `bottom` (sRGB space — what browsers do). */
function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  };
}

/* ──────────────── static-markup walker (node env — no jsdom needed) ──────────────── */

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'circle', 'path']);

interface Frame {
  tag: string;
  bg: RGBA;
  text: RGBA | null;
  hidden: boolean;
}

export interface AuditedPair {
  text: string;
  fg: string;
  bg: string;
  ratio: number;
}

/** Walk rendered HTML: every visible text node gets (composited fg, effective bg, ratio). */
function auditContrast(html: string, rootBg: RGBA, rootText: RGBA): AuditedPair[] {
  const pairs: AuditedPair[] = [];
  const stack: Frame[] = [{ tag: '#root', bg: rootBg, text: rootText, hidden: false }];
  let svgDepth = 0;

  for (const token of html.matchAll(/<[^>]+>|[^<]+/g)) {
    const chunk = token[0];
    if (chunk.startsWith('</')) {
      const tag = /^<\/([a-zA-Z0-9]+)/.exec(chunk)?.[1]?.toLowerCase() ?? '';
      if (tag === 'svg') svgDepth = Math.max(0, svgDepth - 1);
      else if (svgDepth === 0 && stack.length > 1) stack.pop();
      continue;
    }
    if (chunk.startsWith('<')) {
      const tag = /^<([a-zA-Z0-9]+)/.exec(chunk)?.[1]?.toLowerCase() ?? '';
      if (tag === 'svg') {
        svgDepth += 1;
        continue;
      }
      if (svgDepth > 0) continue;
      const selfClosing = chunk.endsWith('/>') || VOID_TAGS.has(tag);
      const parent = stack[stack.length - 1]!; // root frame always present
      const classAttr = /class="([^"]*)"/.exec(chunk)?.[1] ?? '';
      const hidden = parent.hidden || /aria-hidden(?:="true")?/.test(chunk);
      let bg = parent.bg;
      let text = parent.text;
      for (const cls of classAttr.split(/\s+/)) {
        if (cls.includes(':')) continue; // variant prefixes (hover:, disabled:, lg:, …)
        if (cls.startsWith('bg-')) {
          const c = classColor(cls);
          if (c === 'transparent') continue;
          if (c) bg = composite(c, bg);
        } else if (cls.startsWith('text-') && classColor(cls) !== null) {
          const c = classColor(cls);
          if (c && c !== 'transparent') text = c;
        }
      }
      if (!selfClosing) stack.push({ tag, bg, text, hidden });
      continue;
    }
    // text node
    if (svgDepth > 0) continue;
    const textContent = chunk.replace(/&[a-z#0-9]+;/gi, 'x').trim();
    if (textContent.length === 0) continue;
    const frame = stack[stack.length - 1]!; // root frame always present
    if (frame.hidden) continue;
    const fg = frame.text ?? { r: 255, g: 255, b: 255, a: 1 };
    const composited = composite(fg, frame.bg);
    pairs.push({
      text: textContent.slice(0, 48),
      fg: `rgb(${composited.r},${composited.g},${composited.b})`,
      bg: `rgb(${frame.bg.r},${frame.bg.g},${frame.bg.b})`,
      ratio: Math.round(contrastRatio(composited, frame.bg) * 100) / 100,
    });
  }
  return pairs;
}

/* ─────────────────────────────── real fixtures ─────────────────────────────── */

function realResult(): RecipeResult {
  let s = createCustomerFlow({ text: 'lody pistacjowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a calculated recipe');
  return calculateRecipe(input);
}

function realInput() {
  let s = createCustomerFlow({ text: 'lody pistacjowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a recipe input');
  return input;
}

const syntheticPreview = (): ConstraintPreview => ({
  kind: 'optimize',
  titlePl: constraintStudioCopy.preview.kindLabels.optimize,
  baseFingerprint: 'fp',
  proposedInput: starterMilkBase(),
  nextConstraints: { byLineId: {} },
  lines: [
    { lineId: 'l-milk', name: 'Mleko 3,5%', beforeGrams: 600, afterGrams: 600, kind: 'unchanged', locked: true },
    { lineId: 'l-sucrose', name: 'Sacharoza', beforeGrams: 82, afterGrams: 74, kind: 'changed', locked: false },
    { lineId: 'l-zero', name: 'Dekstroza', beforeGrams: 0, afterGrams: 0, kind: 'unchanged', locked: false },
  ],
  violationsBefore: 2,
  violationsAfter: 0,
  explanation: [],
  engineVersion: 'e',
  configVersion: 'c',
  createdAt: '2026-07-17T12:00:00.000Z',
});

const SHELL = resolveToken('--color-shell')!;
const IVORY = resolveToken('--color-ivory')!;

const renderShell = (el: ReactElement): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <SurfaceToneContext.Provider value="shell">{el}</SurfaceToneContext.Provider>
    </MemoryRouter>,
  );

/* ─────────────────────────────────── proofs ─────────────────────────────────── */

describe('theme-pro-dark tokens — surfaces DARK, ivory text AA (stylesheet-derived)', () => {
  it('resolves --color-charcoal to a DARK surface inside the scope (the beige-panel regression is impossible)', () => {
    const charcoal = resolveToken('--color-charcoal');
    expect(charcoal).not.toBeNull();
    expect(luminance(charcoal!)).toBeLessThan(0.05);
    // …and it is NOT the remapped ink/ivory text token.
    const ink = resolveToken('--color-ink')!;
    expect(luminance(ink)).toBeGreaterThan(0.5); // ink is ivory text in this scope
    expect(contrastRatio(charcoal!, ink)).toBeGreaterThanOrEqual(7);
  });

  it('every surface token vs the ivory text token is ≥ 4.5:1', () => {
    for (const surface of [
      '--color-paper',
      '--color-charcoal',
      '--color-shell',
      '--color-shell-raised',
      '--color-graphite',
      '--color-graphite-raised',
    ]) {
      const bg = resolveToken(surface);
      expect(bg, surface).not.toBeNull();
      const ratio = contrastRatio(bg!, IVORY);
      expect(ratio, `${surface} vs ivory = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('status + accent text tokens are ≥ 4.5:1 on the raised charcoal surface', () => {
    const raised = resolveToken('--color-graphite-raised')!;
    for (const token of [
      '--color-status-ideal',
      '--color-status-risky',
      '--color-status-error',
      '--color-gold',
      '--color-review',
      '--color-amber-700',
      '--color-stone-500',
      '--color-stone-600',
    ]) {
      const fg = resolveToken(token);
      expect(fg, token).not.toBeNull();
      const ratio = contrastRatio(fg!, raised);
      expect(ratio, `${token} on graphite-raised = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Monitor / right-panel components — every rendered text node ≥ 4.5:1', () => {
  const result = realResult();
  const input = realInput();
  const corrections = proposeCorrections({ input, context: recipeContext(input), redact: false });

  const CASES: Array<[string, () => string]> = [
    ['UserMonitorPro', () => renderShell(<UserMonitorPro result={result} servingTemperatureC={-12} />)],
    ['OverallScoreCard', () => renderShell(<OverallScoreCard result={result} mode="classic" />)],
    ['NutritionCostScorePanel', () => renderShell(<NutritionCostScorePanel result={result} />)],
    [
      'CorrectionPanel',
      () => renderShell(<CorrectionPanel corrections={corrections} recipeIncomplete={false} />),
    ],
    [
      'ConstraintPreviewCard (incl. de-emphasized 0 g lines)',
      () =>
        renderShell(
          <ConstraintPreviewCard preview={syntheticPreview()} onApply={() => {}} onCancel={() => {}} />,
        ),
    ],
    [
      'ReviewMarkedModule (red badge)',
      () =>
        renderShell(
          <ReviewMarkedModule id="x" title="Moduł" badge="DO PRZEGLĄDU" note="Notatka testowa.">
            <p>Zawartość</p>
          </ReviewMarkedModule>,
        ),
    ],
  ];

  for (const [name, render] of CASES) {
    it(`${name}: no text node below 4.5:1 against its effective background`, () => {
      const pairs = auditContrast(render(), SHELL, IVORY);
      expect(pairs.length).toBeGreaterThan(0);
      const failing = pairs.filter((pair) => pair.ratio < 4.5);
      expect(
        failing,
        failing.map((p) => `"${p.text}" ${p.fg} on ${p.bg} = ${p.ratio}:1`).join('\n'),
      ).toEqual([]);
    });
  }

  it('the Monitor panel actually renders on a DARK charcoal surface with light text (computed pair)', () => {
    const html = renderShell(<UserMonitorPro result={result} servingTemperatureC={-12} />);
    expect(html).toContain('bg-charcoal');
    const pairs = auditContrast(html, SHELL, IVORY);
    // Every audited background inside the panel is dark (no beige block can exist).
    for (const pair of pairs) {
      const bg = /rgb\((\d+),(\d+),(\d+)\)/.exec(pair.bg)!;
      const lum = luminance({ r: Number(bg[1]), g: Number(bg[2]), b: Number(bg[3]), a: 1 });
      expect(lum, `${pair.text} bg ${pair.bg}`).toBeLessThan(0.2);
    }
  });
});
