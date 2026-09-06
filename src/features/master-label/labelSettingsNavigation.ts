export interface LabelSettingsReturn {
  readonly to: string;
  readonly scrollTop: number;
}

export interface LabelSettingsRouteState {
  readonly labelSettingsReturn?: LabelSettingsReturn;
  readonly labelSettingsRestore?: LabelSettingsReturn;
}

export const labelSettingsReturn = (
  pathname: string,
  search = '',
  scrollTop = 0,
): LabelSettingsReturn => ({
  to: `${pathname}${search}`,
  scrollTop: Math.max(0, scrollTop),
});

export function readLabelSettingsReturn(value: unknown): LabelSettingsReturn | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as LabelSettingsRouteState).labelSettingsReturn;
  if (
    !candidate ||
    typeof candidate.to !== 'string' ||
    !candidate.to.startsWith('/') ||
    typeof candidate.scrollTop !== 'number' ||
    !Number.isFinite(candidate.scrollTop)
  ) {
    return null;
  }
  return { to: candidate.to, scrollTop: Math.max(0, candidate.scrollTop) };
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
  return { to: candidate.to, scrollTop: Math.max(0, candidate.scrollTop) };
}
