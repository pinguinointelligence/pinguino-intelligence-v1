/** @vitest-environment jsdom */
/**
 * PINGÜINO Pro sticky workbar contract (owner binding decision: primary actions always at top).
 *
 * Static-render with the store + canonical-save hook mocked (so states are deterministic). Proves:
 * a NEW recipe shows the inline name field + „Zapisz recepturę" beside it; a SAVED recipe shows the
 * name + `DD.MM.YYYY · vN` + „Zapisz nową wersję (vN+1)"; clean/dirty status; and that „Przelicz z PI"
 * + „Monitor PI" are ALWAYS rendered in the workbar (not only at the page bottom).
 */
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import {
  FRIENDLY_LAB_MOMENT_EVENT,
  type FriendlyLabMomentEventDetail,
} from '@/components/shared/friendlyLabMoment';

interface MockRecipeState {
  savedRecipeId: string | null;
  savedRecipeName: string | null;
  currentVersionNumber: number | null;
  currentVersionDate: string | null;
  dirty: boolean;
  category: string;
  visibleProductType: string;
  mode: string;
  formulation_strategy: 'optimal' | 'eco';
  target_temperature_c: number;
  target_batch_grams: number;
  machineKind: 'professional' | 'home' | null;
  servingModeId: string | null;
  machineLabel: string | null;
}

let mockState: MockRecipeState = {
  savedRecipeId: null,
  savedRecipeName: null,
  currentVersionNumber: null,
  currentVersionDate: null,
  dirty: false,
  category: 'milk_gelato',
  visibleProductType: 'gelato',
  mode: 'premium',
  target_temperature_c: -12,
  formulation_strategy: 'optimal',
  target_batch_grams: 1000,
  machineKind: null,
  servingModeId: null,
  machineLabel: null,
};
let mockHistoryLength = 0;
const mockSave = {
  blocked: null,
  busy: false,
  error: null,
  clearError: () => {},
  createNew: async () => true,
  saveVersion: async () => true,
  rename: async () => true,
  archive: async () => true,
  practicalBlocked: false,
  practicalBlockMessage: null,
  practicalBlock: null,
};

vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: Object.assign((sel: (s: MockRecipeState) => unknown) => sel(mockState), {
    subscribe: () => () => undefined,
  }),
}));
vi.mock('@/features/recipes/useCanonicalRecipeSave', () => ({
  useCanonicalRecipeSave: () => mockSave,
}));
vi.mock('@/features/constraint-studio/constraintStudioStore', () => ({
  useConstraintStudioStore: (selector: (state: { history: unknown[] }) => unknown) =>
    selector({ history: Array.from({ length: mockHistoryLength }) }),
}));

const { ProWorkbar } = await import('./ProWorkbar');
const w = copy.proWorkbar;

const render = (
  state: Partial<MockRecipeState>,
  variant: 'bar' | 'panel' = 'bar',
  section = 'recipe',
) => {
  mockState = { ...mockState, ...state };
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/pro/${section}`]}>
      <Routes>
        <Route path="/pro/:section" element={<ProWorkbar variant={variant} />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('ProWorkbar (sticky top workbar)', () => {
  // OWNER 2026-09-03 — ••• → Wersje is the ORIGIN half of the contextual back.
  it('links Wersje as an in-app navigation that names where it was opened from', () => {
    for (const variant of ['bar', 'panel'] as const) {
      for (const section of ['recipe', 'monitor', 'production'] as const) {
        const html = render({}, variant, section);
        expect(html, `${variant}/${section}`).toContain(`href="/pro/versions?from=${section}"`);
        // A raw document link would reload the SPA and throw the draft away —
        // which is what made this trip one-way in the first place.
        expect(html, `${variant}/${section}`).not.toContain('href="/pro/versions"');
      }
    }
  });

  it('orders New, Save, compact menu, then right-aligned recipe status', () => {
    const html = render({ savedRecipeId: null, dirty: false });
    expect(html).toContain('data-testid="pro-workbar-new-recipe"');
    expect(html).toContain('+ Nowa receptura');
    const newAt = html.indexOf('data-testid="pro-workbar-new-recipe"');
    const saveAt = html.indexOf('data-testid="pro-workbar-save"');
    const menuAt = html.indexOf('data-testid="pro-workbar-menu"');
    const statusAt = html.indexOf('data-testid="pro-workbar-status"');
    expect(newAt).toBeLessThan(saveAt);
    expect(saveAt).toBeLessThan(menuAt);
    expect(menuAt).toBeLessThan(statusAt);
    expect(html).toContain('data-workbar-action-size="primary"');
    expect(html).toContain('data-workbar-action-size="compact"');
  });

  it('renders the recipe IDENTITY card, with the save tongue reserved in every state', () => {
    // SUPERSEDED, owner authority 2026-09-02 (approved desktop PDF §3). This
    // used to pin the panel as a row of two 44 px pills with the status in the
    // band header. The owner replaced that architecture: RECEPTURA is now the
    // recipe's identity card at the TOP of the display column, the status lives
    // ON the card, and saving is an orange tongue that slides out from
    // underneath it. Only the presentation contract moved — every behaviour
    // assertion in this file is untouched.
    const html = render({ savedRecipeId: null, dirty: false }, 'panel');
    expect(html.match(/data-workbar-action-width="content"/g)).toHaveLength(2);
    expect(html).toContain('data-workbar-status-placement="identity-card"');
    expect(html).toContain('data-testid="pro-recipe-identity-card"');
    expect(html).toContain('data-workbar-save-shape="tongue"');
    // The 34 px are reserved in EVERY state, so the tongue's arrival cannot
    // move kcal, cost, the left edge or anything below it.
    expect(html).toContain('relative pb-[34px]');
    /* OWNER AUTHORITY 2026-09-03: three layers now share this band, and the
       order between them is the contract. The rule and the two actions sit at
       the bottom, the tongue slides out OVER the rule, and the card occludes
       the tongue's top — so the tongue still reads as coming from behind the
       card while the rule passes behind the tongue. */
    expect(html).toContain('z-[1] inline-flex h-[58px]');
    expect(html).toContain('relative z-[2]');
    expect(html).toContain('absolute inset-x-0 bottom-0 z-0 flex h-[34px]');
    // Exactly one status node — the card must not duplicate it.
    expect(html.match(/data-testid="pro-workbar-status"/g)).toHaveLength(1);
    /* SUPERSEDED, owner authority 2026-09-03. The panel used to render
       New → Save → name to satisfy a canonical ordering contract written when
       the actions stood ABOVE the card. The approved layout puts the card
       first and the actions beneath it, so that order would now walk a
       keyboard from the bottom-right control up to the name and back down to
       the bottom-left. Source order follows the eye instead: the card's name,
       then the two actions on the left of the band, then Save on its right.

       The bar variant is untouched and still asserts New → Save → menu →
       status in the test above; only the panel's own reading order moved. */
    const newAt = html.indexOf('data-testid="pro-workbar-new-recipe"');
    const saveAt = html.indexOf('data-testid="pro-workbar-save"');
    const nameAt = html.indexOf('data-testid="pro-workbar-name"');
    expect(nameAt).toBeLessThan(newAt);
    expect(newAt).toBeLessThan(saveAt);
  });

  it('shows the tongue when there is something to save and hides it when clean', () => {
    const unnamed = render({ savedRecipeId: null, savedRecipeName: null, dirty: false }, 'panel');
    expect(unnamed).toContain('data-recipe-identity-state="unnamed"');
    expect(unnamed).not.toContain('pointer-events-none opacity-0');

    const clean = render(
      {
        savedRecipeId: 'r1',
        savedRecipeName: 'Pistachio Dream',
        currentVersionNumber: 4,
        dirty: false,
      },
      'panel',
    );
    expect(clean).toContain('data-recipe-identity-state="saved"');
    // Present for the contract, inert and invisible: state B has no tongue.
    expect(clean).toContain('pointer-events-none opacity-0');

    const dirtyHtml = render(
      {
        savedRecipeId: 'r1',
        savedRecipeName: 'Pistachio Dream',
        currentVersionNumber: 4,
        dirty: true,
      },
      'panel',
    );
    expect(dirtyHtml).toContain('data-recipe-identity-state="dirty"');
    expect(dirtyHtml).not.toContain('pointer-events-none opacity-0');
  });

  it('NEW recipe: inline name field + „Zapisz recepturę" beside it + exact unsaved status', () => {
    const html = render({ savedRecipeId: null, savedRecipeName: null, currentVersionNumber: null });
    expect(html).toContain('data-testid="pro-workbar-name"');
    expect(html).toContain('data-testid="pro-workbar-save"');
    expect(html).toContain(w.saveNew); // Zapisz recepturę
    expect(w.status.newUnsaved).toBe('Niezapisane');
    expect(html).toContain('Niezapisane');
  });

  it('SAVED recipe: keeps the name editable and exposes the existing version save action', () => {
    const html = render({
      savedRecipeId: 'r1',
      savedRecipeName: 'Pistacja Premium',
      currentVersionNumber: 3,
      currentVersionDate: '2026-07-22T10:00:00.000Z',
      dirty: false,
    });
    expect(html).toContain('Pistacja Premium');
    expect(html).toContain('data-testid="pro-workbar-name"');
    expect(html).toContain('Zapisz nową wersję');
    expect(w.status.clean).toBe('Zapisane');
    expect(html).toContain('Zapisane');
    expect(html).toContain('v3');
    expect(html).toContain('>Wersje</a>');
    expect(html).not.toContain('DO PRZEGLĄDU');
  });

  it('shows the compact recipe context (product · tier · serving · batch)', () => {
    const html = render({
      savedRecipeId: 'r1',
      savedRecipeName: 'X',
      currentVersionNumber: 1,
      currentVersionDate: '2026-07-21T10:00:00.000Z',
      category: 'milk_gelato',
      mode: 'premium',
      formulation_strategy: 'eco',
      target_temperature_c: -12,
      target_batch_grams: 1000,
    });
    expect(html).toContain('Gelato');
    expect(html).toContain('ECO');
  });

  it('shows the applied-unsaved warning beside Save and clears it after save', () => {
    mockHistoryLength = 1;
    const dirty = render({ savedRecipeId: 'r1', savedRecipeName: 'X', dirty: true });
    expect(w.status.dirty).toBe('Niezapisane');
    expect(dirty).toContain('Niezapisane');
    expect(dirty).toContain('text-status-risky');
    expect(dirty).toContain('data-testid="pro-workbar-applied-unsaved"');
    expect(dirty).toContain('data-attention="required"');
    expect(dirty).toContain('gellatti-next-action-attention');
    expect(dirty).toContain(copy.proWorkbar.recalcPanel.applied);
    // OWNER FROZEN PRO VISUAL: the notice keeps its copy, its placement and
    // its clearing behaviour — all still asserted above — but unsaved is a
    // state the user created on purpose, so it reads as a quiet note on a
    // hairline rather than an amber card borrowing the weight of an error.
    expect(dirty).not.toContain('bg-pro-amber');
    expect(dirty).toContain('border-t border-[var(--g-line)] pt-2');

    const saved = render({ savedRecipeId: 'r1', savedRecipeName: 'X', dirty: false });
    expect(saved).toContain('Zapisane');
    expect(saved).toContain('text-stone-500');
    expect(saved).not.toContain('data-testid="pro-workbar-applied-unsaved"');
    expect(saved).not.toContain('data-attention="required"');
    mockHistoryLength = 0;
  });

  it('does not animate Save while the canonical practical-recipe guard blocks it', () => {
    mockSave.practicalBlocked = true;
    const html = render({ savedRecipeId: 'r1', savedRecipeName: 'X', dirty: true });
    expect(html).not.toContain('data-attention="required"');
    expect(html).not.toContain('gellatti-next-action-attention');
    mockSave.practicalBlocked = false;
  });

  it('shows the Friendly Lab save confirmation only after the canonical save succeeds', async () => {
    mockState = {
      ...mockState,
      savedRecipeId: 'r1',
      savedRecipeName: 'Pistacja Premium',
      dirty: true,
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const moments: FriendlyLabMomentEventDetail[] = [];
    const onMoment = (event: Event) =>
      moments.push((event as CustomEvent<FriendlyLabMomentEventDetail>).detail);
    window.addEventListener(FRIENDLY_LAB_MOMENT_EVENT, onMoment);
    try {
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={['/pro/recipe']}>
            <Routes>
              <Route path="/pro/:section" element={<ProWorkbar variant="panel" />} />
            </Routes>
          </MemoryRouter>,
        ),
      );
      const button = host.querySelector<HTMLButtonElement>('[data-testid="pro-workbar-save"]');
      expect(button).not.toBeNull();
      await act(async () => {
        button!.click();
        await Promise.resolve();
      });
      expect(moments).toHaveLength(1);
      expect(moments[0]).toMatchObject({ kind: 'save-complete' });
      expect(host.querySelector('[data-testid="pro-workbar-save-success"]')).toBeNull();
    } finally {
      window.removeEventListener(FRIENDLY_LAB_MOMENT_EVENT, onMoment);
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('returns to Niezapisane after another edit and reuses the ingredient warning-dot token', () => {
    const saved = render({ savedRecipeId: 'r1', savedRecipeName: 'X', dirty: false });
    expect(saved.match(/Zapisane/g)?.length).toBeGreaterThan(0);
    expect(saved).not.toContain('Niezapisane');

    const edited = render({ savedRecipeId: 'r1', savedRecipeName: 'X', dirty: true });
    expect(edited.match(/Niezapisane/g)?.length).toBeGreaterThan(0);
    expect(edited).not.toContain('Wszystkie zmiany zapisane');
    expect(edited).not.toContain('Niezapisane zmiany');

    const source = readFileSync(resolve(import.meta.dirname, 'ProWorkbar.tsx'), 'utf8');
    const ingredientRow = readFileSync(
      resolve(import.meta.dirname, '..', 'ingredient-builder', 'IngredientRow.tsx'),
      'utf8',
    );
    const tokens = readFileSync(
      resolve(import.meta.dirname, '..', '..', 'styles', 'tokens.css'),
      'utf8',
    );
    expect(source).toContain('w.status[statusKey]');
    expect(source.match(/data-testid="pro-workbar-status"/g)).toHaveLength(1);
    expect(source).toContain("? 'text-status-risky'");
    expect(ingredientRow).toContain('bg-status-risky');
    expect(ingredientRow).toContain('data-testid={`row-estimated-${item.id}`}');
    expect(tokens).toContain('--color-status-risky: #9c8a55;');
  });
});

describe('ProWorkbar machine-aware context (S4)', () => {
  const pm = copy.proMachine;
  const contextOf = (html: string) =>
    html.match(/data-testid="pro-workbar-context">([^<]*)</)?.[1] ?? '';

  it('a professional selection shows the visible serving temperature', () => {
    const ctx = contextOf(
      render({
        machineKind: 'professional',
        servingModeId: 'fresh',
        machineLabel: pm.professionalLabel,
        target_batch_grams: 1000,
      }),
    );
    expect(ctx).toContain('Gelato');
    expect(ctx).toContain(pm.serving.fresh); // Świeże
    expect(ctx).toContain('1000 g');
  });

  it('a professional −12 selection shows −12°C', () => {
    const ctx = contextOf(
      render({
        machineKind: 'professional',
        servingModeId: 'temp_minus_12',
        machineLabel: pm.professionalLabel,
        target_batch_grams: 1000,
      }),
    );
    expect(ctx).toContain(pm.serving.minus12); // −12°C
  });

  it('a home routing shows machine + batch ONLY — no false professional temperature', () => {
    const ctx = contextOf(
      render({
        machineKind: 'home',
        servingModeId: 'ninja_gelato',
        machineLabel: 'Ninja CREAMi',
        target_temperature_c: -13,
        target_batch_grams: 450,
      }),
    );
    expect(ctx).toContain('Ninja CREAMi');
    expect(ctx).toContain('450 g');
    expect(ctx).not.toContain('°C');
    expect(ctx).not.toContain('-13');
  });
});

describe('ProWorkbar wiring (no duplicate save; workbar mounted in /pro Receptura)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

  it('the /pro recipe workbench mounts the ProWorkbar inside the editor area', () => {
    const pro = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(pro).toContain('ProWorkbar');
    expect(pro).toContain('<ProWorkbar variant="panel"');
    expect(pro).toContain('onSaveAttentionChange={setRecipeSaveAttention}');
    expect(pro).toContain('recipeSaveAttention={recipeSaveAttention}');
  });

  it('the workbar delegates to the ONE canonical save handler (no second handler)', () => {
    const bar = read('features', 'pro-core', 'ProWorkbar.tsx');
    expect(bar).toContain('useCanonicalRecipeSave');
    // it must NOT call the repository/create directly (that lives only in the shared hook)
    expect(/\.createRecipe\(/.test(bar)).toBe(false);
    expect(/\.saveNewVersion\(/.test(bar)).toBe(false);
  });

  it('keeps the applied-unsaved message out of the score/current-result action bar', () => {
    const actionBar = read('features', 'pro-workbench', 'WorkbenchActionBar.tsx');
    expect(actionBar).not.toContain('{r.applied}');
    expect(actionBar).toContain('data-testid="workbench-undo"');
  });
});
