// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOTTOM_STACK_HEIGHT_VAR, usePublishedBottomStackHeight } from './bottomStackHeight';

const observerCallbacks: Array<() => void> = [];

class FakeResizeObserver {
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    observerCallbacks.push(() => this.callback());
  }
  observe() {}
  disconnect() {}
}

function Workbench() {
  const workbenchRef = useRef<HTMLElement | null>(null);
  const bottomStackRef = useRef<HTMLDivElement | null>(null);
  usePublishedBottomStackHeight(bottomStackRef, workbenchRef);
  return (
    <section ref={workbenchRef} data-testid="workbench">
      <div ref={bottomStackRef} data-testid="bottom-stack" data-height="118" />
    </section>
  );
}

describe('PRO MOBILE UX v2 · A2 — the bottom stack is measured once, for every reservation', () => {
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const resizeObserver = globalThis.ResizeObserver;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return Number(this.dataset.height ?? 0);
      },
    });
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    observerCallbacks.length = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = resizeObserver;
  });

  const workbench = () => host.querySelector<HTMLElement>('[data-testid="workbench"]')!;
  const stack = () => host.querySelector<HTMLElement>('[data-testid="bottom-stack"]')!;

  it('publishes the stack height on the workbench before the first paint', async () => {
    await act(async () => root.render(<Workbench />));
    expect(workbench().style.getPropertyValue(BOTTOM_STACK_HEIGHT_VAR)).toBe('118px');
  });

  it('follows the stack when the strip wraps, when it disappears, and on a resize', async () => {
    await act(async () => root.render(<Workbench />));

    stack().dataset.height = '160'; // the strip wrapped to two rows
    await act(async () => observerCallbacks.forEach((callback) => callback()));
    expect(workbench().style.getPropertyValue(BOTTOM_STACK_HEIGHT_VAR)).toBe('160px');

    stack().dataset.height = '57'; // an active Production run: module bar only
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(workbench().style.getPropertyValue(BOTTOM_STACK_HEIGHT_VAR)).toBe('57px');
  });

  it('publishes 0 where the stack is not displayed (the desktop workbench)', async () => {
    await act(async () => root.render(<Workbench />));
    stack().dataset.height = '0';
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(workbench().style.getPropertyValue(BOTTOM_STACK_HEIGHT_VAR)).toBe('0px');
  });

  it('removes the variable when the workbench unmounts', async () => {
    await act(async () => root.render(<Workbench />));
    const element = workbench();
    await act(async () => root.render(null));
    expect(element.style.getPropertyValue(BOTTOM_STACK_HEIGHT_VAR)).toBe('');
  });
});
