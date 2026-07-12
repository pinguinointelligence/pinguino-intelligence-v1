/**
 * PINGÜINO PRO CORE — repository selector.
 *
 * Chooses the adapter behind a pro-core repository port HONESTLY:
 *   • a configured backend + a backend (Supabase) factory  → the backend adapter (staging/prod);
 *   • otherwise, ONLY in DEV, an in-memory factory          → a local, non-durable adapter;
 *   • anything else (production without a configured backend, or no factory) → an honest
 *     BackendNotConfiguredError — NEVER a silent in-memory fallback in a production build, and
 *     never a false "saved" when only local state changed.
 *
 * The pure decision (`chooseRepositoryMode`) is separated from the env read so it is fully tested.
 */
import { isSupabaseConfigured } from '@/lib/supabase/client';

export type RepositoryMode = 'supabase' | 'in_memory_dev' | 'not_configured';

export class BackendNotConfiguredError extends Error {
  constructor(
    message = 'PRO CORE persistence is not configured in this build. A signed-in session and a configured backend are required.',
  ) {
    super(message);
    this.name = 'BackendNotConfiguredError';
  }
}

export interface ModeInputs {
  backendConfigured: boolean;
  isDev: boolean;
  hasBackendFactory: boolean;
  hasInMemoryFactory: boolean;
}

/** Pure selection policy. Backend wins when configured+available; in-memory is DEV-only. */
export function chooseRepositoryMode(input: ModeInputs): RepositoryMode {
  if (input.backendConfigured && input.hasBackendFactory) return 'supabase';
  if (input.isDev && input.hasInMemoryFactory) return 'in_memory_dev';
  return 'not_configured';
}

export interface SelectorFactories<T> {
  /** Backend (Supabase) adapter factory — used when the backend is configured. */
  backend?: () => T;
  /** In-memory adapter factory — used ONLY in DEV when no backend is configured. */
  inMemoryDev?: () => T;
}

export interface RepositorySelection<T> {
  repository: T;
  mode: Exclude<RepositoryMode, 'not_configured'>;
  /** True when the repository is a local, non-durable in-memory adapter (DEV acceptance only). */
  isLocalDev: boolean;
}

/**
 * Resolve a concrete repository for the current build. Throws BackendNotConfiguredError instead of
 * ever silently degrading to in-memory in a production build.
 */
export function selectProCoreRepository<T>(factories: SelectorFactories<T>): RepositorySelection<T> {
  const mode = chooseRepositoryMode({
    backendConfigured: isSupabaseConfigured,
    isDev: import.meta.env.DEV,
    hasBackendFactory: Boolean(factories.backend),
    hasInMemoryFactory: Boolean(factories.inMemoryDev),
  });
  if (mode === 'supabase') return { repository: factories.backend!(), mode, isLocalDev: false };
  if (mode === 'in_memory_dev') return { repository: factories.inMemoryDev!(), mode, isLocalDev: true };
  throw new BackendNotConfiguredError();
}
