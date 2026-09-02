/**
 * WERSJA — the library's inline immutable-version selector (owner v1.4 Part A).
 *
 * The load-bearing rule is §5: choosing a version here is NAVIGATION. It records which snapshot
 * „Otwórz" should load and writes nothing — no restore, no parent update, no `updated_at`, no new
 * version. These tests pin the display contract and the pure selection helpers; the no-mutation
 * guarantee is proven structurally in `myRecipesVersionSelector.test.tsx`, which renders the page
 * against a repository that fails the test if any write method is called.
 */
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RecipeVersionSelector,
  defaultSelectedVersion,
  resolveSelectedVersion,
} from './RecipeVersionSelector';
import { formatSavedRecipeDate } from './savedRecipeDate';
import type { SavedRecipeVersionRef } from './recipePayload';

/** The owner's real recipe: v1 22.08 (UTC-late-evening), v2 and v3 on 23.08. Newest first. */
const HISTORY: SavedRecipeVersionRef[] = [
  { versionNumber: 3, createdAt: '2026-08-23T08:30:14.423624+00:00' },
  { versionNumber: 2, createdAt: '2026-08-23T08:28:38.846165+00:00' },
  { versionNumber: 1, createdAt: '2026-08-22T23:29:59.494922+00:00' },
];
const SINGLE: SavedRecipeVersionRef[] = [
  { versionNumber: 1, createdAt: '2026-08-22T23:29:59.494922+00:00' },
];

const render = (props: Partial<Parameters<typeof RecipeVersionSelector>[0]> = {}) =>
  renderToStaticMarkup(
    <RecipeVersionSelector
      versions={HISTORY}
      selected={3}
      onSelect={() => {}}
      recipeName="QA"
      {...props}
    />,
  );

describe('defaultSelectedVersion / resolveSelectedVersion', () => {
  it('defaults to the newest version', () => {
    expect(defaultSelectedVersion(HISTORY)).toBe(3);
    expect(defaultSelectedVersion(SINGLE)).toBe(1);
  });

  it('keeps an explicit pick that still exists', () => {
    expect(resolveSelectedVersion(HISTORY, 1)).toBe(1);
    expect(resolveSelectedVersion(HISTORY, 2)).toBe(2);
  });

  it('resets to the newest when the list reloads without the picked version', () => {
    // §12 „Reload": a restore elsewhere, or a refreshed list, must never leave the row pointing at
    // a version that is not in the history any more.
    expect(resolveSelectedVersion(SINGLE, 3)).toBe(1);
    expect(resolveSelectedVersion(HISTORY, undefined)).toBe(3);
  });

  it('falls back to the aggregate latest for a row whose history could not be read', () => {
    expect(resolveSelectedVersion([], 2, 7)).toBe(7);
    expect(resolveSelectedVersion([], undefined)).toBeNull();
  });
});

describe('RecipeVersionSelector — closed state', () => {
  it('shows the selected version with a chevron and nothing technical', () => {
    const html = render();
    expect(html).toContain('v3');
    expect(html).toContain('▾');
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no UUID
    expect(html.toLowerCase()).not.toContain('snapshot');
    expect(html.toLowerCase()).not.toContain('recipe_id');
  });

  it('renders a plain dash for a row with no readable history', () => {
    const html = render({ versions: [], selected: 1 });
    expect(html).toContain('—');
    expect(html).not.toContain('▾');
  });

  it('is a real control with an accessible name naming the recipe', () => {
    const html = render({ recipeName: 'QA Protein v2 -12C' });
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('QA Protein v2 -12C');
  });
});

describe('RecipeVersionSelector — open list', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const mount = async (
    versions: SavedRecipeVersionRef[],
    selected: number,
    onSelect: (n: number) => void = () => {},
    recipeName = 'QA',
  ) => {
    await act(async () => {
      root.render(
        <RecipeVersionSelector
          versions={versions}
          selected={selected}
          onSelect={onSelect}
          recipeName={recipeName}
        />,
      );
    });
  };
  const click = async (testId: string) => {
    const el = host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    expect(el, testId).not.toBeNull();
    await act(async () => el!.click());
  };
  const options = () => [...host.querySelectorAll('[role="option"]')];

  it('lists newest first, dates every version, and marks only the newest as Aktualna', async () => {
    await mount(HISTORY, 3);
    await click('recipe-version-selector-QA');

    const rows = options();
    expect(rows.map((o) => o.textContent?.match(/^V\d+/)?.[0])).toEqual(['V3', 'V2', 'V1']);

    // Real immutable timestamps, not the parent's updated_at.
    expect(rows[0]!.textContent).toContain(formatSavedRecipeDate(HISTORY[0]!.createdAt));
    expect(rows[2]!.textContent).toContain(formatSavedRecipeDate(HISTORY[2]!.createdAt));

    expect(rows.filter((o) => o.textContent?.includes('Aktualna'))).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('Aktualna');
  });

  it('a single-version recipe opens a one-item list, never an empty menu', async () => {
    await mount(SINGLE, 1, () => {}, 'One');
    await click('recipe-version-selector-One');
    const rows = options();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('V1');
    expect(rows[0]!.textContent).toContain('Aktualna');
  });

  it('choosing a version reports it upward and closes — and does nothing else', async () => {
    const onSelect = vi.fn();
    await mount(HISTORY, 3, onSelect);
    await click('recipe-version-selector-QA');
    await click('recipe-version-option-QA-v1');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(options()).toHaveLength(0);
  });
});
