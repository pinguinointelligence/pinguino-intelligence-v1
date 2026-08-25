import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import {
  starterMilkBase,
  starterLine,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import { targetStepToPosition } from './recipeAxisModel';
import { useRecipeProfileStore } from './recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  sorbetAuthoritySnapshots,
  sorbetMultiMainBase,
  unsupportedSorbet,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { ProfessionalMonitorModules } from './ProfessionalMonitorModules';
import { buildProfessionalMonitorModules, formatMonitorValue } from './professionalMonitorModel';

vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({
    plan: 'pro',
    tier: 'pro',
    isSignedIn: true,
    isPro: true,
    exactCorrectionGrams: true,
    fullFormula: true,
    technicalView: true,
    canViewExactGrams: true,
    canApplyStarterToStudio: true,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false,
    rescueMode: false,
  }),
}));

const behaviorFixtureState = vi.hoisted(() => ({
  snapshots: {} as Record<string, ProductBehaviorSnapshot>,
}));
vi.mock('@/stores/recipeStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/recipeStore')>();
  const real = actual.useRecipeStore;
  const mocked = Object.assign(
    (selector?: (state: ReturnType<typeof real.getState>) => unknown) => {
      const state = {
        ...real.getState(),
        productBehaviorSnapshots: behaviorFixtureState.snapshots,
      };
      return selector ? selector(state) : state;
    },
    {
      getState: real.getState,
      getInitialState: real.getInitialState,
      setState: real.setState,
      subscribe: real.subscribe,
    },
  );
  return { ...actual, useRecipeStore: mocked };
});

const { MonitorPanelContent } = await import('./MonitorPanelContent');

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

function renderSorbetMonitor(input: RecipeInput) {
  behaviorFixtureState.snapshots = sorbetAuthoritySnapshots(
    input,
    useRecipeStore.getState().toppings,
  );
  const result = calculateRecipe(input);
  const corrections = proposeCorrections({ input, context: recipeContext(input), redact: false });
  return renderToStaticMarkup(
    <MonitorPanelContent
      result={result}
      servingTemperatureC={input.target_temperature_c}
      corrections={corrections}
      input={input}
      onOpenProfile={() => undefined}
    />,
  );
}

function renderMonitor(input: RecipeInput = starterMilkBase()) {
  behaviorFixtureState.snapshots = productBehaviorTestSnapshots(input);
  const result = calculateRecipe(input);
  const corrections = proposeCorrections({ input, context: recipeContext(input), redact: false });
  return renderToStaticMarkup(
    <MonitorPanelContent
      result={result}
      servingTemperatureC={input.target_temperature_c}
      corrections={corrections}
      input={input}
      onOpenProfile={() => undefined}
    />,
  );
}

describe('professional Monitor — final owner-approved information architecture', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.setState({ toppings: [] });
  });

  it('keeps Monitor analysis-only and leaves the canonical score to the shared workbench header', () => {
    const html = renderMonitor();
    expect(html).not.toContain('data-testid="monitor-summary-score"');
    expect(html).not.toContain('monitor-detail-score');
    expect(html).toContain('data-testid="monitor-direction-evidence"');
    expect(html).not.toContain('data-testid="profile-direction-axes"');
    expect(html).not.toContain('jeden poziom');
    expect(textOf(html)).toContain('Bieżący wynik dla wybranych ustawień');
  });

  it('reads the shared target state without exposing any mutation control', () => {
    const input = starterMilkBase();
    const gramsBefore = input.items.map((item) => item.planned_grams);
    useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
    const after = renderMonitor(input);
    expect(textOf(after)).toContain('Słodycz');
    expect(targetStepToPosition(useRecipeStore.getState().direction_targets.sweetness)).toBe(75);
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(input.items.map((item) => item.planned_grams)).toEqual(gramsBefore);

    const profile = read('features', 'pro-workbench', 'ProfileDirectionAxes.tsx');
    const summary = read('features', 'pro-workbench', 'MonitorLiveSummary.tsx');
    expect(summary).not.toContain('ProfileDirectionAxes');
    expect(summary).not.toContain('setDirectionTarget');
    expect(profile).toContain('setDirectionTarget');
  });

  it('removes customer-facing confidence/readiness/trial copy and duplicate batch warnings', () => {
    const text = textOf(renderMonitor());
    for (const forbidden of [
      'Pewność danych',
      'Gotowość produkcyjna',
      'test próbnej partii',
      'Przed produkcją zalecany jest test próbnej partii',
      'Batch mass differs from the target',
      'WYNIK NA ŻYWO',
      'Oceniono ',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('renders exactly the seven approved compact Monitor modules', () => {
    const html = renderMonitor();
    const text = textOf(html);
    const modules = [
      ['sweetness', 'Słodycz'],
      ['hardness', 'Twardość'],
      ['freezing', 'Zamrożenie'],
      ['water-solids', 'Woda i ciała stałe'],
      ['fat', 'Tłuszcz i kremowość'],
      ['protein', 'Białko i struktura'],
      ['stability', 'Stabilność i ryzyka'],
    ] as const;
    for (const [id, title] of modules) {
      expect(html).toContain(`data-testid="monitor-module-${id}"`);
      expect(text).toContain(title);
    }
    expect(html).not.toContain('data-testid="monitor-module-sugars"');
    expect(text).toContain('POD');
    expect(text).toContain('NPAC');
    expect(text).toContain('PAC');
    expect(text).not.toContain('LÓD');
    expect(html).not.toContain('data-testid="user-monitor-module-expert"');
    expect(text).not.toContain('Tryb Expert');
    expect(text).not.toContain('Przypnij');
  });

  it('keeps PAC primary and ice fraction visibly secondary without duplicating PAC', () => {
    const input = starterMilkBase();
    const result = calculateRecipe(input);
    if (result.pac_points === null || result.ice_fraction_percent === null) {
      throw new Error('starter fixture requires PAC and ice fraction');
    }
    const freezing = buildProfessionalMonitorModules(
      result,
      input.target_temperature_c,
      input,
    ).find((module) => module.id === 'freezing');
    const ice = freezing?.primary.find((metric) => metric.id === 'ice_fraction');
    const pac = freezing?.primary.find((metric) => metric.id === 'pac');

    expect(ice).toMatchObject({
      id: 'ice_fraction',
      rawMetric: 'ice_fraction',
      label: 'Frakcja lodu',
      value: result.ice_fraction_percent,
      unit: '%',
    });
    expect(pac).toMatchObject({ id: 'pac', value: result.pac_points, unit: '' });

    const html = renderToStaticMarkup(
      <ProfessionalMonitorModules
        modules={buildProfessionalMonitorModules(result, input.target_temperature_c, input)}
      />,
    );
    expect(html).toContain('data-headline-metric="pac"');
    expect(html).toContain('data-headline-label="PAC"');
    expect(html).toContain('data-secondary-metric="ice_fraction"');
    expect(html).toContain('data-secondary-unit="%"');
    expect(html).toContain('data-secondary-label="Frakcja lodu"');
    const text = textOf(html);
    expect(text).toMatch(new RegExp(`PAC\\s+${formatMonitorValue(result.pac_points)}`));
    expect(text).toMatch(
      new RegExp(`Frakcja lodu\\s+${formatMonitorValue(result.ice_fraction_percent)}\\s+%`),
    );
    expect(html).not.toContain('data-testid="monitor-metric-pac"');
  });

  it('uses one non-wrapping right value column for summary and expanded detail rows', () => {
    const input = starterMilkBase();
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: () => JSON.stringify(['freezing', 'water-solids', 'fat', 'protein', 'stability']),
        setItem: () => undefined,
      },
    });
    try {
      const html = renderToStaticMarkup(
        <ProfessionalMonitorModules
          modules={buildProfessionalMonitorModules(
            calculateRecipe(input),
            input.target_temperature_c,
            input,
            'GOOD',
          )}
        />,
      );
      expect(html.match(/class="[^"]*monitor-value-column[^"]*"/g)?.length).toBeGreaterThan(10);
      expect(html).toContain('data-expanded="true"');
      expect(html).toContain('bg-pro-warm/70');
      expect(html).toContain('data-testid="monitor-module-details-freezing"');
      expect(html).toContain('data-testid="monitor-metric-serving-temperature"');
    } finally {
      vi.unstubAllGlobals();
    }

    const css = read('styles', 'theme-pro-light.css');
    expect(css).toContain('.monitor-value-column');
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).toContain('.monitor-detail-grid');
    expect(css).not.toMatch(
      /@container right-pane \(max-width: 540px\)[\s\S]*?\.monitor-detail-row\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it('renders all seven rows inside one continuous Monitor block', () => {
    const html = renderMonitor();
    expect(html.match(/data-testid="monitor-unified-block"/g)).toHaveLength(1);
    const unifiedAt = html.indexOf('data-testid="monitor-unified-block"');
    expect(unifiedAt).toBeGreaterThan(-1);
    for (const id of [
      'sweetness',
      'hardness',
      'freezing',
      'water-solids',
      'fat',
      'protein',
      'stability',
    ]) {
      expect(html.indexOf(`data-testid="monitor-module-${id}"`)).toBeGreaterThan(unifiedAt);
    }
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    expect(panel).toContain('<ProfessionalMonitorModules');
    expect(panel).toContain('embedded');
  });

  it('keeps canonical detail metrics behind independently expandable cards and hides numeric ranges', () => {
    const html = renderMonitor();
    const source = read('features', 'pro-workbench', 'ProfessionalMonitorModules.tsx');
    expect(source).toContain('data-raw-metric={metric.rawMetric}');
    expect(source).toContain('const [expanded, setExpanded]');
    expect(source).toContain('window.localStorage.setItem(STORAGE_KEY');
    expect(source).toContain('current.includes(module.id)');
    expect(html).not.toMatch(/data-(min|max|range)=/);
    expect(textOf(html)).not.toMatch(/zakres\s+\d+[.,]?\d*\s*[–-]\s*\d/i);
  });

  it('renders freezing stability as a qualitative Polish domain status, never a dash or number', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: () => JSON.stringify(['stability']),
        setItem: () => undefined,
      },
    });
    try {
      const input = starterMilkBase();
      const html = renderToStaticMarkup(
        <ProfessionalMonitorModules
          modules={buildProfessionalMonitorModules(
            calculateRecipe(input),
            input.target_temperature_c,
            input,
            'GOOD',
          )}
        />,
      );
      const row = html.match(
        /<div[^>]*data-testid="monitor-metric-freezing-stability"[\s\S]*?<\/div>/,
      )?.[0];
      expect(row).toBeDefined();
      expect(row).toContain('data-domain-status="GOOD"');
      expect(textOf(row ?? '')).toContain('Stabilność zamrażania');
      expect(textOf(row ?? '')).toContain('Dobra');
      expect(textOf(row ?? '')).not.toContain('—');
      expect(textOf(row ?? '')).not.toMatch(/\d|%/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the BASE freezing status unchanged through topping 0 → 1 → 20 → 50 → 0 g and removal', () => {
    const input = starterMilkBase();
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: () => JSON.stringify(['stability']),
        setItem: () => undefined,
      },
    });
    try {
      useRecipeStore.getState().addTopping(input.items[0]!.ingredient, 0);
      const toppingId = useRecipeStore.getState().toppings[0]!.id;

      for (const grams of [0, 1, 20, 50, 0]) {
        useRecipeStore.getState().setToppingGrams(toppingId, grams);
        const html = renderMonitor(input);
        expect(html).toContain('data-domain-status="GOOD"');
        expect(textOf(html)).toContain('Stabilność zamrażania');
        expect(textOf(html)).toContain('Dobra');
        expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
      }

      useRecipeStore.getState().removeTopping(toppingId);
      const removedHtml = renderMonitor(input);
      expect(removedHtml).toContain('data-domain-status="GOOD"');
      expect(textOf(removedHtml)).toContain('Dobra');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['GOOD', 'Dobra'],
    ['ATTENTION', 'Wymaga uwagi'],
    ['UNAVAILABLE', 'Brak danych'],
    ['STALE', 'Oczekuje na przeliczenie'],
  ] as const)('maps %s in the adapter instead of deriving status in React', (status, copy) => {
    const input = starterMilkBase();
    const row = buildProfessionalMonitorModules(
      calculateRecipe(input),
      input.target_temperature_c,
      input,
      status,
    )
      .find((module) => module.id === 'stability')
      ?.primary.find((metric) => metric.id === 'freezing-stability');

    expect(row).toMatchObject({ value: null, unit: '', displayText: copy, domainStatus: status });
  });

  it('uses neutral no-evaluation scales without inventing a result', () => {
    const html = renderMonitor({ ...starterMilkBase(), items: [] });
    expect(html).toContain('aria-label="Słodycz: brak danych"');
    expect(html).not.toContain('data-testid="monitor-scale-pod-actual"');
    expect(textOf(html)).not.toContain('Poza zakresem');
    expect(textOf(html)).not.toContain('W ZAKRESIE');
  });

  it('shows an out-of-range segment only between the accepted band and actual point', () => {
    const problematic = withGrams(starterMilkBase(), starterLine('sucrose'), 10);
    const html = renderMonitor(problematic);
    expect(html).toMatch(/data-problem="true"/);
    const source = read('features', 'pro-workbench', 'ProfessionalMonitorModules.tsx');
    const geometry = read('features', 'pro-workbench', 'monitorScaleModel.ts');
    expect(source).toContain('data-testid={`${testId}-outside-segment`}');
    expect(geometry).toContain('redLeftPercent: markerPercent');
    expect(geometry).toContain('redLeftPercent: acceptedRightPercent');
  });

  it('shows only a compact amber preflight reminder and keeps Monitor as the daily workspace', () => {
    const html = renderMonitor();
    expect(html).toContain('data-testid="monitor-preflight-reminder"');
    expect(textOf(html)).toContain('Sprawdź ustawienia receptury');
    expect(html).not.toContain('data-testid="workbench-settings-line"');
  });

  it('keeps corrections compact and removes nutrition/process content from Monitor', () => {
    const html = renderMonitor();
    expect(html).not.toContain('monitor-detail-score');
    expect(html).not.toContain('data-testid="monitor-secondary-nutrition"');
    expect(html).not.toContain('data-testid="monitor-process-guide-entry"');
    expect(textOf(html)).not.toContain('Jak je przygotować?');
    expect(html).not.toContain('data-testid="monitor-owner-diagnostics"');
    expect(textOf(html)).not.toContain('Diagnostyka właściciela');
    const source = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    expect(source).not.toContain('ProcessGuideEntry');
    expect(source).not.toContain('NutritionCostScorePanel');
  });

  it('preserves pin/layout contracts without mounting their noisy presentation in normal Monitor', () => {
    const source = read('features', 'user-monitor', 'userMonitorLayout.ts');
    expect(source).toContain('export function pinMetric');
    expect(source).toContain('export function unpinMetric');
    expect(source).toContain('export function movePinned');
    expect(renderMonitor()).not.toContain('aria-label="Przypnij:');
  });
});

describe('professional Monitor — Sorbet uses the composition-freezing authority', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.setState({ toppings: [] });
  });

  const stabilityRow = (html: string) =>
    html.match(/<div[^>]*data-testid="monitor-metric-freezing-stability"[\s\S]*?<\/div>/)?.[0] ??
    '';

  it.each([-11, -12, -13] as const)(
    'shows a truthful "Dobra" for a valid supported Sorbet at %i°C',
    (temperature) => {
      vi.stubGlobal('window', {
        location: { hostname: 'localhost' },
        localStorage: { getItem: () => JSON.stringify(['stability']), setItem: () => undefined },
      });
      try {
        const html = renderSorbetMonitor(sorbetMultiMainBase(temperature));
        const row = stabilityRow(html);
        expect(row).toContain('data-domain-status="GOOD"');
        expect(textOf(row)).toContain('Dobra');
        expect(textOf(row)).not.toContain('Brak danych');
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('maps a stale Sorbet BASE to "Oczekuje na przeliczenie" and a current one back to "Dobra"', () => {
    // The static-markup harness reads the profile store's initial snapshot, so the
    // STALE/CURRENT transition is asserted at the canonical evaluator
    // (freezingStabilityStatus.test.ts) and at the adapter boundary here.
    const input = sorbetMultiMainBase(-12);
    const row = (status: 'STALE' | 'GOOD') =>
      buildProfessionalMonitorModules(
        calculateRecipe(input),
        input.target_temperature_c,
        input,
        status,
      )
        .find((module) => module.id === 'stability')
        ?.primary.find((metric) => metric.id === 'freezing-stability');
    expect(row('STALE')).toMatchObject({
      displayText: 'Oczekuje na przeliczenie',
      domainStatus: 'STALE',
    });
    expect(row('GOOD')).toMatchObject({ displayText: 'Dobra', domainStatus: 'GOOD' });
  });

  it('shows "Brak danych" — never "Dobra" — for an unsupported Sorbet composition', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: { getItem: () => JSON.stringify(['stability']), setItem: () => undefined },
    });
    try {
      const row = stabilityRow(renderSorbetMonitor(unsupportedSorbet(sorbetMultiMainBase(-12))));
      expect(row).toContain('data-domain-status="UNAVAILABLE"');
      expect(textOf(row)).toContain('Brak danych');
      expect(textOf(row)).not.toContain('Dobra');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the Sorbet BASE freezing status unchanged through topping 0 → 1 → 20 → 0 g and removal', () => {
    const input = sorbetMultiMainBase(-11);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      localStorage: { getItem: () => JSON.stringify(['stability']), setItem: () => undefined },
    });
    try {
      useRecipeStore.getState().addTopping(input.items[0]!.ingredient, 0);
      const toppingId = useRecipeStore.getState().toppings[0]!.id;
      for (const grams of [0, 1, 20, 0]) {
        useRecipeStore.getState().setToppingGrams(toppingId, grams);
        const row = stabilityRow(renderSorbetMonitor(input));
        expect(row).toContain('data-domain-status="GOOD"');
        expect(textOf(row)).toContain('Dobra');
        expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
      }
      useRecipeStore.getState().removeTopping(toppingId);
      expect(stabilityRow(renderSorbetMonitor(input))).toContain('data-domain-status="GOOD"');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('describes Sorbet ice as ice mass / total mix mass and leaves the Gelato tooltip unchanged', () => {
    const iceRow = (input: RecipeInput) =>
      buildProfessionalMonitorModules(
        calculateRecipe(input),
        input.target_temperature_c,
        input,
        'GOOD',
      )
        .find((module) => module.id === 'freezing')
        ?.primary.find((metric) => metric.id === 'ice_fraction');
    const sorbet = iceRow(sorbetMultiMainBase(-12));
    expect(sorbet?.tooltip).toContain('Udział masy lodu w całej mieszance');
    expect(sorbet?.tooltip).toContain('masa lodu / masa całej mieszanki');
    expect(sorbet?.tooltip).not.toContain('zamrożonej wody');
    const gelato = iceRow(starterMilkBase());
    expect(gelato?.tooltip).toBe(
      'Udział zamrożonej wody. Wpływa na twardość i odczucie lodu w temperaturze serwowania.',
    );
  });
});
