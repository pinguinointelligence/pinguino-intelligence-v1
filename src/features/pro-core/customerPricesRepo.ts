import {
  BackendNotConfiguredError,
  selectProCoreRepository,
  type RepositoryMode,
} from '@/services/proCore/repositorySelector';
import {
  InMemoryCustomerPricesRepository,
  type CustomerPricesRepository,
} from '@/services/proCore/customerPricesRepository';
import { supabaseCustomerPricesBackendFactory } from '@/services/proCore/supabaseCustomerPrices';

let devSingleton: CustomerPricesRepository | null = null;

const devRepository = (): CustomerPricesRepository => {
  if (!devSingleton) devSingleton = new InMemoryCustomerPricesRepository();
  return devSingleton;
};

export function __resetDevCustomerPricesRepository(): void {
  devSingleton = null;
}

export interface CustomerPricesRepoState {
  repository: CustomerPricesRepository | null;
  mode: RepositoryMode;
  isLocalDev: boolean;
  unavailable: boolean;
}

export function resolveCustomerPricesRepository(
  factories: { backend?: () => CustomerPricesRepository } = {},
): CustomerPricesRepoState {
  try {
    const selected = selectProCoreRepository<CustomerPricesRepository>({
      backend: factories.backend ?? supabaseCustomerPricesBackendFactory(),
      inMemoryDev: devRepository,
    });
    return {
      repository: selected.repository,
      mode: selected.mode,
      isLocalDev: selected.isLocalDev,
      unavailable: false,
    };
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return {
        repository: null,
        mode: 'not_configured',
        isLocalDev: false,
        unavailable: true,
      };
    }
    throw error;
  }
}
