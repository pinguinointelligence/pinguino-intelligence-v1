// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllergenStatementControl } from './AllergenStatementControl';
import type { MasterLabelData } from './masterLabel';
import { createCompleteLabel } from './masterLabelTestFixture';

function Harness({
  initial,
  onSave,
}: {
  initial: MasterLabelData;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const [label, setLabel] = useState(initial);
  return (
    <AllergenStatementControl
      label={label}
      onSave={async (next) => {
        await onSave(next);
        setLabel(next);
      }}
    />
  );
}

describe('AllergenStatementControl', () => {
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

  it('shows UNKNOWN, opens one text field, saves locally and returns to the same label row', async () => {
    const onSave = vi.fn(async () => undefined);
    const label = createCompleteLabel('EU', {
      allergens: {
        ...createCompleteLabel('EU').allergens,
        status: 'incomplete',
        labelStatements: [],
        reviewedByUser: false,
      },
    });
    await act(async () => root.render(<Harness initial={label} onSave={onSave} />));

    expect(host.textContent).toContain('Alergeny nieustalone');
    expect(host.textContent).not.toContain('Informacje o alergenach ustala producent żywności.');
    const setButton = host.querySelector<HTMLButtonElement>('[data-testid="label-allergens-set"]')!;
    expect(setButton.textContent).toBe('Ustaw');
    expect(host.querySelector('[data-testid="label-allergens-row"]')?.className).not.toContain(
      'rounded',
    );
    await act(async () => setButton.click());

    const input = host.querySelector<HTMLInputElement>('[data-testid="label-allergens-input"]')!;
    expect(input).not.toBeNull();
    expect(host.querySelectorAll('input')).toHaveLength(1);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'Zawiera: MLEKO. Może zawierać ORZECHY.',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="label-allergens-save"]')!.click();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        allergens: expect.objectContaining({
          labelStatements: ['Zawiera: MLEKO. Może zawierać ORZECHY.'],
        }),
      }),
    );
    expect(host.textContent).toContain('Alergeny: Zawiera: MLEKO. Może zawierać ORZECHY.');
    expect(host.querySelector('[data-testid="label-allergens-change"]')?.textContent).toBe('Zmień');
  });

  it('lets Zmień update the one final line and Wróć discard an unfinished edit', async () => {
    const onSave = vi.fn(async () => undefined);
    await act(async () =>
      root.render(<Harness initial={createCompleteLabel('EU')} onSave={onSave} />),
    );
    expect(host.textContent).toContain('Alergeny: milk');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-allergens-change"]')!.click(),
    );
    const input = host.querySelector<HTMLInputElement>('[data-testid="label-allergens-input"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'Nowa linia',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      host.querySelector<HTMLButtonElement>('[data-testid="label-allergens-back"]')!.click();
    });
    expect(host.textContent).toContain('Alergeny: milk');
    expect(onSave).not.toHaveBeenCalled();
  });
});
