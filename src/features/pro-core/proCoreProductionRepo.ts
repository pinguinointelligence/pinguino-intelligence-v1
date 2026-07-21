/**
 * PINGÜINO PRO CORE — production repository resolution for real UI surfaces (consumed in S9).
 *
 * Mirror of proCoreRecipeRepo.ts: the configured backend adapter by default (staging/prod), a
 * DEV-only in-memory singleton for local acceptance, otherwise an honest `unavailable` state —
 * NEVER a silent in-memory fallback in a production build, and never a false "saved".
 */
import {
  BackendNotConfiguredError,
  selectProCoreRepository,
  type RepositoryMode,
} from '@/services/proCore/repositorySelector';
import { InMemoryProduction } from '@/services/proCore/inMemoryProduction';
import {
  inMemoryProductionRepository,
  type ProductionRepository,
} from '@/services/proCore/productionRepository';
import { supabaseProductionBackendFactory } from '@/services/proCore/supabaseProduction';

let devSingleton: ProductionRepository | null = null;

/** DEV-only, session-scoped in-memory repository (non-durable). */
function devProductionRepository(): ProductionRepository {
  if (!devSingleton) {
    let seq = 0;
    const nextId = () => `pr-${(seq += 1)}-${Math.random().toString(36).slice(2, 8)}`;
    devSingleton = inMemoryProductionRepository(
      new InMemoryProduction(() => new Date().toISOString(), nextId),
    );
  }
  return devSingleton;
}

/** Testing seam — reset the DEV singleton between cases. */
export function __resetDevProductionRepository(): void {
  devSingleton = null;
}

export interface ProductionRepoState {
  repository: ProductionRepository | null;
  mode: RepositoryMode;
  isLocalDev: boolean;
  /** True when no repository is usable in this build (production without a configured backend). */
  unavailable: boolean;
}

/** Resolve the production repository, converting BackendNotConfiguredError into an honest state. */
export function resolveProductionRepository(
  factories: { backend?: () => ProductionRepository } = {},
): ProductionRepoState {
  try {
    const sel = selectProCoreRepository<ProductionRepository>({
      backend: factories.backend ?? supabaseProductionBackendFactory(),
      inMemoryDev: devProductionRepository,
    });
    return { repository: sel.repository, mode: sel.mode, isLocalDev: sel.isLocalDev, unavailable: false };
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return { repository: null, mode: 'not_configured', isLocalDev: false, unavailable: true };
    }
    throw error;
  }
}
