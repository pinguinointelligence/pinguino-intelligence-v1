// @vitest-environment jsdom
/**
 * DESIGN V3.0 Version 9 §12 — PRO Monitor on a phone / iPad portrait, on the REAL
 * `StudioEngineSurface`.
 *
 * What §12 says, and what this file holds shut: Monitor comes down from the top at its
 * full height, between the pinned header and the bottom navigation; the recipe stays
 * visible and usable UNDER it, with no scrim; a grip on its bottom edge resizes it with
 * one finger (pointer events, pointer capture) and with the arrow keys; 132 px is the
 * floor; scrolling the indicators is not a resize. Owner 2026-09-18 (OD-20): this is
 * Monitor's rule alone — Produkcja and Etykieta keep the modal cockpit, and desktop is
 * untouched.
 *
 * Heavy children are stand-ins; the geometry jsdom cannot produce is stubbed, so every
 * assertion reads the surface's own wiring rather than a simulated layout.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { PRO_DESKTOP_MIN_WIDTH_PX } from '@/features/shell/proFrameGeometry';
import {
  MOBILE_COCKPIT_QUERY,
  shouldActivateMobileCockpitModal,
} from '@/features/studio/mobileCockpitModal';
import { MONITOR_MIN_HEIGHT_PX, MONITOR_RECIPE_STRIP_PX } from './monitorPanelResize';

vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({ fullFormula: true, technicalView: false, exactCorrectionGrams: false }),
}));
vi.mock('@/features/production-workspace/useProductionWorkspace', () => ({
  useProductionWorkspace: () => ({
    session: null,
    practicalReady: false,
    deviationDecisionUnresolved: false,
    forecastResult: null,
    corrections: null,
    forecastInput: null,
  }),
}));
vi.mock('@/features/studio/useStudioResult', () => ({
  useStudioResult: () => ({ result: { items: [], total_batch_g: 0 }, corrections: {}, input: {} }),
}));
vi.mock('@/features/ingredient-builder/IngredientBuilder', () => ({
  IngredientBuilder: ({ recipeActionDock }: { recipeActionDock?: ReactNode }) => (
    <div data-testid="stand-in-ingredients">{recipeActionDock}</div>
  ),
}));
vi.mock('@/features/pro-core/HistoricalVersionNotice', () => ({
  HistoricalVersionNotice: () => null,
}));
vi.mock('@/features/pro-workbench/WorkbenchRecipeActionDock', () => ({
  WorkbenchRecipeActionDock: () => (
    <button type="button" data-testid="stand-in-recalc">
      Przelicz
    </button>
  ),
}));
/* The setup flow is §3's subject, not §12's: a confirmed recipe goes straight to the
   workbench, which is the state every assertion here is about. */
vi.mock('@/features/pro-workbench/proSetupFlowGate', () => ({
  useProSetupFlowGate: () => ({ step: null, defaultsNotice: false, draftIdentity: null }),
}));
vi.mock('@/features/pro-workbench/RecipeProfilePanel', () => ({
  RecipeProfilePanel: () => <div data-testid="stand-in-cockpit">Monitor</div>,
}));

const { StudioEngineSurface } = await import('./StudioEngineSurface');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/** The room §12 gives Monitor on a 812 px phone: viewport − header − bottom stack. */
const HOST_TOP = 65;
const HOST_HEIGHT = 661;

let host: HTMLDivElement;
let root: Root;
let narrowViewport = true;
let capturedPointers: number[] = [];

const q = <T extends HTMLElement = HTMLElement>(testId: string) =>
  document.body.querySelector<T>(`[data-testid="${testId}"]`);

const rect = (top: number, height: number) =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 390,
    width: 390,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

/** jsdom lays nothing out, so the three elements §12 measures answer for themselves. */
function stubGeometry() {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const testId = this.dataset.testid;
      if (testId === 'mobile-cockpit-sheet') return rect(HOST_TOP, HOST_HEIGHT);
      if (testId === 'monitor-resizable-panel') {
        const declared = this.style.height;
        const height =
          declared && declared.endsWith('px') ? Number.parseFloat(declared) : HOST_HEIGHT;
        return rect(HOST_TOP, height);
      }
      if (this.classList.contains('ingredient-editor-sheet')) {
        return rect(Number(this.dataset.stubTop ?? 0), 300);
      }
      return rect(0, 0);
    },
  });
}

const render = async (activeTab: 'monitor' | 'production') => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <StudioEngineSurface
          activeTab={activeTab}
          onTabChange={() => undefined}
          onRecalculate={() => undefined}
        />
      </MemoryRouter>,
    ),
  );
};

const panelHeight = () => q('monitor-resizable-panel')!.style.height;

const pointer = (type: string, clientY: number) =>
  new MouseEvent(type, { clientY, bubbles: true, cancelable: true });

const drag = async (from: number, to: number) => {
  const grip = q('monitor-resize-handle')!;
  await act(async () => {
    grip.dispatchEvent(pointer('pointerdown', from));
    grip.dispatchEvent(pointer('pointermove', to));
    grip.dispatchEvent(pointer('pointerup', to));
  });
};

const pressOnGrip = async (key: string) => {
  const grip = q('monitor-resize-handle')!;
  await act(async () => {
    grip.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  narrowViewport = true;
  capturedPointers = [];
  window.matchMedia = ((query: string) => ({
    matches: narrowViewport,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value(this: HTMLElement, pointerId: number) {
      capturedPointers.push(pointerId);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  stubGeometry();
  localStorage.clear();
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useRecipeStore.getState().startNewRecipe('gelato');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.querySelectorAll('.ingredient-editor-sheet').forEach((node) => node.remove());
});

describe('§12 — Monitor is a resizable panel over the recipe, not a modal sheet', () => {
  it('MONITOR-V3-01 shows no scrim: the recipe stays visible under the panel', async () => {
    await render('monitor');
    const sheet = q('mobile-cockpit-sheet')!;
    expect(sheet.querySelector('.bg-black\\/35')).toBeNull();
    expect(sheet.querySelector('[aria-label="Zamknij kokpit"].absolute.inset-0')).toBeNull();
    // With no scrim the host must not swallow taps meant for the recipe underneath.
    expect(sheet.className).toContain('pointer-events-none');
    expect(q('monitor-resizable-panel')!.className).toContain('pointer-events-auto');
  });

  it('MONITOR-V3-02 is not modal — no dialog role, no aria-modal, the page keeps its own focus', async () => {
    await render('monitor');
    const panel = q('monitor-resizable-panel')!;
    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.getAttribute('aria-modal')).toBeNull();
    expect(panel.getAttribute('aria-labelledby')).toBe('mobile-cockpit-title');
  });

  it('MONITOR-V3-03 starts at its full height, below the header and above the bottom navigation', async () => {
    await render('monitor');
    expect(panelHeight()).toBe('100%');
    const panel = q('monitor-resizable-panel')!;
    expect(panel.dataset.sheetAnchor).toBe('top');
    const sheet = q('mobile-cockpit-sheet')!;
    expect(sheet.className).toContain('top-[var(--pro-mobile-header-height)]');
    expect(sheet.className).toContain('--pro-mobile-bottom-stack-height');
    expect(sheet.className).toContain('env(safe-area-inset-bottom)');
  });

  it('MONITOR-V3-04 has its own grip: a separator the arrows can reach', async () => {
    await render('monitor');
    const grip = q('monitor-resize-handle')!;
    expect(grip.getAttribute('role')).toBe('separator');
    expect(grip.getAttribute('aria-orientation')).toBe('horizontal');
    expect(grip.getAttribute('aria-label')).toBe('Przeciągnij, aby zmienić wysokość Monitora');
    expect(grip.tabIndex).toBe(0);
    expect(grip.className).toContain('touch-none');
  });

  it('MONITOR-V3-05 one finger on the grip resizes the panel, with pointer capture', async () => {
    await render('monitor');
    await drag(600, 300);
    expect(panelHeight()).toBe(`${HOST_HEIGHT - 300}px`);
    expect(capturedPointers.length).toBe(1);
  });

  it('MONITOR-V3-06 never drags below the 132 px minimum', async () => {
    await render('monitor');
    await drag(600, -4000);
    expect(panelHeight()).toBe(`${MONITOR_MIN_HEIGHT_PX}px`);
  });

  it('MONITOR-V3-07 never grows past the room between header and bottom navigation', async () => {
    await render('monitor');
    await drag(100, 4000);
    expect(panelHeight()).toBe(`${HOST_HEIGHT}px`);
  });

  it('MONITOR-V3-08 a tap on the grip is not a drag (under the threshold nothing moves)', async () => {
    await render('monitor');
    await drag(400, 402);
    expect(panelHeight()).toBe('100%');
  });

  it('MONITOR-V3-09 arrows, Home and End move the same edge', async () => {
    await render('monitor');
    await pressOnGrip('ArrowUp');
    expect(panelHeight()).toBe(`${HOST_HEIGHT - 40}px`);
    await pressOnGrip('ArrowDown');
    expect(panelHeight()).toBe(`${HOST_HEIGHT}px`);
    await pressOnGrip('Home');
    expect(panelHeight()).toBe(`${MONITOR_MIN_HEIGHT_PX}px`);
    await pressOnGrip('End');
    expect(panelHeight()).toBe(`${HOST_HEIGHT}px`);
  });

  it('MONITOR-V3-10 scrolling or pressing inside the content is never a resize', async () => {
    await render('monitor');
    await drag(600, 300);
    const resized = panelHeight();
    const content = q('stand-in-cockpit')!;
    await act(async () => {
      content.dispatchEvent(pointer('pointerdown', 500));
      content.dispatchEvent(pointer('pointermove', 100));
      content.dispatchEvent(pointer('pointerup', 100));
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      content.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(panelHeight()).toBe(resized);
    expect(capturedPointers.length).toBe(1);
  });

  it('MONITOR-V3-11 an open ingredient panel leaves a 56 px strip of the recipe, then gives the height back', async () => {
    await render('monitor');
    const editor = document.createElement('div');
    editor.className = 'ingredient-editor-sheet';
    editor.dataset.stubTop = String(HOST_TOP + 400);
    await act(async () => {
      document.body.append(editor);
    });
    expect(panelHeight()).toBe(`${400 - MONITOR_RECIPE_STRIP_PX}px`);

    await act(async () => {
      editor.remove();
    });
    // §12: „Po zamknięciu panelu wraca wysokość użytkownika” — here: the full start.
    expect(panelHeight()).toBe('100%');
  });

  it('MONITOR-V3-12 the give-way never overwrites the height the user chose', async () => {
    await render('monitor');
    await drag(600, 500); // the user's own 561 px
    expect(panelHeight()).toBe(`${HOST_HEIGHT - 100}px`);
    const editor = document.createElement('div');
    editor.className = 'ingredient-editor-sheet';
    editor.dataset.stubTop = String(HOST_TOP + 300);
    await act(async () => {
      document.body.append(editor);
    });
    expect(panelHeight()).toBe(`${300 - MONITOR_RECIPE_STRIP_PX}px`);
    await act(async () => {
      editor.remove();
    });
    expect(panelHeight()).toBe(`${HOST_HEIGHT - 100}px`);
  });

  it('MONITOR-V3-13 Produkcja keeps the modal cockpit it has (owner 2026-09-18, OD-20)', async () => {
    await render('production');
    expect(q('monitor-resizable-panel')).toBeNull();
    expect(q('monitor-resize-handle')).toBeNull();
    const sheet = q('mobile-cockpit-sheet')!;
    expect(sheet.querySelector('.bg-black\\/35')).not.toBeNull();
    expect(sheet.className).not.toContain('pointer-events-none');
    const panel = document.getElementById('mobile-cockpit-dialog')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('MONITOR-V3-14a the gate is the phone AND iPad-portrait one, not a phone-only width', () => {
    // 375 (phone) and 820 (iPad portrait) both answer this query; 1096+ is desktop,
    // which §12 deliberately does not change (`shouldActivateMobileCockpitModal`).
    expect(MOBILE_COCKPIT_QUERY).toBe(`(max-width: ${PRO_DESKTOP_MIN_WIDTH_PX - 1}px)`);
    for (const width of [375, 390, 768, 820, 1024]) {
      expect(width).toBeLessThan(PRO_DESKTOP_MIN_WIDTH_PX);
    }
    expect(shouldActivateMobileCockpitModal(true, true)).toBe(true);
    expect(shouldActivateMobileCockpitModal(true, false)).toBe(false);
  });

  it('MONITOR-V3-14 desktop keeps the column: no phone panel, no grip', async () => {
    narrowViewport = false;
    await render('monitor');
    expect(q('mobile-cockpit-sheet')).toBeNull();
    expect(q('monitor-resizable-panel')).toBeNull();
    expect(q('monitor-resize-handle')).toBeNull();
  });
});
