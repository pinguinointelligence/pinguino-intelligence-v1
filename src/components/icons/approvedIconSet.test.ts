/**
 * The approved PINGÜINO icon set is the ONLY source of the semantic marks
 * (owner reference sheet, 2026-08-24).
 *
 * This exists because served QA caught what unit tests and a source review both
 * missed: the Monitor's Sweetness and Hardness rows are rendered by a DIFFERENT
 * component (`MonitorLiveSummary`) than the other five (`ProfessionalMonitor-
 * Modules`), so replacing the glyphs in one file left ✣ and ◇ shipping in the
 * other. A per-file review cannot see that; a sweep can.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') && !full.includes('.test.') ? [full] : [];
  });
}

/** Glyphs previously used AS icons for a concept the approved set now covers. */
const SEMANTIC_GLYPHS = ['❄', '◉', '⌘', '♧', '✣', '◆', '❤', '💧', '🛡'];

/**
 * Concepts the approved reference sheet does NOT cover. Their marks are left
 * exactly as they were and tagged `data-icon-status="awaiting-approved-design"`
 * in the source — nothing is invented for them. Removing an entry from this
 * list is how a newly approved icon gets enforced.
 */
const AWAITING_APPROVED_DESIGN: ReadonlyArray<{ file: string; glyph: string; concept: string }> =
  [];

describe('approved icon set', () => {
  const files = tsxFiles(join(SRC, 'features')).concat(tsxFiles(join(SRC, 'pages')));

  it('no semantic concept is drawn with a Unicode glyph anywhere in the app', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const glyph of SEMANTIC_GLYPHS) {
        // Ignore prose in comments; only flag glyphs that reach the DOM.
        const rendered = source
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
          .join('\n');
        if (!rendered.includes(glyph)) continue;
        const excused = AWAITING_APPROVED_DESIGN.some(
          (entry) => file.endsWith(entry.file) && entry.glyph === glyph,
        );
        if (excused) {
          // An unapproved concept must still declare itself in the source.
          expect(rendered, file).toContain('data-icon-status="awaiting-approved-design"');
          continue;
        }
        offenders.push(`${file.replace(SRC, '')} → ${glyph}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('both Monitor renderers use the shared set — not just one of them', () => {
    for (const parts of [
      ['features', 'pro-workbench', 'ProfessionalMonitorModules.tsx'],
      ['features', 'pro-workbench', 'MonitorLiveSummary.tsx'],
    ] as const) {
      const source = readFileSync(join(SRC, ...parts), 'utf8');
      expect(source, parts.join('/')).toContain('@/components/icons/PinguinoIcons');
      expect(source, parts.join('/')).toContain('PINGUINO_ICON_CIRCLE');
    }
  });

  it('icon colour is always a token, never an ad-hoc hex beside the mark', () => {
    const icons = readFileSync(join(SRC, 'components', 'icons', 'PinguinoIcons.tsx'), 'utf8');
    // Hex literals live only in the token module.
    expect(icons).not.toMatch(/#[0-9a-fA-F]{6}/);
    const tokens = readFileSync(join(SRC, 'components', 'icons', 'pinguinoIconTokens.ts'), 'utf8');
    for (const value of [
      '#ef3b5b',
      '#1676f3',
      '#3f9bf5',
      '#f58a07',
      '#bb1684',
      '#18a83a',
      '#7d5a3c',
    ])
      expect(tokens, value).toContain(value);
  });

  it('every icon keeps the same house geometry so the set reads as one hand', () => {
    const icons = readFileSync(join(SRC, 'components', 'icons', 'PinguinoIcons.tsx'), 'utf8');
    expect(icons).toContain('viewBox="0 0 24 24"');
    expect(icons).toContain('strokeWidth={1.75}');
    expect(icons).toContain('strokeLinecap="round"');
    expect(icons).toContain('strokeLinejoin="round"');
    // 17 approved marks, including the V2.1 nutrition and cost summary pair.
    expect(icons.match(/^export function \w+Icon\(/gm)).toHaveLength(17);
  });

  it('unapproved category marks are flagged, not silently invented', () => {
    const category = readFileSync(
      join(SRC, 'features', 'ingredient-builder', 'IngredientCategoryIcon.tsx'),
      'utf8',
    );
    expect(category).toContain('data-icon-status="awaiting-approved-design"');
  });
});
