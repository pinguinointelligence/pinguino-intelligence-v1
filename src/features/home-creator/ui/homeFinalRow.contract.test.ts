/**
 * HOME INGREDIENT ROW.
 *
 * ── SUPERSEDED BY OWNER — 2026-09-02 ─────────────────────────────────────────────
 * The previous contract (owner-locked 2026-08-31) required EVERY row to carry the
 * final editing control at all times:
 *
 *     ingredient | [ − ] [ grams/value ] [ + ] [ CLOSED lock ] [ ⋯ ]
 *
 * It was implemented and green. Served, six ingredients meant six permanent editors
 * and the recipe read as a control panel, so the owner replaced it. The evidence for
 * the old contract is not deleted — it is recorded here as history.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * CURRENT CONTRACT (owner 2026-09-02) — the default row is a readout:
 *
 *     ingredient | Crown (only where Main is allowed) | 84 g | [ ⋯ ]
 *
 * The steppers and the padlock are summoned by „Zmień ilość" and are the SAME shared
 * PRO `DirectNumberControl`. Nothing about lock, masking, Main or mutation semantics
 * changed — only how long a control stays on screen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const row = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
const control = readFileSync('src/features/ingredient-builder/DirectNumberControl.tsx', 'utf8');

/** The default row renders from here down to the editing branch. */
const defaultRow = row.slice(row.indexOf('if (!editing) {'), row.indexOf('return (\n    <span className="flex shrink-0 items-center gap-2">'));

describe('the default row carries no permanent editor', () => {
  it('renders a plain readout, not a control', () => {
    expect(defaultRow).toContain('data-testid={`home-amount-${lineId}`}');
    // No stepper, no padlock, no input in the default state.
    expect(defaultRow).not.toContain('DirectNumberControl');
    expect(defaultRow).not.toContain('lockSegment');
    expect(defaultRow).not.toContain('<button');
  });

  it('shows the amount when entitled and the mask when not', () => {
    expect(defaultRow).toContain(
      '{canSeeGrams ? grams : homeCreatorCopy.recipe.maskedGramsValue}',
    );
    expect(defaultRow).toContain('homeCreatorCopy.recipe.grams');
  });

  it('marks a locked amount without adding a second button', () => {
    expect(defaultRow).toContain("locked && 'underline decoration-dotted underline-offset-4'");
    expect(defaultRow).toContain("data-locked={locked ? 'true' : undefined}");
  });
});

describe('the amount editor is the shared PRO control, summoned not resident', () => {
  it('opens only for the line being edited', () => {
    expect(row).toContain('editing={editingLineId === item.id}');
    expect(row).toContain('const [editingLineId, setEditingLineId] = useState<string | null>(null)');
  });

  it('reuses DirectNumberControl rather than a HOME lookalike', () => {
    expect(row).toContain('DirectNumberControl');
    expect(row).toContain("from '@/features/ingredient-builder/DirectNumberControl'");
  });

  it('routes every mutation through canonical store authority', () => {
    expect(row).toContain('setPlannedGrams(lineId, next)');
    expect(row).toContain('setLockType(lineId,');
  });

  it('keeps the padlock and the masking props on the summoned control', () => {
    expect(row).toContain('lockSegment={{');
    expect(row).toContain('maskedValue: homeCreatorCopy.recipe.maskedGramsValue');
    expect(row).toContain('onMaskedInteract: onBlocked');
  });

  it('uses the canonical orange for the changed state and invents no new style', () => {
    expect(row).toContain("boxShadow: '0 0 0 2px var(--g-orange)'");
    expect(row).not.toContain('#f58a07');
  });

  it('adds no HOME-specific arithmetic', () => {
    for (const forbidden of [
      'calculateRecipe(',
      'Math.round(grams *',
      'rescale(',
      'runSolver',
      'solveRecipe',
      'solveFor',
    ]) {
      expect(row, forbidden).not.toContain(forbidden);
    }
  });
});

describe('Crown is a direct action on canonical authority', () => {
  it('renders only where Main is currently held or canonically selectable', () => {
    expect(row).toContain('crownLineIds.includes(item.id) || mainSelectable(item.id)');
  });

  it('asks the canonical resolver, with a snapshot required', () => {
    expect(row).toContain('resolveMainCapability({ snapshot: behaviorSnapshots[lineId], snapshotRequired: true })');
    // No HOME Main rule of its own.
    expect(row).not.toMatch(/function\s+\w*[Mm]ainCapab/);
  });

  it('mutates through the canonical lock authority', () => {
    expect(row).toContain("setLockType(lineId, isMain ? 'unlocked' : 'main')");
  });

  it('communicates state, not a different glyph', () => {
    expect(row).toContain('aria-pressed={isMain}');
  });
});

describe('the overflow menu stays a HOME menu', () => {
  const menu = row.slice(row.indexOf('function RowMenu({'), row.indexOf('export function HomeRecipeSection'));

  it('offers exactly the three owner actions', () => {
    expect(menu).toContain('homeCreatorCopy.recipe.changeAmount');
    expect(menu).toContain('homeCreatorCopy.recipe.unlockLabel');
    expect(menu).toContain('homeCreatorCopy.recipe.lockLabel');
    expect(menu).toContain('homeCreatorCopy.recipe.removeIngredient');
  });

  it('carries no PRO product-data action', () => {
    for (const gone of ['findSubstitute', 'dontHaveThis', 'Dane składnika']) {
      expect(menu, gone).not.toContain(gone);
    }
  });

  it('never falls back to an emoji padlock in HOME', () => {
    expect(row).not.toContain('🔒');
  });
});

describe('the add actions are labelled, not anonymous', () => {
  it('uses the canonical pill trigger at every width', () => {
    expect(row).not.toContain('triggerVariant="icon"');
    expect(row.match(/triggerVariant="pill"/g) ?? []).toHaveLength(2);
    expect(row).toContain('triggerLabel={homeCreatorCopy.recipe.addIngredient}');
    expect(row).toContain('triggerLabel={homeCreatorCopy.recipe.addTopping}');
  });

  it('drops the desktop-only shadow label the icon variant needed', () => {
    expect(row).not.toContain('max-sm:hidden text-[13px]');
  });
});

describe('HOME never shows the pipeline its own diagnosis', () => {
  it('filters the picker notice into customer language', () => {
    expect(row.match(/sanitizeNotice=\{homeCustomerNotice\}/g) ?? []).toHaveLength(2);
  });
});

describe('the shared control itself is unchanged by any of this', () => {
  it('still keeps ONE closed padlock glyph in both lock states', () => {
    expect(control.match(/function LockGlyph/g) ?? []).toHaveLength(1);
    expect(control).not.toMatch(/OpenLockGlyph|lockOpen|unlockedGlyph/);
  });

  it('still renders no input while masked — hidden is not enough', () => {
    const valueCell = control.slice(
      control.indexOf("'col-start-2 row-start-1"),
      control.indexOf('onFocus='),
    );
    expect(valueCell).toContain('masked ? null : (');
    expect(valueCell).not.toContain('hidden={masked}');
  });

  it('still keeps the four-segment geometry independent of masking', () => {
    expect(control).toContain('grid-cols-[44px_72px_44px_44px]');
    const gridExpr = control.slice(
      control.indexOf('widthPreset ==='),
      control.indexOf('data-control-locked'),
    );
    expect(gridExpr).not.toContain('masked');
  });
});
