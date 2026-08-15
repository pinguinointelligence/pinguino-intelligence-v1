// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/design-review/useReviewMode', () => ({ useReviewMode: () => true }));
vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));

const { RecipesHubPage } = await import('./RecipesHubPage');

describe('Recipes Hub executable Owner Review projection', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
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
    const target = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(text));
    if (!target) throw new Error(`Missing button: ${text}`);
    await act(async () => target.click());
  };

  it('shows five Fantasy vectors as blocked cards without branded Owner references', async () => {
    await clickByText('Fantasy');
    expect(host.querySelectorAll('[data-testid^="executable-template-fantasy-"]')).toHaveLength(5);
    expect(host.querySelectorAll('button:disabled')).toHaveLength(5);
    expect(host.textContent).toContain('Score techniczny');
    expect(host.textContent).toContain('lista finalna niepełna');
    expect(host.textContent).not.toMatch(/Ferrero|Raffaello|Kinder|Oreo|Snickers/i);
  });

  it('keeps the Poland vector in Lost & Legendary and blocked from false execution', async () => {
    await clickByText('Lost & Legendary');
    expect(host.querySelector('[data-testid="executable-template-lost-pl-smietankowe-z-zoltkami-v1"]'))
      .not.toBeNull();
    expect(host.textContent).toContain('Śmietankowe na żółtkach');
    expect(host.textContent).toContain('brak zatwierdzonej wersji');
  });
});
