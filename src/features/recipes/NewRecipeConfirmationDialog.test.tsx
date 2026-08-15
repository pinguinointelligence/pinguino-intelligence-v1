// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewRecipeConfirmationDialog } from './NewRecipeConfirmationDialog';

describe('NewRecipeConfirmationDialog', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('renders the exact compact rebuild confirmation for an edited recipe', async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(
        <NewRecipeConfirmationDialog
          open
          title="Zmiana typu produktu wymaga przebudowy składników."
          description={null}
          confirmLabel="Przebuduj"
          onCancel={() => {}}
          onConfirm={onConfirm}
        />,
      );
    });

    expect(host.textContent).toContain('Zmiana typu produktu wymaga przebudowy składników.');
    expect(host.textContent).toContain('Przebuduj');
    expect(host.textContent).toContain('Anuluj');
    expect(host.querySelector('[aria-describedby]')).toBeNull();

    await act(async () => {
      (host.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement).click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog, traps Tab, handles Escape, and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onCancel = vi.fn();
    await act(async () => {
      root.render(
        <NewRecipeConfirmationDialog open onCancel={onCancel} onConfirm={() => {}} />,
      );
    });

    const buttons = Array.from(host.querySelectorAll('button'));
    const cancel = buttons.find((button) => button.textContent === 'Anuluj')!;
    const confirm = host.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(cancel);

    cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(confirm);

    confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<NewRecipeConfirmationDialog open={false} onCancel={onCancel} onConfirm={() => {}} />));
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
