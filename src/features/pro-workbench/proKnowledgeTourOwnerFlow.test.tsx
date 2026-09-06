/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, proposeCorrections } from '@/engine';
import { copy } from '@/copy/en';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import { RecipeProfilePanel } from './RecipeProfilePanel';

beforeEach(() => {
  useRecipeProfileStore.getState().resetForTests();
  useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  useRecipeStore.setState({ dirty: false });
});

describe('PRO Recipe knowledge owner flow', () => {
  it('opens the canonical Guide in the existing right column and returns to the recipe', async () => {
    const input = starterMilkBase();
    const host = document.createElement('div');
    host.style.overflowY = 'auto';
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/pro']}>
            <RecipeProfilePanel
              activeTab="profile"
              onTabChange={() => undefined}
              result={calculateRecipe(input)}
              servingTemperatureC={input.target_temperature_c}
              corrections={proposeCorrections({
                input,
                context: recipeContext(input),
                redact: false,
              })}
              input={input}
              idPrefix="owner-pro-knowledge-tour"
              showTabs={false}
              onOpenPreview={() => undefined}
              onRecalculate={() => undefined}
            />
          </MemoryRouter>,
        );
      });

      const panel = host.querySelector('[data-testid="pro-profile-panel"]')!;
      const entry = panel.querySelector<HTMLButtonElement>('[data-testid="profile-learning-entry"]');
      expect(entry?.textContent).toContain(copy.shell.items.howItWorks);

      host.scrollTop = 120;
      await act(async () => entry?.click());

      const guide = panel.querySelector<HTMLElement>('[data-testid="knowledge-tour"]');
      expect(guide).not.toBeNull();
      expect(guide?.dataset.layout).toBe('embedded');
      expect(guide?.querySelector('img')?.getAttribute('src')).toBe('/guide/01.png');
      expect(guide?.querySelectorAll('.knowledge-tour__dot')).toHaveLength(9);
      expect(panel.querySelector('[data-testid="profile-education-view"]')).not.toBeNull();
      expect(panel.querySelector('[data-testid="contextual-learning-hub"]')).toBeNull();
      expect(panel.querySelector('[data-testid="education-entry"]')).toBeNull();
      expect(panel.textContent).not.toContain('Wiedza o recepturze');
      expect(host.scrollTop).toBe(0);

      const navButtons = () =>
        guide?.querySelectorAll<HTMLButtonElement>('.knowledge-tour__nav-button');
      await act(async () => navButtons()?.[1]?.click());
      expect(guide?.dataset.activeStep).toBe('2');
      await act(async () => navButtons()?.[0]?.click());
      expect(guide?.dataset.activeStep).toBe('1');
      await act(async () =>
        guide?.querySelectorAll<HTMLButtonElement>('.knowledge-tour__dot')[3]?.click(),
      );
      expect(guide?.dataset.activeStep).toBe('4');
      await act(async () =>
        guide?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        ),
      );
      expect(guide?.dataset.activeStep).toBe('5');
      const touchStart = new Event('touchstart', { bubbles: true });
      Object.defineProperty(touchStart, 'changedTouches', {
        value: [{ clientX: 310, clientY: 120 }],
      });
      const touchEnd = new Event('touchend', { bubbles: true });
      Object.defineProperty(touchEnd, 'changedTouches', {
        value: [{ clientX: 210, clientY: 124 }],
      });
      await act(async () => {
        guide?.dispatchEvent(touchStart);
        guide?.dispatchEvent(touchEnd);
      });
      expect(guide?.dataset.activeStep).toBe('6');

      const back = [...panel.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Wróć do receptury'),
      );
      await act(async () => back?.click());
      expect(panel.querySelector('[data-testid="knowledge-tour"]')).toBeNull();
      expect(panel.querySelector('[data-testid="profile-learning-entry"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
