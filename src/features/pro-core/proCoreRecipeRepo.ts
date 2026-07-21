/**
 * PINGÜINO PRO CORE — recipe repository resolution for real UI surfaces.
 *
 * Wraps the selector so a page gets an HONEST availability state instead of a thrown error:
 *   • backend configured + wired  → the backend repository (staging/prod);
 *   • DEV, no backend             → a local, non-durable in-memory singleton (isLocalDev=true so
 *                                    the UI can visibly mark "local dev mode" — never a false save);
 *   • otherwise                   → unavailable (BackendNotConfiguredError caught → honest banner).
 *
 * The in-memory singleton persists within a session so saved versions accumulate during DEV
 * acceptance; it is NOT durable (a reload clears it), which the local-mode banner makes explicit.
 */
import {
  BackendNotConfiguredError,
  selectProCoreRepository,
  type RepositoryMode,
} from '@/services/proCore/repositorySelector';
import { InMemoryRecipes } from '@/services/proCore/inMemoryRecipes';
import { inMemoryRecipesRepository, type RecipesRepository } from '@/services/proCore/recipesRepository';
import { supabaseRecipesBackendFactory } from '@/services/proCore/supabaseRecipes';

let devSingleton: RecipesRepository | null = null;

/** DEV-only, session-scoped in-memory repository (non-durable). */
function devRecipesRepository(): RecipesRepository {
  if (!devSingleton) {
    let seq = 0;
    const nextId = () => `rc-${(seq += 1)}-${Math.random().toString(36).slice(2, 8)}`;
    devSingleton = inMemoryRecipesRepository(new InMemoryRecipes(() => new Date().toISOString(), nextId));
  }
  return devSingleton;
}

/** Testing seam — reset the DEV singleton between cases. */
export function __resetDevRecipesRepository(): void {
  devSingleton = null;
}

export interface RecipesRepoState {
  repository: RecipesRepository | null;
  mode: RepositoryMode;
  isLocalDev: boolean;
  /** True when no repository is usable in this build (production without a configured backend). */
  unavailable: boolean;
}

/**
 * Resolve the recipe repository for the current build, converting the honest
 * BackendNotConfiguredError into an `unavailable` state a page can render.
 */
export function resolveRecipesRepository(
  factories: { backend?: () => RecipesRepository } = {},
): RecipesRepoState {
  try {
    const sel = selectProCoreRepository<RecipesRepository>({
      // Default to the configured backend adapter when the client is configured (staging/prod);
      // an explicit factory (tests) still wins. When no backend is configurable the selector uses
      // in-memory in DEV or reports unavailable — never a silent fallback that fakes a save.
      backend: factories.backend ?? supabaseRecipesBackendFactory(),
      inMemoryDev: devRecipesRepository,
    });
    return { repository: sel.repository, mode: sel.mode, isLocalDev: sel.isLocalDev, unavailable: false };
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return { repository: null, mode: 'not_configured', isLocalDev: false, unavailable: true };
    }
    throw error;
  }
}
