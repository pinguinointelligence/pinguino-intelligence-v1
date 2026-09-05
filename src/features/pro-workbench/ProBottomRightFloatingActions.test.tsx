/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProBottomRightFloatingActions } from './ProBottomRightFloatingActions';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('ProBottomRightFloatingActions', () => {
  it('renders only the two explicit viewport actions in visual/source order', async () => {
    const onMonitor = vi.fn();
    const onRecalculate = vi.fn();
    await act(async () => {
      root.render(
        <ProBottomRightFloatingActions onMonitor={onMonitor} onRecalculate={onRecalculate} />,
      );
    });

    const controls = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(controls.map((control) => control.textContent)).toEqual(['MONITOR', 'PRZELICZ Z PI']);
    expect(
      host
        .querySelector('[data-testid="pro-bottom-right-floating-actions"]')
        ?.getAttribute('data-position-authority'),
    ).toBe('viewport');

    await act(async () => controls[0]?.click());
    await act(async () => controls[1]?.click());
    expect(onMonitor).toHaveBeenCalledOnce();
    expect(onRecalculate).toHaveBeenCalledOnce();
  });
});
