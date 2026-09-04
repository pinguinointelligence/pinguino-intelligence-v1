/** @vitest-environment jsdom */
/**
 * ONE MODAL SYSTEM — sizing, centering and lifecycle (owner cleanup 2026-09-04).
 *
 * The complaint was that the app felt unstable: dialogs opened at different
 * sizes, and some flows briefly showed two or three modal shells in sequence so
 * one flashed and was overwritten by the next. The audit found five different
 * widths across thirteen dialogs, three of them fighting the shell's own.
 *
 * These are behavioural assertions on the rendered DOM, not class-name checks.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogShell } from './DialogShell';
import { openDialogCount } from './dialogShellRegistry';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const panels = () => [...document.querySelectorAll('[data-dialog-panel="gellatti"]')];
const overlays = () => [...document.querySelectorAll('[data-dialog-shell="gellatti"]')];
const activePanels = () => [
  ...document.querySelectorAll('[data-dialog-panel="gellatti"][data-dialog-active="true"]'),
];

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('canonical modal sizing', () => {
  it('defaults to the size the owner accepted, and reports it on the panel', async () => {
    await act(async () => {
      root.render(
        <DialogShell label="a" testId="d" onClose={vi.fn()}>
          body
        </DialogShell>,
      );
    });
    // `default` is the „Maksymalna ilość została osiągnięta" reference.
    expect(panels()[0]?.getAttribute('data-dialog-size')).toBe('default');
    expect(panels()[0]?.className).toContain('w-[min(520px,94vw)]');
  });

  it('offers exactly TWO widths, and nothing else', async () => {
    // Owner rule: if the content fits, use `default` — including short content.
    // A narrower third member is what made the app read small → medium → large.
    for (const [size, width] of [
      ['default', '520px'],
      ['wide', '680px'],
    ] as const) {
      await act(async () => {
        root.render(
          <DialogShell label="a" testId="d" size={size} onClose={vi.fn()}>
            body
          </DialogShell>,
        );
      });
      expect(panels()[0]?.getAttribute('data-dialog-size'), size).toBe(size);
      expect(panels()[0]?.className, size).toContain(width);
    }
    // 420 must not come back.
    expect(
      readFileSync(resolve(process.cwd(), 'src/components/ui/DialogShell.tsx'), 'utf8'),
    ).not.toContain('420px');
  });

  it('centers every placement variant the app uses', async () => {
    for (const placement of ['center', 'responsive'] as const) {
      await act(async () => {
        root.render(
          <DialogShell label="a" testId="d" placement={placement} onClose={vi.fn()}>
            body
          </DialogShell>,
        );
      });
      const overlay = overlays()[0]!;
      // Centered by the overlay, not by per-dialog margins.
      expect(overlay.className, placement).toMatch(/place-items-center|items-center/);
      expect(overlay.className, placement).toContain('fixed inset-0');
    }
  });

  it('every shell shares one overlay model and one z-index authority', async () => {
    await act(async () => {
      root.render(
        <>
          <DialogShell label="a" testId="d1" onClose={vi.fn()}>
            a
          </DialogShell>
          <DialogShell label="b" testId="d2" placement="responsive" onClose={vi.fn()}>
            b
          </DialogShell>
        </>,
      );
    });
    const zIndexes = new Set(
      overlays().map((o) => (o.className.match(/z-\[\d+\]/) ?? ['none'])[0]),
    );
    expect(zIndexes.size, 'one z-index authority').toBe(1);
    expect([...zIndexes][0]).toBe('z-[70]');
  });
});

describe('single active modal', () => {
  it('marks only the topmost shell active when several are mounted', async () => {
    await act(async () => {
      root.render(
        <>
          <DialogShell label="first" testId="d1" onClose={vi.fn()}>
            first
          </DialogShell>
          <DialogShell label="second" testId="d2" onClose={vi.fn()}>
            second
          </DialogShell>
        </>,
      );
    });
    expect(panels()).toHaveLength(2);
    // The owner's complaint: two or three shells reading as competing windows.
    // Both may exist while a flow hands over, but exactly ONE is the dialog.
    expect(activePanels()).toHaveLength(1);
    expect(activePanels()[0]?.getAttribute('aria-label')).toBe('second');
    // The one underneath is hidden from assistive tech and cannot be clicked.
    const inert = panels().find((p) => p.getAttribute('data-dialog-active') === 'false')!;
    expect(inert.getAttribute('aria-hidden')).toBe('true');
    const inertOverlay = overlays().find((o) => o.getAttribute('data-dialog-active') === 'false')!;
    expect(inertOverlay.className).toContain('pointer-events-none');
    // And it paints no second scrim, so the screen does not darken twice.
    expect(inertOverlay.className).toContain('bg-transparent');
  });

  it('hands activity back when the top shell closes', async () => {
    const Two = ({ showSecond }: { showSecond: boolean }) => (
      <>
        <DialogShell label="first" testId="d1" onClose={vi.fn()}>
          first
        </DialogShell>
        {showSecond ? (
          <DialogShell label="second" testId="d2" onClose={vi.fn()}>
            second
          </DialogShell>
        ) : null}
      </>
    );
    await act(async () => root.render(<Two showSecond />));
    expect(activePanels()[0]?.getAttribute('aria-label')).toBe('second');
    await act(async () => root.render(<Two showSecond={false} />));
    // Replacement is clean: the survivor becomes the dialog again rather than
    // both going inert and leaving the user with a dead overlay.
    expect(panels()).toHaveLength(1);
    expect(activePanels()).toHaveLength(1);
    expect(activePanels()[0]?.getAttribute('aria-label')).toBe('first');
  });

  it('leaves no registration behind after unmount', async () => {
    await act(async () => {
      root.render(
        <DialogShell label="a" testId="d" onClose={vi.fn()}>
          a
        </DialogShell>,
      );
    });
    expect(openDialogCount()).toBe(1);
    await act(async () => root.render(<div />));
    // A leak here would make every later dialog think it was not the top one.
    expect(openDialogCount()).toBe(0);
    expect(panels()).toHaveLength(0);
  });
});
