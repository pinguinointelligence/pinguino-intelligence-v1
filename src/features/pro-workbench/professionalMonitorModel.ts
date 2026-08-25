import type { ProductCategory, RecipeInput, RecipeResult, TargetMetric } from '@/engine';
import {
  GOLDEN_RANGE_STATE_TEXT,
  bandPosition,
  type GoldenRangeReading,
} from '@/features/recipe-score';
import { assessStabilizerDosage } from '@/features/formulation/stabilizerDosage';
import type { FreezingStabilityStatus } from '@/features/recipe-constraints';
import { buildMonitorScaleModel, type MonitorScaleModel } from './monitorScaleModel';

export type ProfessionalMonitorModuleId =
  'freezing' | 'sugars' | 'water-solids' | 'fat' | 'protein' | 'stability';

export type ProfessionalRawMetricKey =
  | 'pod'
  | 'pac'
  | 'npac'
  | 'ice_fraction'
  | 'water'
  | 'total_solids'
  | 'fat'
  | 'aerating_protein'
  | 'protein_in_solids'
  | 'lactose'
  | 'lactose_sandiness_risk';

export interface ProfessionalMonitorMetric {
  id: string;
  rawMetric?: ProfessionalRawMetricKey;
  label: string;
  value: number | null;
  unit: string;
  reading: GoldenRangeReading | null;
  scaleModel: MonitorScaleModel | null;
  tooltip: string;
  displayText?: string;
  domainStatus?: FreezingStabilityStatus;
}

export interface ProfessionalMonitorModule {
  id: ProfessionalMonitorModuleId;
  title: string;
  primary: ProfessionalMonitorMetric[];
  secondary: ProfessionalMonitorMetric[];
  problem: boolean;
}

export const formatMonitorValue = (value: number) =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const TOOLTIP = {
  ice: 'Udział zamrożonej wody. Wpływa na twardość i odczucie lodu w temperaturze serwowania.',
  pac: 'Siła przeciwzamrożeniowa mieszanki. Wyższa wartość zwykle oznacza słabsze zamarzanie.',
  npac: 'Wskaźnik związany z odpornością mieszanki na zamarzanie i zachowaniem w temperaturze.',
  pod: 'Odczuwalna słodycz wynikająca z całego profilu cukrów receptury.',
  sugars: 'Łączna ilość cukrów obliczona przez Engine dla 100 g mieszanki.',
  water: 'Udział wody w całej recepturze. Wpływa na zamrożenie, strukturę i stabilność.',
  solids: 'Udział składników innych niż woda. Wpływa na pełnię i strukturę produktu.',
  fat: 'Łączny udział tłuszczu. Wpływa na kremowość, pełnię i topnienie.',
  aeratingProtein: 'Część białek wspierająca napowietrzenie i utrzymanie struktury.',
  proteinInSolids: 'Udział białka w suchej części mieszanki.',
  lactoseRisk: 'Wskaźnik ryzyka wyczuwalnej krystalizacji laktozy podczas przechowywania.',
  stabilizer:
    'Ilość stabilizatora w bieżącej recepturze względem zatwierdzonego profilu składnika.',
  stability: 'Semantyczny stan zachowania przy zamrażaniu, bez powtarzania surowej wartości NPAC.',
  serving: 'Temperatura użyta przez Engine do bieżącej oceny technologicznej.',
  fiber: 'Łączna ilość błonnika w całej partii.',
  totalFat: 'Łączna masa tłuszczu w aktualnej partii.',
  totalProtein: 'Łączna masa białka w aktualnej partii.',
  sugarType: 'Masa tego rodzaju cukru w aktualnej partii.',
  lactose: 'Udział laktozy w całej mieszance.',
  salt: 'Łączna masa soli w aktualnej partii.',
  alcohol: 'Udział alkoholu w całej mieszance.',
} as const;

/**
 * Sorbet ice is an explicit total-mix quantity (ice mass / total mix mass) from
 * the composition-sensitive solver — never "frozen water share" and never a
 * milk-anchor estimate. Anchor-calibrated profiles keep their accepted wording.
 */
const SORBET_ICE_TOOLTIP =
  'Udział masy lodu w całej mieszance (masa lodu / masa całej mieszanki) w temperaturze serwowania. Wpływa na twardość i odczucie lodu.';

const iceTooltip = (category: ProductCategory): string =>
  category === 'sorbet' ? SORBET_ICE_TOOLTIP : TOOLTIP.ice;

const indicator = (result: RecipeResult, metric: TargetMetric) =>
  result.indicators.find((candidate) => candidate.key === metric);

const readingFor = (result: RecipeResult, metric: TargetMetric): GoldenRangeReading | null => {
  const source = indicator(result, metric);
  if (source?.value == null || source.band == null) return null;
  const safeDirection =
    source.status === 'good' && source.value < source.band.min
      ? { below: 'safe' as const }
      : source.status === 'good' && source.value > source.band.max
        ? { above: 'safe' as const }
        : undefined;
  return bandPosition(source.value, source.band, { direction: safeDirection });
};

const metric = (
  id: string,
  label: string,
  value: number | null,
  unit: string,
  tooltip: string,
  reading: GoldenRangeReading | null = null,
  rawMetric?: ProfessionalRawMetricKey,
  scaleModel: MonitorScaleModel | null = null,
): ProfessionalMonitorMetric => ({
  id,
  rawMetric,
  label,
  value,
  unit,
  reading,
  scaleModel,
  tooltip,
});

const classified = (
  result: RecipeResult,
  target: TargetMetric,
  label: string,
  tooltip: string,
  rawMetric: ProfessionalRawMetricKey,
): ProfessionalMonitorMetric => {
  const source = indicator(result, target);
  const value = source?.value ?? null;
  return metric(
    target,
    label,
    value,
    target === 'ice_fraction' ||
      target === 'water' ||
      target === 'total_solids' ||
      target === 'fat' ||
      target === 'aerating_protein' ||
      target === 'protein_in_solids' ||
      target === 'lactose' ||
      target === 'lactose_sandiness_risk'
      ? '%'
      : '',
    tooltip,
    readingFor(result, target),
    rawMetric,
    buildMonitorScaleModel(target, value, source?.band),
  );
};

const stabilizerReading = (
  status: ReturnType<typeof assessStabilizerDosage>[number]['status'],
): GoldenRangeReading => {
  if (status === 'within_window') {
    return {
      state: 'golden',
      textKey: GOLDEN_RANGE_STATE_TEXT.golden.textKey,
      text: GOLDEN_RANGE_STATE_TEXT.golden.text,
      side: 'inside',
    };
  }
  if (status === 'below_window' || status === 'above_window') {
    return {
      state: 'red',
      textKey: GOLDEN_RANGE_STATE_TEXT.red.textKey,
      text: GOLDEN_RANGE_STATE_TEXT.red.text,
      side: status === 'below_window' ? 'below' : 'above',
    };
  }
  return {
    state: 'neutral',
    textKey: GOLDEN_RANGE_STATE_TEXT.neutral.textKey,
    text: GOLDEN_RANGE_STATE_TEXT.neutral.text,
    side: null,
  };
};

const hasProblem = (rows: readonly ProfessionalMonitorMetric[]) =>
  rows.some((row) => row.reading?.state === 'red');

const FREEZING_STABILITY_COPY: Readonly<Record<FreezingStabilityStatus, string>> = {
  GOOD: 'Dobra',
  ATTENTION: 'Wymaga uwagi',
  UNAVAILABLE: 'Brak danych',
  STALE: 'Oczekuje na przeliczenie',
};

const freezingStabilityReading = (status: FreezingStabilityStatus): GoldenRangeReading => {
  if (status === 'GOOD') {
    return {
      state: 'golden',
      textKey: GOLDEN_RANGE_STATE_TEXT.golden.textKey,
      text: GOLDEN_RANGE_STATE_TEXT.golden.text,
      side: 'inside',
    };
  }
  if (status === 'ATTENTION') {
    return {
      state: 'red',
      textKey: GOLDEN_RANGE_STATE_TEXT.red.textKey,
      text: GOLDEN_RANGE_STATE_TEXT.red.text,
      side: null,
    };
  }
  return {
    state: 'neutral',
    textKey: GOLDEN_RANGE_STATE_TEXT.neutral.textKey,
    text: GOLDEN_RANGE_STATE_TEXT.neutral.text,
    side: null,
  };
};

export function buildProfessionalMonitorModules(
  result: RecipeResult,
  servingTemperatureC: number,
  input: RecipeInput,
  freezingStabilityStatus: FreezingStabilityStatus = 'UNAVAILABLE',
): ProfessionalMonitorModule[] {
  const stabilizers = assessStabilizerDosage(input);
  const stabilizer = stabilizers[0] ?? null;
  const iceTip = iceTooltip(input.category);

  const definitions: Omit<ProfessionalMonitorModule, 'problem'>[] = [
    {
      id: 'freezing',
      title: 'Zamrożenie',
      primary: [
        classified(result, 'ice_fraction', 'Frakcja lodu', iceTip, 'ice_fraction'),
        metric('pac', 'PAC', result.pac_points, '', TOOLTIP.pac, null, 'pac'),
        classified(result, 'npac', 'NPAC', TOOLTIP.npac, 'npac'),
      ],
      secondary: [
        metric(
          'serving-temperature',
          'Temperatura serwowania',
          servingTemperatureC,
          '°C',
          TOOLTIP.serving,
        ),
      ],
    },
    {
      id: 'sugars',
      title: 'Słodycz i cukry',
      primary: [
        classified(result, 'pod', 'POD', TOOLTIP.pod, 'pod'),
        metric(
          'total-sugars',
          'Cukry ogółem',
          result.nutrition_per_100g?.sugars_g ?? null,
          'g/100 g',
          TOOLTIP.sugars,
        ),
      ],
      secondary: [
        metric('sucrose', 'Sacharoza', result.sugar.sucrose_g, 'g', TOOLTIP.sugarType),
        metric('dextrose', 'Dekstroza', result.sugar.dextrose_g, 'g', TOOLTIP.sugarType),
        metric('glucose', 'Glukoza', result.sugar.glucose_g, 'g', TOOLTIP.sugarType),
        metric('fructose', 'Fruktoza', result.sugar.fructose_g, 'g', TOOLTIP.sugarType),
      ],
    },
    {
      id: 'water-solids',
      title: 'Woda i ciała stałe',
      primary: [
        classified(result, 'water', 'Woda', TOOLTIP.water, 'water'),
        classified(result, 'total_solids', 'Ciała stałe', TOOLTIP.solids, 'total_solids'),
      ],
      secondary: [metric('fiber', 'Błonnik', result.totals.fiber_g, 'g', TOOLTIP.fiber)],
    },
    {
      id: 'fat',
      title: 'Tłuszcz i kremowość',
      primary: [classified(result, 'fat', 'Tłuszcz', TOOLTIP.fat, 'fat')],
      secondary: [
        metric('fat-total', 'Tłuszcz w partii', result.totals.fat_g, 'g', TOOLTIP.totalFat),
      ],
    },
    {
      id: 'protein',
      title: 'Białko i struktura',
      primary: [
        classified(
          result,
          'aerating_protein',
          'Białko napowietrzające',
          TOOLTIP.aeratingProtein,
          'aerating_protein',
        ),
        classified(
          result,
          'protein_in_solids',
          'Białko w suchej masie',
          TOOLTIP.proteinInSolids,
          'protein_in_solids',
        ),
      ],
      secondary: [
        metric(
          'protein-total',
          'Białko w partii',
          result.totals.protein_g,
          'g',
          TOOLTIP.totalProtein,
        ),
      ],
    },
    {
      id: 'stability',
      title: 'Stabilność i ryzyka',
      primary: [
        metric(
          'freezing-stability',
          'Stabilność zamrażania',
          null,
          '',
          TOOLTIP.stability,
          freezingStabilityReading(freezingStabilityStatus),
        ),
        classified(
          result,
          'lactose_sandiness_risk',
          'Ryzyko krystalizacji laktozy',
          TOOLTIP.lactoseRisk,
          'lactose_sandiness_risk',
        ),
        metric(
          'stabilizer',
          'Stabilizator',
          stabilizer?.percentOfTotalMix ?? null,
          '%',
          TOOLTIP.stabilizer,
          stabilizer ? stabilizerReading(stabilizer.status) : null,
        ),
      ],
      secondary: [
        classified(result, 'lactose', 'Laktoza', TOOLTIP.lactose, 'lactose'),
        metric(
          'alcohol',
          'Alkohol',
          indicator(result, 'alcohol')?.value ?? null,
          '%',
          TOOLTIP.alcohol,
          readingFor(result, 'alcohol'),
        ),
        metric('salt', 'Sól', result.totals.salt_g, 'g', TOOLTIP.salt),
      ],
    },
  ];

  const freezingStability = definitions
    .find((module) => module.id === 'stability')
    ?.primary.find((row) => row.id === 'freezing-stability');
  if (freezingStability) {
    freezingStability.displayText = FREEZING_STABILITY_COPY[freezingStabilityStatus];
    freezingStability.domainStatus = freezingStabilityStatus;
  }

  return definitions.map((module) => ({
    ...module,
    problem: hasProblem([...module.primary, ...module.secondary]),
  }));
}

export function professionalMonitorRawValues(
  modules: readonly ProfessionalMonitorModule[],
): Record<ProfessionalRawMetricKey, number | null> {
  const values = {} as Record<ProfessionalRawMetricKey, number | null>;
  for (const module of modules) {
    for (const row of [...module.primary, ...module.secondary]) {
      if (row.rawMetric) values[row.rawMetric] = row.value;
    }
  }
  return values;
}
