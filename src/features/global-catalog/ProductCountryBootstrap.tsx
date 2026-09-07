import { useEffect } from 'react';
import { getCatalogMarketPreferences } from '@/services/globalCatalog';

/**
 * Resolve Product Country once for every anonymous/authenticated app identity.
 * AppProviders remounts its children at the account boundary, so this also owns
 * the deterministic guest-to-account merge without coupling it to a picker
 * surface that Demo users may never open.
 */
export function ProductCountryBootstrap() {
  useEffect(() => {
    void getCatalogMarketPreferences().catch(() => {
      // Country bootstrap is fail-closed convenience state. A transient edge or
      // database failure must not block the recipe workspace or invent a country.
    });
  }, []);

  return null;
}
