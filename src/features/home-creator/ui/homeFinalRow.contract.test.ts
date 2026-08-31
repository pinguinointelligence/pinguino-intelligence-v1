/**
 * FINAL HOME INGREDIENT ROW — owner-locked 2026-08-31.
 *
 *   ingredient | [ − ] [ grams/value ] [ + ] [ CLOSED lock ] [ ⋯ ]
 *
 * The customer must see the final application architecture from the beginning; only data
 * and function availability change with entitlement.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const row = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
const control = readFileSync('src/features/ingredient-builder/DirectNumberControl.tsx', 'utf8');

describe('the row uses the shared PRO control family, not a HOME copy', () => {
  it('renders the canonical DirectNumberControl', () => {
    expect(row).toContain('DirectNumberControl');
    expect(row).toContain("from '@/features/ingredient-builder/DirectNumberControl'");
  });

  it('routes every mutation through canonical store authority', () => {
    expect(row).toContain('setPlannedGrams(lineId, next)');
    expect(row).toContain('setLockType(lineId,');
  });

  it('adds no HOME-specific arithmetic', () => {
    for (const forbidden of [
      'calculateRecipe(',
      'Math.round(grams *',
      'rescale',
      '* 0.01',
      'solve',
    ]) {
      expect(row, forbidden).not.toContain(forbidden);
    }
  });
});

describe('geometry does not change with entitlement', () => {
  it('shows the mask INSIDE the value segment, not instead of the control', () => {
    expect(control).toContain('maskedValue');
    // The mask is rendered in the col-start-2 value cell, beside the same hidden input.
    const valueCell = control.slice(
      control.indexOf("'col-start-2 row-start-1"),
      control.indexOf('onFocus='),
    );
    expect(valueCell).toContain('maskedValue');
    expect(valueCell).toContain('hidden={masked}');
  });

  it('keeps the four-segment geometry in both states', () => {
    // Same grid regardless of masking — masking never selects a different width.
    expect(control).toContain('grid-cols-[44px_72px_44px_44px]');
    const gridExpr = control.slice(
      control.indexOf('widthPreset ==='),
      control.indexOf('data-control-locked'),
    );
    expect(gridExpr).not.toContain('masked');
  });

  it('keeps the controls present for non-entitled users and routes them to the paywall', () => {
    expect(row).toContain('onMaskedInteract: onBlocked');
    expect(control).toContain('onMaskedInteract?.()');
    // Not simply disabled — a disabled stepper would read as a broken app.
    expect(row).not.toMatch(/disabled=\{!canSeeGrams\}/);
  });
});

describe('the padlock rule', () => {
  it('uses ONE closed padlock glyph in both lock states', () => {
    expect(control.match(/function LockGlyph/g) ?? []).toHaveLength(1);
    expect(control).not.toMatch(/OpenLockGlyph|lockOpen|unlockedGlyph/);
    // Two glyphs would mean the state is drawn, not coloured.
    const lockButton = control.slice(
      control.indexOf('{lockSegment ? ('),
      control.indexOf('</button>\n      ) : null}'),
    );
    expect(lockButton.match(/<LockGlyph \/>/g) ?? []).toHaveLength(1);
  });

  it('expresses lock state through surface/colour only', () => {
    expect(control).toContain('lockSegment.pressed');
    expect(control).toContain("'bg-stone-200 text-ink'");
  });

  it('never falls back to an emoji padlock in HOME', () => {
    expect(row).not.toContain('🔒');
  });
});
