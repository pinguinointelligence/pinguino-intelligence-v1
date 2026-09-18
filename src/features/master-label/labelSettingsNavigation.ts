/**
 * Where a label screen was opened from, so its „← Wróć” can name the source and
 * land the reader back in the same place.
 *
 * `origin`, `focusRunId`, `historyShown` and `query` are optional: a return
 * without them keeps the accepted plain „← Wróć” (GEL-P0-033). Values that are
 * not understood are dropped rather than trusted — this state can arrive from
 * any `navigate(…, { state })` and from the browser history.
 */
export type LabelSettingsOrigin = 'recipe' | 'production-history' | 'label-history' | 'current-run';

const LABEL_SETTINGS_ORIGINS: readonly LabelSettingsOrigin[] = [
  'recipe',
  'production-history',
  'label-history',
  'current-run',
];

export interface LabelSettingsReturn {
  readonly to: string;
  readonly scrollTop: number;
  /** Names the source on the back action. Absent → the plain „← Wróć”. */
  readonly origin?: LabelSettingsOrigin;
  /** Production history: the run row to focus again on return. */
  readonly focusRunId?: string;
  /** Production history: how many completed runs were loaded (pages) when the label was opened. */
  readonly historyShown?: number;
  /** Label history: the search the reader had typed. */
  readonly query?: string;
}

export interface LabelSettingsRouteState {
  readonly labelSettingsReturn?: LabelSettingsReturn;
  readonly labelSettingsRestore?: LabelSettingsReturn;
}

export const labelSettingsReturn = (
  pathname: string,
  search = '',
  scrollTop = 0,
  context: Pick<LabelSettingsReturn, 'origin' | 'focusRunId' | 'historyShown' | 'query'> = {},
): LabelSettingsReturn => ({
  to: `${pathname}${search}`,
  scrollTop: Math.max(0, scrollTop),
  ...readReturnContext(context),
});

const isOrigin = (value: unknown): value is LabelSettingsOrigin =>
  typeof value === 'string' && (LABEL_SETTINGS_ORIGINS as readonly string[]).includes(value);

/** Keeps only the optional context fields that are well-formed. */
function readReturnContext(
  candidate: Partial<Record<'origin' | 'focusRunId' | 'historyShown' | 'query', unknown>>,
): Pick<LabelSettingsReturn, 'origin' | 'focusRunId' | 'historyShown' | 'query'> {
  const context: {
    origin?: LabelSettingsOrigin;
    focusRunId?: string;
    historyShown?: number;
    query?: string;
  } = {};
  if (isOrigin(candidate.origin)) context.origin = candidate.origin;
  if (typeof candidate.focusRunId === 'string' && candidate.focusRunId.length > 0) {
    context.focusRunId = candidate.focusRunId;
  }
  if (
    typeof candidate.historyShown === 'number' &&
    Number.isInteger(candidate.historyShown) &&
    candidate.historyShown > 0
  ) {
    context.historyShown = candidate.historyShown;
  }
  if (typeof candidate.query === 'string' && candidate.query.length <= 200) {
    context.query = candidate.query;
  }
  return context;
}

export function readLabelSettingsReturn(value: unknown): LabelSettingsReturn | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as LabelSettingsRouteState).labelSettingsReturn;
  if (
    !candidate ||
    typeof candidate.to !== 'string' ||
    !candidate.to.startsWith('/') ||
    candidate.to.startsWith('//') ||
    typeof candidate.scrollTop !== 'number' ||
    !Number.isFinite(candidate.scrollTop)
  ) {
    return null;
  }
  return {
    to: candidate.to,
    scrollTop: Math.max(0, candidate.scrollTop),
    ...readReturnContext(candidate),
  };
}

export function readLabelSettingsRestore(value: unknown): LabelSettingsReturn | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as LabelSettingsRouteState).labelSettingsRestore;
  if (
    !candidate ||
    typeof candidate.to !== 'string' ||
    typeof candidate.scrollTop !== 'number' ||
    !Number.isFinite(candidate.scrollTop)
  ) {
    return null;
  }
  return {
    to: candidate.to,
    scrollTop: Math.max(0, candidate.scrollTop),
    ...readReturnContext(candidate),
  };
}
