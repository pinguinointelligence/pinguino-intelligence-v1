import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { TARGET_BANDS } from '@/engine/config/targets';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { MonitorRangeScale, ProfessionalMonitorModules } from './ProfessionalMonitorModules';
import { buildProfessionalMonitorModules } from './professionalMonitorModel';
import {
  buildMonitorScaleModel,
  monitorDisplayDomainFromEngine,
  monitorScaleGeometry,
  type MonitorScaleModel,
} from './monitorScaleModel';

const model = (overrides: Partial<MonitorScaleModel> = {}): MonitorScaleModel => ({
  metricId: 'pod',
  currentValue: 16,
  displayDomainMin: 0,
  displayDomainMax: 30,
  acceptedMin: 12,
  acceptedMax: 20,
  status: 'in_range',
  ...overrides,
});

describe('MonitorRangeScale — authoritative normalized geometry', () => {
  it('uses accepted span/display span for green width and accepted offset for left', () => {
    const geometry = monitorScaleGeometry(model());
    expect(geometry.acceptedLeftPercent).toBeCloseTo(40);
    expect(geometry.acceptedWidthPercent).toBeCloseTo(80 / 3);
    expect(geometry.markerPercent).toBeCloseTo(160 / 3);
    expect(geometry.redLeftPercent).toBeNull();
    expect(geometry.redWidthPercent).toBe(0);
  });

  it('renders different accepted spans as different widths on the same domain', () => {
    const narrow = monitorScaleGeometry(model({ acceptedMin: 13, acceptedMax: 17 }));
    const wide = monitorScaleGeometry(model({ acceptedMin: 10, acceptedMax: 20 }));
    expect(wide.acceptedWidthPercent).toBeGreaterThan(narrow.acceptedWidthPercent);
  });

  it('uses the same domain for current and Preview values of one metric', () => {
    const current = buildMonitorScaleModel('ice_fraction', 49, { min: 45, max: 54.5 });
    const preview = buildMonitorScaleModel('ice_fraction', 52, { min: 45, max: 54.5 });
    expect(current).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview).toMatchObject({
      displayDomainMin: current!.displayDomainMin,
      displayDomainMax: current!.displayDomainMax,
      acceptedMin: current!.acceptedMin,
      acceptedMax: current!.acceptedMax,
    });
  });

  it('normalizes current and Preview markers onto one shared Engine-derived ruler', () => {
    const current = buildMonitorScaleModel('pod', 10, { min: 12, max: 17 });
    const preview = buildMonitorScaleModel('pod', 30, { min: 12, max: 17 });
    const html = renderToStaticMarkup(
      <MonitorRangeScale
        model={current}
        previewModel={preview}
        testId="monitor-scale-shared"
        label="Słodycz"
      />,
    );
    expect(html).toContain('data-testid="monitor-scale-shared-actual"');
    expect(html).toContain('data-position="0"');
    expect(html).toContain('data-testid="monitor-scale-shared-preview"');
    expect(html).toContain('data-position="100"');
    expect(html).toContain('left:10%');
    expect(html).toContain('width:25%');
  });

  it.each([
    [
      'below',
      model({ currentValue: 6, status: 'below' }),
      { redLeftPercent: 20, redWidthPercent: 20 },
    ],
    [
      'above',
      model({ currentValue: 27, status: 'above' }),
      { redLeftPercent: 200 / 3, redWidthPercent: 70 / 3 },
    ],
  ] as const)(
    'draws %s red only between marker and accepted boundary',
    (_name, input, expected) => {
      const geometry = monitorScaleGeometry(input);
      expect(geometry.redLeftPercent).toBeCloseTo(expected.redLeftPercent);
      expect(geometry.redWidthPercent).toBeCloseTo(expected.redWidthPercent);
    },
  );

  it.each([
    ['pod', 15.98],
    ['npac', 35.49],
    ['ice_fraction', 50],
    ['water', 62.18],
    ['fat', 8.76],
    ['aerating_protein', 4.2],
    ['lactose_sandiness_risk', 7.1],
  ] as const)(
    'derives the %s display domain only from locked Engine bands and value',
    (metricId, value) => {
      const engineValues = TARGET_BANDS.flatMap((band) => {
        const range = band.metrics[metricId];
        return range ? [range.min, range.max] : [];
      });
      expect(monitorDisplayDomainFromEngine(metricId, value)).toEqual({
        min: Math.min(...engineValues, value),
        max: Math.max(...engineValues, value),
      });
    },
  );

  it.each([
    ['pod', 15.98, 12, 17],
    ['npac', 35.49, 33, 42],
    ['ice_fraction', 50, 45, 54.5],
    ['water', 62.18, 57, 70],
    ['fat', 8.76, 5, 12],
    ['aerating_protein', 4.2, 3, 6],
    ['lactose_sandiness_risk', 7.1, 5, 9],
  ] as const)(
    'keeps the Engine band and numeric value together for %s',
    (metricId, value, min, max) => {
      expect(buildMonitorScaleModel(metricId, value, { min, max })).toMatchObject({
        metricId,
        currentValue: value,
        acceptedMin: min,
        acceptedMax: max,
        status: 'in_range',
      });
    },
  );

  it('uses the Engine one-sided direction for lactose risk without changing its 5–9 band', () => {
    const safeBelow = buildMonitorScaleModel('lactose_sandiness_risk', 2, { min: 5, max: 9 });
    const inRange = buildMonitorScaleModel('lactose_sandiness_risk', 7.1, { min: 5, max: 9 });
    const riskyAbove = buildMonitorScaleModel('lactose_sandiness_risk', 11, { min: 5, max: 9 });

    expect(safeBelow).toMatchObject({
      acceptedMin: 5,
      acceptedMax: 9,
      status: 'below_safe',
    });
    expect(inRange).toMatchObject({ acceptedMin: 5, acceptedMax: 9, status: 'in_range' });
    expect(riskyAbove).toMatchObject({ acceptedMin: 5, acceptedMax: 9, status: 'above' });

    expect(monitorScaleGeometry(safeBelow!)).toMatchObject({
      markerPercent: 0,
      redLeftPercent: null,
      redWidthPercent: 0,
    });
    const riskyGeometry = monitorScaleGeometry(riskyAbove!);
    expect(riskyGeometry.markerPercent).toBe(100);
    expect(riskyGeometry.redLeftPercent).toBeCloseTo(200 / 3);
    expect(riskyGeometry.redWidthPercent).toBeCloseTo(100 / 3);
  });

  it('keeps a safe below-band lactose risk informational in details and directional on its scale', () => {
    const input = starterMilkBase();
    const result = calculateRecipe(input);
    const safeRiskResult = {
      ...result,
      indicators: result.indicators.map((indicator) =>
        indicator.key === 'lactose_sandiness_risk'
          ? {
              ...indicator,
              value: 2,
              band: { min: 5, max: 9 },
              status: 'good' as const,
            }
          : indicator,
      ),
    };
    const stability = buildProfessionalMonitorModules(
      safeRiskResult,
      input.target_temperature_c,
      input,
    ).find((module) => module.id === 'stability')!;
    const risk = stability.primary.find((metric) => metric.id === 'lactose_sandiness_risk')!;
    expect(risk.reading).toMatchObject({ state: 'info', side: 'below' });
    expect(risk.scaleModel).toMatchObject({
      currentValue: 2,
      acceptedMin: 5,
      acceptedMax: 9,
      status: 'below_safe',
    });
    expect(stability.problem).toBe(false);
  });

  it('renders safe-below current and risky-above Preview on one ruler without false current red', () => {
    const current = buildMonitorScaleModel('lactose_sandiness_risk', 2, { min: 5, max: 9 });
    const preview = buildMonitorScaleModel('lactose_sandiness_risk', 11, { min: 5, max: 9 });
    const html = renderToStaticMarkup(
      <MonitorRangeScale
        model={current}
        previewModel={preview}
        testId="monitor-scale-lactose-risk"
        label="Stabilność i ryzyka"
      />,
    );

    expect(html).toContain(
      'aria-label="Stabilność i ryzyka: poniżej zakresu — bezpiecznie; Podgląd: powyżej zakresu"',
    );
    expect(html).toContain('data-testid="monitor-scale-lactose-risk-accepted"');
    expect(html).toContain('data-testid="monitor-scale-lactose-risk-actual"');
    expect(html).toContain('data-position="0"');
    expect(html).toContain('data-testid="monitor-scale-lactose-risk-preview"');
    expect(html).toContain('data-position="100"');
    expect(html).not.toContain('monitor-scale-lactose-risk-outside-segment');
    expect(html).not.toContain('5–9');
    expect(html).not.toContain('5-9');
  });

  it('renders red only above the accepted lactose-risk boundary', () => {
    const scale = buildMonitorScaleModel('lactose_sandiness_risk', 11, { min: 5, max: 9 });
    const html = renderToStaticMarkup(
      <MonitorRangeScale
        model={scale}
        testId="monitor-scale-lactose-risk-high"
        label="Stabilność i ryzyka"
      />,
    );

    expect(html).toContain('aria-label="Stabilność i ryzyka: powyżej zakresu"');
    expect(html).toContain('data-testid="monitor-scale-lactose-risk-high-outside-segment"');
    expect(html).not.toContain('5–9');
    expect(html).not.toContain('5-9');
  });

  it('covers all 15 seeded category/temperature cells and fails closed on omitted bands', () => {
    expect(TARGET_BANDS).toHaveLength(15);
    for (const band of TARGET_BANDS) {
      for (const metricId of [
        'pod',
        'npac',
        'ice_fraction',
        'water',
        'fat',
        'aerating_protein',
        'lactose_sandiness_risk',
      ] as const) {
        const range = band.metrics[metricId];
        const scale = buildMonitorScaleModel(
          metricId,
          range ? (range.min + range.max) / 2 : null,
          range,
        );
        if (range)
          expect(scale, `${band.category}@${band.temperature_c}:${metricId}`).not.toBeNull();
        else expect(scale, `${band.category}@${band.temperature_c}:${metricId}`).toBeNull();
      }
    }
  });

  it('does not fabricate a marker or endpoint copy for unknown data', () => {
    expect(buildMonitorScaleModel('lactose_sandiness_risk', null, { min: 5, max: 9 })).toBeNull();
    const html = renderToStaticMarkup(
      <MonitorRangeScale
        model={null}
        previewModel={null}
        testId="monitor-scale-unknown"
        label="Test"
      />,
    );
    expect(html).not.toContain('monitor-scale-unknown-actual');
    expect(html).not.toContain('monitor-scale-unknown-accepted');
    expect(html).toContain('aria-label="Test: brak danych"');
    expect(html).not.toMatch(/\d+\s*[–-]\s*\d+/);
  });

  it('does not render a Preview marker without an authoritative current scale', () => {
    const html = renderToStaticMarkup(
      <MonitorRangeScale
        model={null}
        previewModel={model()}
        testId="monitor-scale-preview-only"
        label="Test"
      />,
    );
    expect(html).not.toContain('monitor-scale-preview-only-preview');
    expect(html).toContain('aria-label="Test: brak danych"');
  });

  it('builds a numeric model from the Engine band without exposing endpoints as copy', () => {
    const scale = buildMonitorScaleModel('npac', 35.49, { min: 33, max: 42 });
    expect(scale).toMatchObject({
      metricId: 'npac',
      currentValue: 35.49,
      acceptedMin: 33,
      acceptedMax: 42,
      status: 'in_range',
    });
    const html = renderToStaticMarkup(
      <MonitorRangeScale model={scale} testId="monitor-scale-npac" label="Twardość" />,
    );
    expect(html).toContain('aria-label="Twardość: w zakresie"');
    expect(html).not.toContain('33–42');
    expect(html).not.toContain('33-42');
  });

  it('uses one authoritative metric for each technology-card value and scale', () => {
    const input = starterMilkBase();
    const modules = buildProfessionalMonitorModules(
      calculateRecipe(input),
      input.target_temperature_c,
      input,
    );
    const html = renderToStaticMarkup(<ProfessionalMonitorModules modules={modules} />);
    expect(html).toContain('data-headline-metric="ice_fraction"');
    expect(html).toContain('data-headline-metric="water"');
    expect(html).toContain('data-headline-metric="fat"');
    expect(html).toContain('data-headline-metric="aerating_protein"');
    expect(html).toContain('data-headline-metric="lactose_sandiness_risk"');
    expect(html).not.toContain('data-headline-metric="pac"');
  });
});
