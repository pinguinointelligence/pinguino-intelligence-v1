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
 * ── SUPERSEDED BY THE ACCEPTED DESIGN V3.0 — 2026-09-17 (IV-B, IV-C, XII) ────────
 * The 2026-09-06 contract was:
 *
 *     ingredient | Crown (only where Main is allowed) | 84 g | [ ⋯ ]
 *
 * with „Zmień ilość” in the „•••” menu opening a centred dialog (`HomeChangeAmountDialog`)
 * that held the amount as a draft with „Gotowe” and „Anuluj”. The owner-accepted DESIGN
 * V3.0 replaces the row menu, its sheet, the separate „Zmień ilość” view and the row's
 * Crown button: the WHOLE row is a button that opens the SAME ingredient panel PRO uses,
 * as a compact bottom layer, with ⓘ · ⇄ · Crown, the amount pill with its padlock, and
 * „Usuń” | „Gotowe”.
 *
 * None of this evidence is deleted; all of it is recorded here as history.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * CURRENT CONTRACT (DESIGN V3.0) — the row is ALWAYS a readout, and the row IS the way in:
 *
 *     [ ingredient · Główny / Topping (information) ·············· 84 g 🔒 ]
 *
 * Unchanged across all four: the row carries no editor of its own, the editor is the
 * canonical shared control rather than a HOME lookalike, the amount is a DRAFT that only
 * „Gotowe” commits, and each collection commits through ITS OWN store action (#207).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const row = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
const control = readFileSync('src/features/ingredient-builder/DirectNumberControl.tsx', 'utf8');
const panel = readFileSync('src/features/home-creator/ui/HomeIngredientPanel.tsx', 'utf8');
const editor = readFileSync('src/features/ingredient-builder/IngredientLineControls.tsx', 'utf8');

/** The row components — the readout and the row button, and nothing else. */
const defaultRow = row.slice(
  row.indexOf('function HomeRowAmount({'),
  row.indexOf('const pillButton ='),
);

describe('the default row carries no permanent editor', () => {
  it('renders a plain readout, not a control', () => {
    expect(defaultRow).toContain('data-testid={`home-amount-${lineId}`}');
    // No stepper, no padlock segment, no input in the row.
    expect(defaultRow).not.toContain('DirectNumberControl');
    expect(defaultRow).not.toContain('lockSegment');
    expect(defaultRow).not.toContain('<input');
  });

  it('shows the amount when entitled and the mask when not', () => {
    expect(defaultRow).toContain(
      '{canSeeGrams ? Math.round(grams) : homeCreatorCopy.recipe.maskedGramsValue}',
    );
    expect(defaultRow).toContain('homeCreatorCopy.recipe.grams');
  });

  it('rounds like the editor does, so a readout never shows float noise', () => {
    // Served signed-in the rows read „87.10000000000001 g"; the editor renders the same
    // number with `decimals: 0`, so the readout has to agree.
    expect(defaultRow).toContain('Math.round(grams)');
    expect(panel).toContain('decimals: 0');
  });

  it('marks a locked amount with the padlock icon — information, not a second button', () => {
    expect(defaultRow).toContain("data-locked={locked ? 'true' : undefined}");
    expect(defaultRow).toContain('<LockGlyph />');
    // The only button in a row is the row itself.
    expect(defaultRow.match(/<button/g) ?? []).toHaveLength(1);
  });

  it('DESIGN IV-B: the whole row opens the panel; the row menu and the row Crown are gone', () => {
    expect(defaultRow).toContain('onClick={onOpen}');
    for (const gone of [
      'home-row-menu',
      'home-row-change-amount',
      'home-row-toggle-lock',
      'function RowMenu',
      'function CrownControl',
      'HomeChangeAmountDialog',
    ]) {
      expect(row, gone).not.toContain(gone);
    }
  });

  it('„Główny” and „Topping” are information only', () => {
    expect(defaultRow).toContain('data-testid={`home-main-chip-${lineId}`}');
    expect(defaultRow).toContain('data-testid="home-topping-marker"');
    // The chip is a span, never a button of its own.
    const mainChip = defaultRow.slice(
      defaultRow.indexOf("chip === 'main' ? ("),
      defaultRow.indexOf("chip === 'topping' ? ("),
    );
    expect(mainChip).not.toContain('<button');
  });

  it('5B: a product without an amount reads „Wpisz ilość”', () => {
    expect(defaultRow).toContain('screen.enterAmount');
    expect(row).toContain('data-testid="home-recipe-pending"');
  });
});

describe('the ingredient editor is the shared control, summoned not resident', () => {
  it('opens only for the row being edited', () => {
    expect(row).toContain('const [editor, setEditor] = useState<EditorTarget | null>(null)');
    expect(row).toContain('{panelTarget ? (');
    expect(row).toContain('<HomeIngredientPanel');
  });

  it('is the SAME editor PRO uses, from the ingredient builder — not a HOME copy', () => {
    expect(panel).toContain('IngredientEditorPanel');
    expect(panel).toContain("from '@/features/ingredient-builder/IngredientLineControls'");
    expect(editor).toContain('export function IngredientEditorPanel(');
    // …and the amount inside it is the canonical DirectNumberControl.
    const editorBody = editor.slice(editor.indexOf('export function IngredientEditorPanel('));
    expect(editorBody).toContain('<DirectNumberControl');
  });

  it('holds the value as a draft, so leaving without „Gotowe” is a genuine no-op', () => {
    expect(panel).toContain('const latest = useRef<number | null>(null);');
    expect(panel).toContain('onChange: publish,');
    // The ONLY paths that reach the caller's commit read what the field JUST published
    // (served 2026-09-18: Enter confirmed a stale draft).
    expect(panel).toContain('const next = latest.current;');
    expect(panel).toContain('onClick: finish,');
    expect(panel).toContain('onBackdrop={finish}');
    // Escape closes without a commit.
    expect(panel).toContain('onClose={onClose}');
  });

  it('opening the panel and pressing „Gotowe” without a change writes nothing', () => {
    expect(panel).toContain('if (next !== null && next !== target.grams) target.commit(next);');
  });

  it('offers the DESIGN affordances and no invented copy', () => {
    expect(panel).toContain('homeCreatorCopy.recipe.doneAmount');
    expect(panel).toContain('homeCreatorCopy.recipe.remove');
    expect(panel).toContain('homeCreatorCopy.recipe.findSubstitute');
    expect(panel).toContain('homeCreatorCopy.recipe.crown');
  });

  it('HOME shows no price and no percent in the panel (§52)', () => {
    for (const forbidden of [
      'CustomerPriceEditor',
      'IngredientPriceCell',
      'priceView',
      'setPlannedPercent',
      "suffix: '%'",
    ]) {
      expect(panel, forbidden).not.toContain(forbidden);
    }
  });

  it('routes every mutation through canonical store authority', () => {
    /* The amount control never GUESSES which collection owns a row. A recipe line and a
       topping live in different store collections with different actions, and the
       control once called the Base grams action for both — which looks the line up in
       `state.items` and returns early when it is not there, so every topping edit was
       silently dropped. The row names its own authority. */
    expect(row).toContain('setExactGrams(item.id, next)');
    expect(row).toContain('setToppingGrams(topping.id, next)');
    expect(row).toContain('setGramLock(item.id,');
  });

  it('keeps the padlock and the masking on the summoned control', () => {
    expect(panel).toContain("testId: 'home-panel-lock'");
    expect(panel).toContain('value: homeCreatorCopy.recipe.maskedGramsValue');
    expect(panel).toContain('onInteract: onBlocked');
    expect(editor).toContain('maskedValue: amount.masked.value');
    expect(editor).toContain('onMaskedInteract: amount.masked.onInteract');
  });

  it('omits the padlock for a topping, which has no lock to offer', () => {
    expect(panel).toContain('lock: target.onToggleLock');
    expect(row).toContain('onToggleLock: undefined,');
  });

  it('adds no HOME-specific arithmetic', () => {
    for (const source of [row, panel]) {
      for (const forbidden of [
        'calculateRecipe(',
        'Math.round(grams *',
        'rescale(',
        'runSolver',
        'solveRecipe',
        'solveFor',
      ]) {
        expect(source, forbidden).not.toContain(forbidden);
      }
    }
  });
});

describe('Crown is a direct action on canonical authority', () => {
  it('is offered only where Main is currently held or canonically selectable', () => {
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
    expect(panel).toContain('pressed: target.crown.isMain');
    expect(editor).toContain('aria-pressed={action.pressed}');
  });
});

describe('the panel carries no PRO-only product action', () => {
  it('shows only the category and „Pełne dane składnika” under ⓘ (DESIGN VI)', () => {
    expect(panel).toContain('copy.category');
    expect(panel).toContain('copy.fullData');
    for (const gone of ['Dostępność', 'W recepturze', 'dontHaveThis', 'confidence_score']) {
      expect(panel, gone).not.toContain(gone);
    }
  });

  it('never falls back to an emoji padlock in HOME', () => {
    expect(row).not.toContain('🔒');
    expect(panel).not.toContain('🔒');
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
