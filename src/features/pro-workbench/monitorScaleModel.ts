import { TARGET_BANDS, classifyValue, type TargetMetric, type TargetRange } from '@/engine';

export type MonitorScaleStatus = 'in_range' | 'below' | 'below_safe' | 'above' | 'unknown';

export type MonitorScaleMetricId = Extract<
  TargetMetric,
  'pod' | 'npac' | 'ice_fraction' | 'water' | 'fat' | 'aerating_protein' | 'lactose_sandiness_risk'
>;

export type MonitorScaleModel = {
  metricId: string;
  currentValue: number | null;
  displayDomainMin: number;
  displayDomainMax: number;
  acceptedMin: number;
  acceptedMax: number;
  status: MonitorScaleStatus;
};

const isScaleMetric = (metricId: string): metricId is MonitorScaleMetricId =>
  [
    'pod',
    'npac',
    'ice_fraction',
    'water',
    'fat',
    'aerating_protein',
    'lactose_sandiness_risk',
  ].includes(metricId);

/**
 * Derive the visual ruler exclusively from locked Engine calibration data and the
 * real value being plotted. No screenshot number or presentation-only threshold is
 * introduced here. Directional risk semantics remain an Engine concern; this domain
 * only provides geometry for the accepted band and the real plotted value.
 */
export function monitorDisplayDomainFromEngine(
  metricId: string,
  currentValue: number,
): Readonly<{ min: number; max: number }> | null {
  if (!isScaleMetric(metricId)) return null;
  const values = TARGET_BANDS.flatMap((band) => {
    const range = band.metrics[metricId];
    return range ? [range.min, range.max] : [];
  });
  values.push(currentValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

export function buildMonitorScaleModel(
  metricId: string,
  currentValue: number | null | undefined,
  acceptedRange: TargetRange | null | undefined,
): MonitorScaleModel | null {
  if (
    !isScaleMetric(metricId) ||
    currentValue === null ||
    currentValue === undefined ||
    !Number.isFinite(currentValue) ||
    !acceptedRange ||
    !Number.isFinite(acceptedRange.min) ||
    !Number.isFinite(acceptedRange.max) ||
    acceptedRange.max <= acceptedRange.min
  ) {
    return null;
  }

  const domain = monitorDisplayDomainFromEngine(metricId, currentValue);
  if (!domain) return null;
  const engineStatus = classifyValue(currentValue, acceptedRange, metricId);
  const belowIsSafe = currentValue < acceptedRange.min && engineStatus === 'good';
  return {
    metricId,
    currentValue,
    displayDomainMin: domain.min,
    displayDomainMax: domain.max,
    acceptedMin: acceptedRange.min,
    acceptedMax: acceptedRange.max,
    status:
      currentValue < acceptedRange.min
        ? belowIsSafe
          ? 'below_safe'
          : 'below'
        : currentValue > acceptedRange.max
          ? 'above'
          : 'in_range',
  };
}

export type MonitorScaleGeometry = {
  acceptedLeftPercent: number;
  acceptedWidthPercent: number;
  markerPercent: number | null;
  redLeftPercent: number | null;
  redWidthPercent: number;
};

export function monitorScaleGeometry(model: MonitorScaleModel): MonitorScaleGeometry {
  const displaySpan = model.displayDomainMax - model.displayDomainMin;
  if (!(displaySpan > 0)) {
    return {
      acceptedLeftPercent: 0,
      acceptedWidthPercent: 0,
      markerPercent: null,
      redLeftPercent: null,
      redWidthPercent: 0,
    };
  }

  const acceptedLeftPercent = clampPercent(
    ((model.acceptedMin - model.displayDomainMin) / displaySpan) * 100,
  );
  const acceptedRightPercent = clampPercent(
    ((model.acceptedMax - model.displayDomainMin) / displaySpan) * 100,
  );
  const acceptedWidthPercent = Math.max(0, acceptedRightPercent - acceptedLeftPercent);
  const markerPercent =
    model.currentValue === null
      ? null
      : clampPercent(((model.currentValue - model.displayDomainMin) / displaySpan) * 100);

  if (
    markerPercent === null ||
    model.status === 'in_range' ||
    model.status === 'below_safe' ||
    model.status === 'unknown'
  ) {
    return {
      acceptedLeftPercent,
      acceptedWidthPercent,
      markerPercent,
      redLeftPercent: null,
      redWidthPercent: 0,
    };
  }

  if (model.status === 'below') {
    return {
      acceptedLeftPercent,
      acceptedWidthPercent,
      markerPercent,
      redLeftPercent: markerPercent,
      redWidthPercent: Math.max(0, acceptedLeftPercent - markerPercent),
    };
  }

  return {
    acceptedLeftPercent,
    acceptedWidthPercent,
    markerPercent,
    redLeftPercent: acceptedRightPercent,
    redWidthPercent: Math.max(0, markerPercent - acceptedRightPercent),
  };
}

export const monitorScaleStatusText = (status: MonitorScaleStatus): string => {
  switch (status) {
    case 'in_range':
      return 'W zakresie';
    case 'below':
      return 'Poniżej zakresu';
    case 'below_safe':
      return 'Poniżej zakresu — bezpiecznie';
    case 'above':
      return 'Powyżej zakresu';
    default:
      return 'Brak danych';
  }
};
