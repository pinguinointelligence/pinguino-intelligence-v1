// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A1 — one-finger scrolling must survive modal surfaces.
 *
 * Every modal surface locks the page while it is open. Each one used to save
 * `body.style.overflow` on open and write that saved value back on close, which
 * only works when surfaces close in the exact reverse order they opened. On a
 * phone the DOCUMENT owns scrolling on /pro/recipe, so a lock that is never
 * released freezes the page for a one-finger swipe until a reload.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DialogShell } from './DialogShell';

const noop = () => undefined;

describe('the page scroll lock across modal surfaces', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.style.overflow = '';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.body.style.overflow = '';
  });

  const lower = (
    <DialogShell label="Edycja składnika" testId="lower-surface" onClose={noop}>
      <p>lower</p>
    </DialogShell>
  );

  it('unlocks the page when a surface opened later closes in the same commit as the one below it', async () => {
    await act(async () => root.render(lower));
    expect(document.body.style.overflow).toBe('hidden');

    // A confirmation opens LATER, inside the surface that is already open.
    await act(async () =>
      root.render(
        <DialogShell label="Edycja składnika" testId="lower-surface" onClose={noop}>
          <p>lower</p>
          <DialogShell label="Potwierdzenie" testId="upper-surface" onClose={noop}>
            <p>upper</p>
          </DialogShell>
        </DialogShell>,
      ),
    );
    expect(document.body.style.overflow).toBe('hidden');

    // Both go away in ONE commit — the recipe context remounting under them.
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe('');
  });

  it('stays locked while any surface is open, and unlocks only when the last one closes', async () => {
    const surfaces = (first: boolean, second: boolean) => (
      <>
        {first ? (
          <DialogShell label="Pierwsze okno" testId="first-surface" onClose={noop}>
            <p>first</p>
          </DialogShell>
        ) : null}
        {second ? (
          <DialogShell label="Drugie okno" testId="second-surface" onClose={noop}>
            <p>second</p>
          </DialogShell>
        ) : null}
      </>
    );

    await act(async () => root.render(surfaces(true, false)));
    await act(async () => root.render(surfaces(true, true)));
    // The surface that opened FIRST closes first; the second is still on screen.
    await act(async () => root.render(surfaces(false, true)));
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => root.render(surfaces(false, false)));
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the page’s own value, not a blanket empty string', async () => {
    document.body.style.overflow = 'clip';
    await act(async () => root.render(lower));
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe('clip');
  });
});
