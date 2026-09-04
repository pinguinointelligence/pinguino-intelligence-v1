import type { CatalogMarketPreferences } from './contracts';

export function selectPrimaryProductMarket(
  current: CatalogMarketPreferences,
  primaryMarket: string,
): CatalogMarketPreferences {
  const enabled = [current.primaryMarket, ...current.additionalMarkets].filter(
    (market): market is string => Boolean(market),
  );
  if (!enabled.includes(primaryMarket)) return current;
  return {
    ...current,
    primaryMarket,
    additionalMarkets: enabled.filter((market) => market !== primaryMarket),
  };
}
