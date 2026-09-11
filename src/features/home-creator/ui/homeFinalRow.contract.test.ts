/**
 * HOME INGREDIENT ROW.
 *
 * ── SUPERSEDED BY OWNER — 2026-08-31 ─────────────────────────────────────────────
 * The original contract required EVERY row to carry the final editing control at all
 * times:
 *
 *     ingredient | [ − ] [ grams/value ] [ + ] [ CLOSED lock ] [ ⋯ ]
 *
 * It was implemented and green. Served, six ingredients meant six permanent editors
 * and the recipe read as a control panel, so the owner replaced it.
 *
 * ── SUPERSEDED BY OWNER — 2026-09-06 ─────────────────────────────────────────────
 * Its replacement summoned the SAME control INTO THE ROW. Served, the owner reported:
 * „cały wiersz zamienia się w edytor i przesuwa układ". It was also a correctness
 * defect — the in-row control committed on every keystroke, so „Anuluj" had nothing
 * left to cancel, and the orange „changed" ring that compared against the opening
 * value existed only because the store had already been written.
 *
 * Neither piece of evidence is deleted; both are recorded here as history.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * CURRENT CONTRACT (owner 2026-09-06) — the row is ALWAYS a readout:
 *
 *     ingredient | Crown (only where Main is allowed) | 84 g | [ ⋯ ]
 *
 * „Zmień ilość" opens a stable overlay dialog holding the SAME shared PRO
 * `DirectNumberControl` — minus, field, plus, padlock, masking — plus „Gotowe" and
 * „Anuluj". The value is a DRAFT: nothing reaches the store until it is confirmed, so
 * cancelling is a genuine no-op. Opening it moves nothing on the page.
 *
 * Unchanged across all three: the row is a readout by default, the editor is the
 * canonical PRO control rather than a HOME lookalike, and each collection commits
 * through ITS OWN store action (#207).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const row = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
const control = readFileSync('src/features/ingredient-builder/DirectNumberControl.tsx', 'utf8');
const dialog = readFileSync('src/features/home-creator/ui/HomeChangeAmountDialog.tsx', 'utf8');

/** The row component — now the readout and nothing else. */
const defaultRow = row.slice(row.indexOf('function HomeRowAmount({'), row.indexOf('/**\n * Crown'));

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
      '{canSeeGrams ? Math.round(grams) : homeCreatorCopy.recipe.maskedGramsValue}',
    );
    expect(defaultRow).toContain('homeCreatorCopy.recipe.grams');
  });

  it('rounds like the editor does, so a readout never shows float noise', () => {
    // Served signed-in the rows read „87.10000000000001 g"; the editor renders the same
    // number with `decimals={0}`, so the readout has to agree.
    expect(defaultRow).toContain('Math.round(grams)');
    expect(row).toContain('decimals={0}');
  });

  it('marks a locked amount without adding a second button', () => {
    expect(defaultRow).toContain("locked && 'underline decoration-dotted underline-offset-4'");
    expect(defaultRow).toContain("data-locked={locked ? 'true' : undefined}");
  });
});

describe('the amount editor is the shared PRO control, summoned not resident', () => {
  it('opens only for the line being edited', () => {
    expect(row).toContain(
      'const [editingLineId, setEditingLineId] = useState<string | null>(null)',
    );
    expect(row).toContain('{editingItem ? (');
    expect(row).toContain('<HomeChangeAmountDialog');
  });

  it('overlays instead of expanding the row, so the list never shifts', () => {
    // The defect the owner reported: editing changed the row's own layout.
    expect(defaultRow).not.toContain('DirectNumberControl');
    expect(defaultRow).not.toContain('editing');
    expect(dialog).toContain("className=\"fixed inset-0 z-[95] grid place-items-center");
  });

  it('holds the value as a draft, so Anuluj is a genuine no-op', () => {
    expect(dialog).toContain('const [draft, setDraft] = useState(grams);');
    expect(dialog).toContain('onChange={setDraft}');
    // The ONLY paths that reach the caller's commit.
    expect(dialog).toContain('onClick={() => onConfirm(draft)}');
    expect(dialog).toContain("if (event.key === 'Enter') onConfirm(draft);");
    expect(dialog).toContain("if (event.key === 'Escape') onCancel();");
  });

  it('offers the owner-specified affordances and no invented copy', () => {
    expect(dialog).toContain('homeCreatorCopy.recipe.doneAmount');
    expect(dialog).toContain('homeCreatorCopy.recipe.askAmountCancel');
    expect(dialog).toContain('homeCreatorCopy.recipe.changeAmount');
  });

  it('reuses DirectNumberControl rather than a HOME lookalike', () => {
    expect(dialog).toContain('DirectNumberControl');
    expect(dialog).toContain("from '@/features/ingredient-builder/DirectNumberControl'");
  });

  it('routes every mutation through canonical store authority', () => {
    /* The amount control no longer GUESSES which collection owns a row. A recipe line
       and a topping live in different store collections with different actions, and the
       control called `setPlannedGrams` for both — which looks the line up in
       `state.items` and returns early when it is not there, so every topping edit was
       silently dropped. The row now names its own authority. */
    expect(row).toContain('setPlannedGrams(item.id, next)');
    expect(row).toContain('setToppingGrams(topping.id, next)');
    expect(row).toContain('setLockType(item.id,');
  });

  it('keeps the padlock and the masking props on the summoned control', () => {
    expect(dialog).toContain('lockSegment: {');
    expect(dialog).toContain('maskedValue: homeCreatorCopy.recipe.maskedGramsValue');
    expect(dialog).toContain('onMaskedInteract: onBlocked');
  });

  it('omits the padlock for a topping, which has no lock to offer', () => {
    expect(dialog).toContain('{...(onToggleLock');
    expect(row).toContain('onToggleLock: undefined,');
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
    expect(row).toContain(
      'resolveMainCapability({ snapshot: behaviorSnapshots[lineId], snapshotRequired: true })',
    );
    // No HOME Main rule of its own.
    expect(row).not.toMatch(/function\s+\w*[Mm]ainCapab/);
  });

  it('mutates through the canonical lock authority', () => {
    // On the HOME surface (owner regression brief 2026-09-11): HOME's Crown
    // rules are a HOME layer and must never change the PRO default.
    expect(row).toContain("setLockType(lineId, isMain ? 'unlocked' : 'main', 'home')");
  });

  it('communicates state, not a different glyph', () => {
    expect(row).toContain('aria-pressed={isMain}');
  });
});

describe('the overflow menu stays a HOME menu', () => {
  const menu = row.slice(
    row.indexOf('function RowMenu({'),
    row.indexOf('export function HomeRecipeSection'),
  );

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
