/**
 * PINGÜINO PI Recipe Monitor — pure axis mapping.
 *
 * Maps a recipe's evaluated metrics onto the four customer-facing axes vs the
 * golden range. The golden band is read READ-ONLY through the public `@/engine`
 * `selectTargetBand` — no target number is re-hardcoded, and `src/engine/**` is
 * never modified. Direction semantics are grounded in the engine's own
 * `DIRECTIONAL_STATUS` table (pod → sweet, ice_fraction → soft/hard, fat,
 * total_solids); we surface them in honest customer Polish, never invent a new
 * rule. Deterministic and pure: no React, no IO, no mutation.
 */
import { selectTargetBand, type ProductCategory, type TargetMetric } from '@/engine';
import {
  PI_AXIS_ORDER,
  type AxisBandPosition,
  type AxisIntentStep,
  type PiAxisId,
  type PiAxisMetricValues,
  type PiAxisReading,
  type PiGramVisibility,
} from './piMonitorContracts';

interface AxisDefinition {
  id: PiAxisId;
  label: string;
  /** The engine metric whose golden band this axis is judged against. */
  targetMetric: TargetMetric;
  /** Read this axis's value from the metrics subset. */
  readValue: (m: PiAxisMetricValues) => number | undefined;
  /** Honest Polish direction copy, keyed by band position. */
  copy: Record<AxisBandPosition, string>;
  /** Copy when the product defines no band for this axis (e.g. sorbet fat). */
  notApplicableCopy: string;
  /** Copy when the value is missing / not evaluable. */
  unknownCopy: string;
  /** Axis-specific stepped-choice labels (never a numeric slider). */
  stepLabels: Record<AxisIntentStep, string>;
}

/** The four axes, in stable display order. */
const AXIS_DEFINITIONS: Readonly<Record<PiAxisId, AxisDefinition>> = {
  slodycz: {
    id: 'slodycz',
    label: 'Słodycz',
    targetMetric: 'pod',
    readValue: (m) => m.pod,
    copy: {
      ponizej_zakresu: 'mniej słodkie niż zakres',
      w_zakresie: 'słodycz w zakresie',
      powyzej_zakresu: 'słodsze niż zakres',
    },
    notApplicableCopy: 'nie dotyczy tego produktu',
    unknownCopy: 'brak danych do oceny',
    stepLabels: { decrease: 'Mniej słodkie', keep: 'Bez zmian', increase: 'Słodsze' },
  },
  miekkosc_twardosc: {
    id: 'miekkosc_twardosc',
    label: 'Miękkość–twardość',
    targetMetric: 'ice_fraction',
    readValue: (m) => m.iceFraction,
    copy: {
      // low ice fraction = softer (engine: too_soft); high = harder (engine: too_hard)
      ponizej_zakresu: 'bardziej miękkie niż zakres',
      w_zakresie: 'twardość w zakresie',
      powyzej_zakresu: 'twardsze niż zakres',
    },
    notApplicableCopy: 'nie dotyczy tego produktu',
    unknownCopy: 'brak danych do oceny',
    stepLabels: { decrease: 'Bardziej miękkie', keep: 'Bez zmian', increase: 'Twardsze' },
  },
  kremowosc_tluszcz: {
    id: 'kremowosc_tluszcz',
    label: 'Kremowość–tłuszcz',
    targetMetric: 'fat',
    readValue: (m) => m.fat,
    copy: {
      ponizej_zakresu: 'mniej tłuszczu niż zakres',
      w_zakresie: 'kremowość w zakresie',
      powyzej_zakresu: 'więcej tłuszczu niż zakres',
    },
    notApplicableCopy: 'nie dotyczy tego produktu',
    unknownCopy: 'brak danych do oceny',
    stepLabels: { decrease: 'Mniej tłuszczu', keep: 'Bez zmian', increase: 'Bardziej kremowe' },
  },
  pelnia_body: {
    id: 'pelnia_body',
    label: 'Pełnia–body',
    targetMetric: 'total_solids',
    readValue: (m) => m.solids,
    copy: {
      ponizej_zakresu: 'lżejsze niż zakres',
      w_zakresie: 'pełnia w zakresie',
      powyzej_zakresu: 'cięższe niż zakres',
    },
    notApplicableCopy: 'nie dotyczy tego produktu',
    unknownCopy: 'brak danych do oceny',
    stepLabels: { decrease: 'Lżejsze', keep: 'Bez zmian', increase: 'Pełniejsze' },
  },
};

/** The stepped-choice labels for one axis (for the presentational UI). */
export function axisStepLabels(id: PiAxisId): Record<AxisIntentStep, string> {
  return AXIS_DEFINITIONS[id].stepLabels;
}

/** The customer-facing label for one axis. */
export function axisLabel(id: PiAxisId): string {
  return AXIS_DEFINITIONS[id].label;
}

/** Classify one value against a golden band into a band position. */
function positionOf(value: number, band: readonly [number, number]): AxisBandPosition {
  if (value < band[0]) return 'ponizej_zakresu';
  if (value > band[1]) return 'powyzej_zakresu';
  return 'w_zakresie';
}

export interface MapAxesInput {
  metrics: PiAxisMetricValues;
  category: ProductCategory;
  servingTemperatureC: number;
  /** Numeric value/band are exposed ONLY when this grants exact grams. */
  capability: PiGramVisibility;
}

/**
 * Map a recipe's metrics onto the four customer axes vs the golden range. Numeric
 * detail is redacted AT SOURCE for a persona without exact-grams (the number never
 * enters the returned object). Pure: reads `selectTargetBand` (config, read-only)
 * and mutates nothing; an undefined band for a product (e.g. sorbet fat) is an
 * honest not-applicable, never a faked band.
 */
export function mapRecipeToAxes(input: MapAxesInput): PiAxisReading[] {
  const { metrics, category, servingTemperatureC, capability } = input;
  const canShowNumbers = capability.canViewExactGrams === true;
  const selection = selectTargetBand(category, servingTemperatureC);

  return PI_AXIS_ORDER.map((id): PiAxisReading => {
    const def = AXIS_DEFINITIONS[id];
    const range = selection?.band.metrics[def.targetMetric];
    const rawValue = def.readValue(metrics);

    // No band configured for this product/axis → honest not-applicable.
    if (!range) {
      return { id, label: def.label, applicable: false, position: null, directionCopy: def.notApplicableCopy };
    }

    // Band exists but the value is missing / non-finite → not evaluable.
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      const reading: PiAxisReading = { id, label: def.label, applicable: true, position: null, directionCopy: def.unknownCopy };
      if (canShowNumbers) reading.band = [range.min, range.max];
      return reading;
    }

    const position = positionOf(rawValue, [range.min, range.max]);
    const reading: PiAxisReading = {
      id,
      label: def.label,
      applicable: true,
      position,
      directionCopy: def.copy[position],
    };
    // Redaction at source: numbers exist in the payload ONLY for exact-grams personas.
    if (canShowNumbers) {
      reading.value = rawValue;
      reading.band = [range.min, range.max];
    }
    return reading;
  });
}
