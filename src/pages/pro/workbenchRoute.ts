import type { CockpitTab } from '@/features/pro-workbench/RecipeProfilePanel';

export const cockpitTabFromRoute = (
  section: string | undefined,
  panel: string | null,
): CockpitTab =>
  section === 'monitor'
    ? 'monitor'
    : section === 'production'
      ? 'production'
      : panel === 'summary'
        ? 'summary'
        : 'profile';

export const routeForCockpitTab = (tab: CockpitTab): string =>
  tab === 'monitor'
    ? '/pro/monitor'
    : tab === 'production'
      ? '/pro/production'
      : tab === 'summary'
        ? '/pro/recipe?panel=summary'
        : '/pro/recipe';
