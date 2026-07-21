/**
 * PINGÜINO PRO CORE — costs repository resolution for real UI surfaces (consumed in S10).
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
import { InMemoryCosts } from '@/services/proCore/inMemoryCosts';
import { inMemoryCostsRepository, type CostsRepository } from '@/services/proCore/costsRepository';
import { supabaseCostsBackendFactory } from '@/services/proCore/supabaseCosts';

let devSingleton: CostsRepository | null = null;

/** DEV-only, session-scoped in-memory repository (non-durable). */
function devCostsRepository(): CostsRepository {
  if (!devSingleton) {
    let seq = 0;
    const nextId = () => `ce-${(seq += 1)}-${Math.random().toString(36).slice(2, 8)}`;
    devSingleton = inMemoryCostsRepository(new InMemoryCosts(() => new Date().toISOString(), nextId));
  }
  return devSingleton;
}

/** Testing seam — reset the DEV singleton between cases. */
export function __resetDevCostsRepository(): void {
  devSingleton = null;
}

export interface CostsRepoState {
  repository: CostsRepository | null;
  mode: RepositoryMode;
  isLocalDev: boolean;
  /** True when no repository is usable in this build (production without a configured backend). */
  unavailable: boolean;
}

/** Resolve the costs repository, converting BackendNotConfiguredError into an honest state. */
export function resolveCostsRepository(
  factories: { backend?: () => CostsRepository } = {},
): CostsRepoState {
  try {
    const sel = selectProCoreRepository<CostsRepository>({
      backend: factories.backend ?? supabaseCostsBackendFactory(),
      inMemoryDev: devCostsRepository,
    });
    return { repository: sel.repository, mode: sel.mode, isLocalDev: sel.isLocalDev, unavailable: false };
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return { repository: null, mode: 'not_configured', isLocalDev: false, unavailable: true };
    }
    throw error;
  }
}
