/** @vitest-environment jsdom */
/**
 * The amount stage, driven the way the served customer drove it (2026-09-18, phone,
 * iPad and desktop walks): an exact amount typed into „Wpisz dokładną ilość” was lost
 * unless the customer found the second button; Enter did nothing; and „−” at one
 * container looked live while doing nothing.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeAmount } from '../homeAmountAuthority';
import { buildHomeMachineView } from '../homeMachinePresentation';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { HomeMachineSection } from './HomeMachineSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const ONE_TUB: HomeAmount = { totalGrams: 670, source: 'containers' };

const render = (props: {
  onAmountChange?: (amount: HomeAmount) => void;
  onDone?: (typed?: HomeAmount) => void;
}) => {
  act(() => {
    root.render(
      <HomeMachineSection
        view={buildHomeMachineView({
          machineKind: 'home',
          machineLabel: 'Ninja CREAMi Deluxe',
          targetBatchGrams: 670,
          recommendedBatchGrams: 670,
          containers: 1,
        })}
        amount={ONE_TUB}
        recommendedBatchGrams={670}
        onSelectMachine={() => undefined}
        onOtherMachine={() => undefined}
        onAmountChange={props.onAmountChange ?? (() => undefined)}
        onChangeMachine={() => undefined}
        onDone={props.onDone ?? (() => undefined)}
      />,
    );
  });
};

const need = <T extends Element>(testId: string): T => {
  const element = host.querySelector<T>(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`missing ${testId}`);
  return element;
};

const typeAmount = (text: string) => {
  const input = need<HTMLInputElement>('home-amount-manual');
  act(() => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('HOME amount stage — the amount the customer typed is the amount used', () => {
  it('HOME-AMOUNT-STAGE-01: the two buttons say different things', () => {
    render({});
    expect(need('home-amount-manual-apply').textContent).toBe(
      homeCreatorCopy.machine.amountManualApply,
    );
    expect(need('home-machine-done').textContent).toBe(homeCreatorCopy.machine.done);
    expect(homeCreatorCopy.machine.amountManualApply).not.toBe(homeCreatorCopy.machine.done);
  });

  it('HOME-AMOUNT-STAGE-02: Enter in the exact-amount field applies it', () => {
    const onAmountChange = vi.fn();
    render({ onAmountChange });
    const input = typeAmount('1850');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onAmountChange).toHaveBeenCalledWith({ totalGrams: 1850, source: 'manual' });
  });

  it('HOME-AMOUNT-STAGE-03: „Gotowe” with a typed, unapplied amount builds for THAT amount', () => {
    const onDone = vi.fn();
    const onAmountChange = vi.fn();
    render({ onDone, onAmountChange });
    typeAmount('900');
    act(() => need<HTMLButtonElement>('home-machine-done').click());
    expect(onAmountChange).toHaveBeenCalledWith({ totalGrams: 900, source: 'manual' });
    expect(onDone).toHaveBeenCalledWith({ totalGrams: 900, source: 'manual' });
  });

  it('HOME-AMOUNT-STAGE-04: „Gotowe” with nothing typed keeps the container amount', () => {
    const onDone = vi.fn();
    render({ onDone });
    act(() => need<HTMLButtonElement>('home-machine-done').click());
    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it('HOME-AMOUNT-STAGE-05: „−” at one container is visibly disabled; „+” is not', () => {
    render({});
    expect(need<HTMLButtonElement>('home-containers-minus').disabled).toBe(true);
    expect(need<HTMLButtonElement>('home-containers-plus').disabled).toBe(false);
  });
});
