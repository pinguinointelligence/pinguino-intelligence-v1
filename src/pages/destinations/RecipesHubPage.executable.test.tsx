// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';

vi.mock('@/features/design-review/useReviewMode', () => ({ useReviewMode: () => true }));
const runtime = vi.hoisted(() => ({
  persona: 'pro' as 'demo' | 'home' | 'pro',
  ownerAccess: true,
}));
vi.mock('@/features/design-review/useOwnerReviewAccess', () => ({
  useOwnerReviewAccess: () => runtime.ownerAccess,
}));
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => runtime.persona,
}));

const { RecipesHubPage } = await import('./RecipesHubPage');

describe('Recipes Hub executable Owner Review projection', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    runtime.persona = 'pro';
    runtime.ownerAccess = true;
    useRecipeStore.getState().resetToDemo();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/recipes']}>
          <RecipesHubPage />
        </MemoryRouter>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const clickByText = async (text: string) => {
    const target = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(text),
    );
    if (!target) throw new Error(`Missing button: ${text}`);
    await act(async () => target.click());
  };

  it('shows five editable Fantasy Base vectors with separate blocked Production/Label gates', async () => {
    await clickByText('Fantasy');
    expect(host.querySelectorAll('[data-testid^="executable-template-fantasy-"]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-testid$="-owner-review-gate"]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-testid$="-production-gate"]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-testid$="-label-gate"]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-testid$="-owner-review-base-only"]')).toHaveLength(5);
    expect(host.textContent?.match(/OWNER_REVIEW_EDITABLE/g)).toHaveLength(5);
    expect(host.textContent?.match(/PRODUCTION_BLOCKED/g)).toHaveLength(5);
    expect(host.textContent?.match(/LABEL_BLOCKED/g)).toHaveLength(5);
    expect(
      Array.from(host.querySelectorAll('button')).filter((button) =>
        button.textContent?.includes('Otwórz w Pro'),
      ),
    ).toHaveLength(5);
    expect(host.textContent).toContain('Wynik techniczny');
    expect(host.textContent).toContain('lista finalna niepełna');
    expect(host.textContent).toContain('Przegląd otwiera wyłącznie bazę');
    expect(host.textContent).not.toMatch(/Ferrero|Raffaello|Kinder|Oreo|Snickers/i);
  });

  it('keeps Poland blocked on exact egg-yolk-powder data with no false score or execution', async () => {
    await clickByText('Lost & Legendary');
    const card = host.querySelector(
      '[data-testid="executable-template-lost-pl-smietankowe-z-zoltkami-v1"]',
    );
    expect(card).not.toBeNull();
    expect(host.textContent).toContain('Śmietankowe na żółtkach');
    expect(card?.textContent).toContain('BLOCKED_EXACT_PRODUCT_DATA');
    expect(card?.textContent).toContain('żółtko jaja w proszku');
    expect(card?.textContent).toContain('oczekuje na dokładny produkt');
    expect(host.textContent).toContain('brak zatwierdzonej wersji');
    expect(card?.querySelector('button:disabled')).not.toBeNull();
  });

  it('never mounts executable Owner Review cards for a non-Pro persona', async () => {
    runtime.persona = 'home';
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/recipes']}>
          <RecipesHubPage />
        </MemoryRouter>,
      );
    });
    expect(host.textContent).not.toContain('Fantasy');
    await clickByText('Lost & Legendary');
    expect(host.querySelector('[data-testid^="executable-template-"]')).toBeNull();
    expect(host.textContent).not.toContain('OWNER_REVIEW_EDITABLE');
  });

  it('never mounts Owner Review cards for an ordinary Pro without admin authorization', async () => {
    runtime.ownerAccess = false;
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/recipes']}>
          <RecipesHubPage />
        </MemoryRouter>,
      );
    });
    expect(host.textContent).not.toContain('Fantasy');
    expect(host.querySelector('[data-testid^="executable-template-"]')).toBeNull();
  });

  it('requires explicit confirmation before an Owner Review handoff can replace an unsaved draft', async () => {
    useRecipeStore.setState({ dirty: true });
    await clickByText('Fantasy');
    await clickByText('Otwórz w Pro');

    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain(
      'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
    );

    await clickByText('Anuluj');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(useRecipeStore.getState().dirty).toBe(true);

    await clickByText('Otwórz w Pro');
    const confirm = host.querySelector<HTMLButtonElement>('[data-testid="confirm-new-recipe"]');
    expect(confirm).not.toBeNull();
    await act(async () => confirm?.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(useRecipeStore.getState().dirty).toBe(false);
  });
});
