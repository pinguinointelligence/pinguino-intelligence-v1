/** @vitest-environment jsdom */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogShell } from './DialogShell';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const flushFocus = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
};

const click = async (testId: string) => {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!button) throw new Error(`missing ${testId}`);
  await act(async () => {
    // A real pointer click focuses a button before dispatching click. jsdom's
    // `.click()` does not, so model the browser ordering explicitly.
    button.focus();
    button.click();
  });
  await flushFocus();
};

const key = async (value: string, shiftKey = false) => {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true }));
  });
  await flushFocus();
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await flushFocus();
});

describe('DialogShell semantic focus return', () => {
  it('returns to the original trigger when it survives', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <main>
          <button data-testid="trigger" onClick={() => setOpen(true)}>
            Open
          </button>
          {open ? (
            <DialogShell label="Test" testId="dialog" onClose={() => setOpen(false)}>
              <button data-testid="close" onClick={() => setOpen(false)}>
                Close
              </button>
            </DialogShell>
          ) : null}
        </main>
      );
    }
    await act(async () => root.render(<Harness />));
    await click('trigger');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="close"]'));
    await click('close');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="trigger"]'));
  });

  it('Apply returns to the real post-apply Cofnij action, never BODY', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [applied, setApplied] = useState(false);
      return (
        <main>
          {!applied ? (
            <button data-testid="recalc" onClick={() => setOpen(true)}>
              Przelicz
            </button>
          ) : (
            <button data-testid="workbench-undo">Cofnij</button>
          )}
          {open ? (
            <DialogShell
              label="Preview"
              testId="dialog"
              onClose={() => setOpen(false)}
              returnFocus={() => document.querySelector('[data-testid="workbench-undo"]')}
            >
              <button
                data-testid="apply"
                onClick={() => {
                  setApplied(true);
                  setOpen(false);
                }}
              >
                Zastosuj zmiany
              </button>
            </DialogShell>
          ) : null}
        </main>
      );
    }
    await act(async () => root.render(<Harness />));
    await click('recalc');
    await click('apply');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="workbench-undo"]'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('no-change returns to the current score action after Przelicz disappears', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [current, setCurrent] = useState(false);
      return (
        <main>
          {!current ? (
            <button data-testid="recalc" onClick={() => setOpen(true)}>
              Przelicz
            </button>
          ) : (
            <button data-testid="workbench-score-action">Wynik aktualny</button>
          )}
          {open ? (
            <DialogShell
              label="No change"
              testId="dialog"
              onClose={() => setOpen(false)}
              returnFocus={() => document.querySelector('[data-testid="workbench-score-action"]')}
            >
              <button
                data-testid="finish"
                onClick={() => {
                  setCurrent(true);
                  setOpen(false);
                }}
              >
                Gotowe
              </button>
            </DialogShell>
          ) : null}
        </main>
      );
    }
    await act(async () => root.render(<Harness />));
    await click('recalc');
    await click('finish');
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="workbench-score-action"]'),
    );
    expect(document.activeElement).not.toBe(document.body);
  });

  it('uses the nearest stable real action when the caller is removed and has no successor', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [removed, setRemoved] = useState(false);
      return (
        <main>
          <button data-testid="stable">Stable action</button>
          {!removed ? (
            <button data-testid="temporary" onClick={() => setOpen(true)}>
              Temporary
            </button>
          ) : null}
          {open ? (
            <DialogShell label="Fallback" testId="dialog" onClose={() => setOpen(false)}>
              <button
                data-testid="remove"
                onClick={() => {
                  setRemoved(true);
                  setOpen(false);
                }}
              >
                Remove caller
              </button>
            </DialogShell>
          ) : null}
        </main>
      );
    }
    await act(async () => root.render(<Harness />));
    await click('temporary');
    await click('remove');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="stable"]'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('Escape from New Recipe still closes and restores + Nowa receptura', async () => {
    const onEscape = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <main>
          <button data-testid="new-recipe" onClick={() => setOpen(true)}>
            + Nowa receptura
          </button>
          {open ? (
            <DialogShell
              label="Nowa receptura"
              testId="dialog"
              onClose={() => {
                onEscape();
                setOpen(false);
              }}
            >
              <button data-testid="dialog-action">Zacznij</button>
            </DialogShell>
          ) : null}
        </main>
      );
    }
    await act(async () => root.render(<Harness />));
    await click('new-recipe');
    await key('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.querySelector('[data-testid="new-recipe"]'));
  });

  it('only the topmost nested shell restores focus, then the parent returns to its trigger', async () => {
    function Harness() {
      const [first, setFirst] = useState(false);
      const [second, setSecond] = useState(false);
      return (
        <main>
          <button data-testid="root-trigger" onClick={() => setFirst(true)}>
            Open first
          </button>
          {first ? (
            <DialogShell label="First" testId="first" onClose={() => setFirst(false)}>
              <button data-testid="second-trigger" onClick={() => setSecond(true)}>
                Open second
              </button>
              <button data-testid="close-first" onClick={() => setFirst(false)}>
                Close first
              </button>
            </DialogShell>
          ) : null}
          {second ? (
            <DialogShell label="Second" testId="second" onClose={() => setSecond(false)}>
              <button data-testid="close-second" onClick={() => setSecond(false)}>
                Close second
              </button>
            </DialogShell>
          ) : null}
        </main>
      );
    }
    await act(async () => root.render(<Harness />));
    await click('root-trigger');
    await click('second-trigger');
    await click('close-second');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="second-trigger"]'));
    await click('close-first');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="root-trigger"]'));
  });

  it('keeps Tab cycling inside the topmost dialog', async () => {
    await act(async () => {
      root.render(
        <DialogShell label="Tabs" testId="dialog" onClose={vi.fn()}>
          <button data-testid="first">First</button>
          <button data-testid="last">Last</button>
        </DialogShell>,
      );
    });
    const first = document.querySelector<HTMLButtonElement>('[data-testid="first"]')!;
    const last = document.querySelector<HTMLButtonElement>('[data-testid="last"]')!;
    expect(document.activeElement).toBe(first);
    last.focus();
    await key('Tab');
    expect(document.activeElement).toBe(first);
    await key('Tab', true);
    expect(document.activeElement).toBe(last);
  });
});
