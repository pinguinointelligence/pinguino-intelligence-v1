// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A7 — a greyed „Dostosuj recepturę" regulator must say why.
 *
 * Availability is the Direction plan's own decision (`buildRecipeDirectionPlan`,
 * a protected path, untouched). These tests pin only the presentation: an
 * unavailable axis carries a customer-language reason, announced with it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeResult } from '@/engine';
import { copy } from '@/copy/en';
import { useRecipeStore } from '@/stores/recipeStore';
import type { DirectionAxisStatus } from '@/features/recipe-direction/recipeDirectionTargets';
import { directionAxisUnavailableReason } from './directionAxisReason';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';

const plan = vi.hoisted(() => ({
  statuses: { sweetness: 'working', softness: 'working' } as Record<string, string>,
}));

vi.mock('@/features/recipe-direction/recipeDirectionTargets', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/recipe-direction/recipeDirectionTargets')>();
  return {
    ...actual,
    buildRecipeDirectionPlan: () =>
      ({
        axes: [
          { axis: 'sweetness', status: plan.statuses.sweetness },
          { axis: 'softness', status: plan.statuses.softness },
        ],
      }) as unknown as ReturnType<typeof actual.buildRecipeDirectionPlan>,
  };
});

describe('A7 — an unavailable Direction regulator explains itself', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    useRecipeStore.getState().resetToDemo();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    plan.statuses = { sweetness: 'working', softness: 'working' };
  });

  const render = () =>
    act(async () => root.render(<ProfileDirectionAxes result={{} as RecipeResult} />));
  const regulator = (axis: string) =>
    host.querySelector<HTMLElement>(`[data-testid="profile-regulator-${axis}"]`)!;
  const radiogroup = (axis: string) =>
    regulator(axis).querySelector<HTMLElement>('[role="radiogroup"]')!;

  it('says why Twardość is unavailable, and ties the words to the control', async () => {
    plan.statuses = { sweetness: 'working', softness: 'blocked_science' };
    await render();

    expect(regulator('softness').dataset.regulatorState).toBe('unavailable');
    const reason = host.querySelector('[data-testid="profile-regulator-softness-reason"]');
    expect(reason?.textContent).toBe(copy.proWorkbench.profile.axisUnavailable.blocked_science);
    expect(radiogroup('softness').getAttribute('aria-describedby')).toBe(
      'profile-regulator-softness-reason',
    );
    // The business rule is untouched: the positions stay disabled.
    for (const position of regulator('softness').querySelectorAll('button[role="radio"]')) {
      expect((position as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows no reason while a regulator works', async () => {
    await render();
    expect(regulator('sweetness').dataset.regulatorState).toBe('interactive');
    expect(regulator('softness').dataset.regulatorState).toBe('interactive');
    expect(host.querySelector('[data-testid$="-reason"]')).toBeNull();
    expect(radiogroup('softness').hasAttribute('aria-describedby')).toBe(false);
  });

  it('gives every blocked status its own customer-language sentence', async () => {
    const statuses: Array<DirectionAxisStatus | undefined> = [
      'blocked_science',
      'blocked_data',
      'blocked_runtime',
      undefined,
    ];
    const sentences = statuses.map(directionAxisUnavailableReason);
    expect(new Set(sentences).size).toBe(statuses.length);
    for (const sentence of sentences) {
      expect(sentence.trim().length).toBeGreaterThan(0);
      expect(sentence).not.toMatch(/\b(POD|NPAC|PAC|solver|blocked|runtime)\b/i);
    }

    plan.statuses = { sweetness: 'blocked_data', softness: 'blocked_data' };
    await render();
    expect(
      host.querySelector('[data-testid="profile-regulator-sweetness-reason"]')?.textContent,
    ).toBe(copy.proWorkbench.profile.axisUnavailable.blocked_data);
  });
});
