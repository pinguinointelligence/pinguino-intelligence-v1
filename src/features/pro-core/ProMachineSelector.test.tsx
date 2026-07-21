/**
 * S4 — professional machine + serving-mode selector contract.
 *
 * Proves the owner hierarchy WITHOUT touching the Engine:
 *  - „Maszyna profesjonalna" is FIRST and high-contrast, and opens EXACTLY the four approved
 *    serving modes (Świeże / −11 / −12 / −13) — never Ninja / −14 / −18 / witryna / custom;
 *  - each mode routes to an EXISTING supported cell via `temperatureForMode` (owner routing);
 *  - „Maszyny domowe" reuses the real active registry with approved auto-routing + auto-batch
 *    (no professional serving selector under it);
 *  - „Inne urządzenia" shows only real inactive registry records with the honest note.
 *
 * The recipe store is mocked so machine state is deterministic under static render (the zustand
 * server snapshot would otherwise ignore setState — see the workbar test for the same pattern).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import { isServingModeId, temperatureForMode } from '@/features/customer-flow/servingMode';
import { MACHINE_CATALOG, deriveMachineSetup, listActiveHomeMachines } from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';

interface MockRecipeState {
  machineKind: 'professional' | 'home' | null;
  servingModeId: string | null;
  machineId: string | null;
  target_batch_grams: number;
  setMachineSelection: (sel: unknown) => void;
  setBatchGrams: (grams: number) => void;
}

let mockState: MockRecipeState = {
  machineKind: null,
  servingModeId: null,
  machineId: null,
  target_batch_grams: 1000,
  setMachineSelection: () => {},
  setBatchGrams: () => {},
};

vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: (sel: (s: MockRecipeState) => unknown) => sel(mockState),
}));

const { ProMachineSelector } = await import('./ProMachineSelector');
const m = copy.proMachine;

const render = (state: Partial<MockRecipeState> = {}) => {
  mockState = { ...mockState, ...state };
  return renderToStaticMarkup(<ProMachineSelector />);
};

/** The four approved professional serving modes (owner: exactly these, no others). */
const PRO_SERVING_IDS = ['fresh', 'temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const;
const FORBIDDEN_MODE_IDS = ['ninja_gelato', 'ninja_swirl', 'temp_minus_14', 'temp_minus_18', 'witryna', 'custom'];

const activeHome = () => listActiveHomeMachines(MACHINE_CATALOG);
const inactive = () => MACHINE_CATALOG.filter((p) => !activeHome().includes(p));

/** renderToStaticMarkup escapes HTML entities (& < > "); mirror that for name comparisons. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/* Routing (pure — existing cells only, no new Engine)                 */
/* ------------------------------------------------------------------ */
describe('S4 professional serving-mode routing', () => {
  it('routes Świeże→−11, −11→−11, −12→−12, −13→−13 (owner routing)', () => {
    expect(temperatureForMode('fresh')).toBe(-11);
    expect(temperatureForMode('temp_minus_11')).toBe(-11);
    expect(temperatureForMode('temp_minus_12')).toBe(-12);
    expect(temperatureForMode('temp_minus_13')).toBe(-13);
  });

  it('the four professional modes only ever touch the existing −11/−12/−13 cells', () => {
    expect(PRO_SERVING_IDS.every((id) => isServingModeId(id))).toBe(true);
    const cells = new Set(PRO_SERVING_IDS.map((id) => temperatureForMode(id)));
    expect(cells).toEqual(new Set([-11, -12, -13]));
  });
});

/* ------------------------------------------------------------------ */
/* Home derivation (pure — real registry, approved auto-routing/batch) */
/* ------------------------------------------------------------------ */
describe('S4 home machines (real registry, honest auto-config)', () => {
  it('offers the active registry records and excludes the inactive Sage record', () => {
    const active = activeHome();
    expect(active.length).toBeGreaterThan(0);
    expect(active.some((p) => p.active === false)).toBe(false);
    expect(inactive().some((p) => p.id === 'sage-smart-scoop-bci600-uk-eu')).toBe(true);
  });

  it('every active home machine auto-routes to an existing supported temperature cell', () => {
    for (const profile of activeHome()) {
      const d = deriveMachineSetup(profile);
      expect(d.resolvedVisibleMode).not.toBeNull();
      expect(temperatureForMode(d.resolvedVisibleMode)).not.toBeNull();
    }
  });

  it('every active home machine auto-batch is an honest positive number or an honest none (never invented/negative)', () => {
    for (const profile of activeHome()) {
      const g = deriveMachineSetup(profile).recommendedBatchGrams;
      expect(g === null || (Number.isFinite(g) && g > 0)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Structure (static render — hierarchy, exactness, honesty)           */
/* ------------------------------------------------------------------ */
describe('S4 selector structure', () => {
  it('renders „Maszyna profesjonalna" FIRST, high-contrast, above Maszyny domowe and Inne urządzenia', () => {
    const html = render();
    const iPro = html.indexOf('data-testid="pro-machine-professional"');
    const iHome = html.indexOf(m.home.heading);
    const iOther = html.indexOf('data-testid="pro-machine-other"');
    expect(iPro).toBeGreaterThan(-1);
    expect(iPro).toBeLessThan(iHome);
    expect(iHome).toBeLessThan(iOther);
    const proSection = html.slice(iPro, iPro + 300);
    expect(proSection).toContain('bg-ink'); // dark card
    expect(proSection).toContain('text-paper'); // high-contrast text
    expect(html).toContain(m.professional.title);
    expect(html).toContain(m.professional.body);
  });

  it('opens EXACTLY the four approved serving modes — never Ninja / −14 / −18 / witryna / custom', () => {
    const html = render();
    const ids = [...html.matchAll(/data-testid="pro-serving-([a-z0-9_]+)"/g)].map((mm) => mm[1]);
    expect([...ids].sort()).toEqual([...PRO_SERVING_IDS].sort());
    for (const bad of FORBIDDEN_MODE_IDS) expect(html).not.toContain(`pro-serving-${bad}`);
    expect(html).toContain(m.serving.fresh);
    expect(html).toContain(m.serving.minus11);
    expect(html).toContain(m.serving.minus12);
    expect(html).toContain(m.serving.minus13);
  });

  it('lists every active home machine by its display name with a set-as-default affordance', () => {
    const html = render();
    for (const profile of activeHome()) {
      expect(html).toContain(esc(machineDisplayName(profile)));
      expect(html).toContain(`data-testid="pro-machine-home-${profile.id}"`);
    }
    expect(html).toContain('data-testid="pro-machine-set-default"');
    expect(html).toContain(m.home.setDefault);
  });

  it('shows „Inne urządzenia" with only real inactive records and the honest verification note', () => {
    const html = render();
    expect(html).toContain('data-testid="pro-machine-other"');
    expect(html).toContain(m.other.needsReview);
    const others = inactive();
    expect(others.length).toBeGreaterThan(0);
    for (const profile of others) expect(html).toContain(esc(machineDisplayName(profile)));
  });

  it('marks the selected professional serving mode as pressed (exactly one)', () => {
    const html = render({ machineKind: 'professional', servingModeId: 'temp_minus_12' });
    expect(html).toContain('data-testid="pro-serving-temp_minus_12"');
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });

  it('reveals the batch entry only after a machine is selected', () => {
    expect(render({ machineKind: null })).not.toContain('data-testid="pro-machine-batch"');
    expect(render({ machineKind: 'professional', servingModeId: 'fresh' })).toContain(
      'data-testid="pro-machine-batch"',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Engine-boundary honesty (source scan)                               */
/* ------------------------------------------------------------------ */
describe('S4 selector never tampers with the Engine', () => {
  it('routes via the approved helper and references no new Engine cells or protected constants', () => {
    const src = readFileSync(resolve(import.meta.dirname, 'ProMachineSelector.tsx'), 'utf8');
    expect(src).toContain('temperatureForMode');
    expect(src).not.toMatch(/temp_minus_14|temp_minus_18|witryna/);
    expect(src).not.toMatch(/TARGET_BANDS|CONFIG_VERSION|PAC_POD/);
  });
});
