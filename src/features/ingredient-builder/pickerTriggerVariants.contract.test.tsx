/** @vitest-environment jsdom */
/**
 * PRO pill trigger — RENDERED visual authority (owner condition on PR #63).
 *
 * `rowDensity` used to pin the trigger by matching the exact newlines and indentation of
 * its class expression. That failed the moment the trigger was wrapped in a variant
 * branch, while changing no styling at all — brittle in the one dimension that does not
 * matter, and silent about the ones that do.
 *
 * Test implementation hardened; PRO visual authority unchanged. This asserts the RENDERED
 * element: the default is still the pill, it still carries the full geometry and style
 * token set, its focus treatment is intact, and the HOME icon variant cannot leak into it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductPickerPopover } from './ProductPickerPopover';
import { serverSearchLibrary } from './ingredientLibrary';

let host: HTMLDivElement;
let root: Root;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const mount = (props: {
  triggerVariant?: 'pill' | 'icon';
  scope?: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
}) => {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProductPickerPopover
            library={serverSearchLibrary()}
            scope={props.scope ?? 'BASE_FORMULATION'}
            {...(props.triggerVariant ? { triggerVariant: props.triggerVariant } : {})}
            onAdd={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  expect(trigger).not.toBeNull();
  return trigger!;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('PRO default trigger — unchanged visual authority', () => {
  it('defaults to the pill when no variant is passed', () => {
    const cls = mount({}).className;
    expect(cls).toContain('rounded-xl');
    expect(cls).not.toContain('rounded-full');
  });

  it('keeps the full 44 px / rounded-xl geometry token set', () => {
    const cls = mount({}).className;
    for (const token of [
      'h-11',
      'rounded-xl',
      'px-4',
      'text-xs',
      'font-semibold',
      'inline-flex',
      'items-center',
      'justify-center',
      'whitespace-nowrap',
      'transition-colors',
    ]) {
      expect(cls, token).toContain(token);
    }
  });

  it('keeps the two-level scope hierarchy exactly', () => {
    const base = mount({ scope: 'BASE_FORMULATION' }).className;
    expect(base).toContain('border-ink/20');
    expect(base).toContain('bg-white');
    expect(base).toContain('text-ink');
    expect(base).toContain('hover:border-ink/40');

    act(() => root.unmount());
    root = createRoot(host);
    const addon = mount({ scope: 'POST_PROCESS_ADDON' }).className;
    expect(addon).toContain('border-ink/10');
    expect(addon).toContain('bg-[var(--g-ivory)]');
    expect(addon).toContain('text-stone-700');
    expect(addon).toContain('hover:border-ink/25');
  });

  it('keeps the shared orange focus treatment', () => {
    expect(mount({}).className).toContain('pro-focus-ring');
  });

  it('still shows the visible ＋ and label, not an icon-only control', () => {
    const trigger = mount({});
    expect(trigger.textContent).toContain('＋');
    expect(trigger.textContent).toContain('Dodaj składnik');
    expect(trigger.getAttribute('aria-label')).toBeNull();
  });
});

describe('the HOME icon variant cannot leak into PRO', () => {
  it('is opt-in only — PRO callers never request it', () => {
    // Source-level, because the leak would be a caller change, not a render.
    const readers = [
      'src/features/ingredient-builder/IngredientBuilder.tsx',
      'src/features/ingredient-builder/ToppingRow.tsx',
    ];
    for (const file of readers) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const source = require('node:fs').readFileSync(file, 'utf8') as string;
      expect(source, file).not.toContain('triggerVariant');
    }
  });

  it('renders a genuinely different control when explicitly asked', () => {
    const icon = mount({ triggerVariant: 'icon' });
    expect(icon.className).toContain('rounded-full');
    expect(icon.className).not.toContain('rounded-xl');
    expect(icon.className).toContain('size-11');
    expect(icon.getAttribute('aria-label')).toBe('Dodaj składnik');
    expect(icon.className).toContain('pro-focus-ring');
    expect(icon.className).not.toContain('var(--g-orange)');
  });
});
