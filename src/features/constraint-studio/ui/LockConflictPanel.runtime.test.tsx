/** @vitest-environment jsdom */
/**
 * LOCK CONFLICT — owner 2026-09-11, Part B (UI). No technical dead end: the
 * customer sees WHERE IT HURTS, the smallest proven correction prefilled in the
 * row's own control, „Użyj propozycji", or their own values with „Przelicz".
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LockConflictState } from '../constraintStudioStore';
import { LockConflictPanel } from './LockConflictPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const found = (sessionCranberry = 130): LockConflictState => ({
  diagnosis: {
    status: 'relaxation_found',
    locks: [
      { lineId: 'strawberry', ingredientName: 'STRAWBERRIES', grams: 100 },
      { lineId: 'cranberry', ingredientName: 'CRANBERRY', grams: sessionCranberry },
    ],
    changes: [
      {
        lineId: 'cranberry',
        ingredientName: 'CRANBERRY',
        fromGrams: sessionCranberry,
        toGrams: 76,
      },
    ],
    totalChangeGrams: sessionCranberry - 76,
    blockers: [{ code: 'liquid_dairy_carrier_below_floor', actualPercent: 24, limitPercent: 30 }],
    probes: 20,
    searchComplete: true,
  },
  baseFingerprint: 'untouched',
  baseDraftRevision: 3,
  sessionInstructions:
    sessionCranberry === 130
      ? []
      : [{ lineId: 'cranberry', grams: sessionCranberry, locked: true }],
});

const none: LockConflictState = {
  diagnosis: {
    status: 'no_safe_relaxation',
    locks: [
      { lineId: 'strawberry', ingredientName: 'STRAWBERRIES', grams: 100 },
      { lineId: 'cranberry', ingredientName: 'CRANBERRY', grams: 130 },
    ],
    blockers: [{ code: 'main_below_floor', actualPercent: 14.24, limitPercent: 20 }],
    probes: 72,
    reason: 'search_budget_exhausted',
  },
  baseFingerprint: 'untouched',
  baseDraftRevision: 3,
  sessionInstructions: [],
};

const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
  host.querySelector<T>(selector);
const stepper = (lineId: string, direction: 'zwiększ' | 'zmniejsz') =>
  q<HTMLButtonElement>(
    `[data-testid="lock-conflict-control-${lineId}"] button[aria-label$="— ${direction}"]`,
  )!;

const render = async (
  conflict: LockConflictState,
  surface: 'pro' | 'home' = 'pro',
  onRecalculate = vi.fn(),
  onBack = vi.fn(),
) => {
  await act(async () => {
    root.render(
      <LockConflictPanel
        conflict={conflict}
        surface={surface}
        onRecalculate={onRecalculate}
        onBack={onBack}
      />,
    );
  });
  return { onRecalculate, onBack };
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('lock conflict panel', () => {
  it('PRO: explains the conflict in customer language with the exact gap, the lock that hurts first', async () => {
    await render(found());
    expect(host.textContent).toContain(
      'Nie da się zachować wszystkich blokad w obecnych ilościach.',
    );
    expect(q('[data-testid="lock-conflict-gap"]')?.textContent).toBe(
      'Przy obecnych ustawieniach płynna baza ma 24%, a wymagane minimum to 30%.',
    );
    expect(q('[data-testid="lock-conflict-outcome"]')?.textContent).toBe(
      'Gellatti proponuje najmniejszą korektę, która pozwala zachować prawidłowy profil.',
    );
    expect(q('[data-testid="lock-conflict-measures"]')?.textContent).toContain(
      'Płynna baza: 24% · Minimum technologiczne: 30%',
    );
    // The internal carrier term is never the customer's headline.
    expect(host.textContent).not.toContain('nośnik');
    const rows = [...host.querySelectorAll<HTMLElement>('[data-testid^="lock-conflict-row-"]')];
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      'lock-conflict-row-cranberry',
      'lock-conflict-row-strawberry',
    ]);
    expect(rows.map((row) => row.dataset.change)).toEqual(['required', 'none']);
    // The correction is prefilled in the row's own control; the unchanged
    // lock is shown as unchanged, never as a change.
    expect(
      q('[data-testid="lock-conflict-control-cranberry"] [role="spinbutton"]')?.getAttribute(
        'aria-valuenow',
      ) ??
        q<HTMLInputElement>('[data-testid="lock-conflict-control-cranberry"] input')?.value ??
        '',
    ).toContain('76');
    expect(q('[data-testid="lock-conflict-row-strawberry"]')?.textContent).toContain('Bez zmian');
    expect(q('[data-testid="lock-conflict-use-proposal"]')?.textContent).toBe('Użyj propozycji');
  });

  it('„Użyj propozycji" recalculates with exactly the proven correction and nothing else', async () => {
    const { onRecalculate } = await render(found());
    await act(async () =>
      q<HTMLButtonElement>('[data-testid="lock-conflict-use-proposal"]')!.click(),
    );
    expect(onRecalculate).toHaveBeenCalledWith([{ lineId: 'cranberry', grams: 76, locked: true }]);
  });

  it('the customer’s own value turns the action into „Przelicz"; returning to the proposal restores it', async () => {
    const { onRecalculate } = await render(found());
    await act(async () => stepper('cranberry', 'zwiększ').click());
    expect(q('[data-testid="lock-conflict-use-proposal"]')).toBeNull();
    expect(q('[data-testid="lock-conflict-recalculate"]')?.textContent).toBe('Przelicz');
    expect(q('[data-testid="lock-conflict-row-cranberry"]')?.textContent).toContain(
      'Twoja wartość',
    );
    await act(async () =>
      q<HTMLButtonElement>('[data-testid="lock-conflict-recalculate"]')!.click(),
    );
    expect(onRecalculate).toHaveBeenLastCalledWith([
      { lineId: 'cranberry', grams: 77, locked: true },
    ]);
    await act(async () => stepper('cranberry', 'zmniejsz').click());
    expect(q('[data-testid="lock-conflict-use-proposal"]')).not.toBeNull();
  });

  it('the customer may move a DIFFERENT lock instead; the untouched one stays exactly as set', async () => {
    const { onRecalculate } = await render(found());
    await act(async () => stepper('strawberry', 'zmniejsz').click());
    await act(async () =>
      q<HTMLButtonElement>('[data-testid="lock-conflict-recalculate"]')!.click(),
    );
    // WYSIWYG: the proposal still on screen for Cranberry is part of the request.
    expect(onRecalculate).toHaveBeenCalledWith([
      { lineId: 'cranberry', grams: 76, locked: true },
      { lineId: 'strawberry', grams: 99, locked: true },
    ]);
  });

  it('builds on the session: a correction of the customer’s earlier manual value replaces it', async () => {
    const { onRecalculate } = await render(found(90));
    await act(async () =>
      q<HTMLButtonElement>('[data-testid="lock-conflict-use-proposal"]')!.click(),
    );
    expect(onRecalculate).toHaveBeenCalledWith([{ lineId: 'cranberry', grams: 76, locked: true }]);
  });

  it('HOME: simpler words, no technical gap, the same correction and controls', async () => {
    const { onBack } = await render(found(), 'home');
    expect(host.textContent).toContain('Tych ustawień nie da się teraz połączyć.');
    expect(q('[data-testid="lock-conflict-outcome"]')?.textContent).toBe(
      'Gellatti proponuje najmniejszą zmianę, która pozwala prawidłowo przeliczyć recepturę.',
    );
    expect(q('[data-testid="lock-conflict-gap"]')).toBeNull();
    expect(q('[data-testid="lock-conflict-measures"]')).toBeNull();
    expect(q('[data-testid="lock-conflict-use-proposal"]')).not.toBeNull();
    await act(async () => q<HTMLButtonElement>('[data-testid="lock-conflict-back"]')!.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('no safe correction: honest sentence, the remaining blocker, no fabricated value — manual values still allowed', async () => {
    const { onRecalculate } = await render(none);
    expect(q('[data-testid="lock-conflict-outcome"]')?.textContent).toBe(
      'Nie znaleziono bezpiecznej korekty przy obecnych ograniczeniach.',
    );
    expect(q('[data-testid="lock-conflict-gap"]')?.textContent).toBe(
      'Przy obecnych ustawieniach składnik główny ma 14,2% partii, a wymagane minimum to 20%.',
    );
    expect(q('[data-testid="lock-conflict-use-proposal"]')).toBeNull();
    expect(q('[data-testid="lock-conflict-recalculate"]')).toBeNull();
    expect(q('[data-testid="lock-conflict-back"]')).not.toBeNull();
    await act(async () => stepper('cranberry', 'zmniejsz').click());
    await act(async () =>
      q<HTMLButtonElement>('[data-testid="lock-conflict-recalculate"]')!.click(),
    );
    expect(onRecalculate).toHaveBeenCalledWith([{ lineId: 'cranberry', grams: 129, locked: true }]);
  });
});
