import { describe, expect, it } from 'vitest';
import {
  BackendNotConfiguredError,
  chooseRepositoryMode,
  selectProCoreRepository,
} from './repositorySelector';

describe('chooseRepositoryMode — honest, no silent in-memory in production', () => {
  it('prefers the backend when configured + available', () => {
    expect(chooseRepositoryMode({ backendConfigured: true, isDev: false, hasBackendFactory: true, hasInMemoryFactory: true })).toBe('supabase');
    expect(chooseRepositoryMode({ backendConfigured: true, isDev: true, hasBackendFactory: true, hasInMemoryFactory: true })).toBe('supabase');
  });
  it('uses in-memory ONLY in DEV and ONLY when no backend is available', () => {
    expect(chooseRepositoryMode({ backendConfigured: false, isDev: true, hasBackendFactory: false, hasInMemoryFactory: true })).toBe('in_memory_dev');
    // backend configured but no backend factory wired yet → NOT in-memory unless DEV
    expect(chooseRepositoryMode({ backendConfigured: true, isDev: true, hasBackendFactory: false, hasInMemoryFactory: true })).toBe('in_memory_dev');
  });
  it('never falls back to in-memory in a production build', () => {
    expect(chooseRepositoryMode({ backendConfigured: false, isDev: false, hasBackendFactory: false, hasInMemoryFactory: true })).toBe('not_configured');
    expect(chooseRepositoryMode({ backendConfigured: true, isDev: false, hasBackendFactory: false, hasInMemoryFactory: true })).toBe('not_configured');
    expect(chooseRepositoryMode({ backendConfigured: false, isDev: true, hasBackendFactory: false, hasInMemoryFactory: false })).toBe('not_configured');
  });
});

describe('selectProCoreRepository — runtime wrapper (env-independent behaviour)', () => {
  it('returns a local-dev in-memory repository when only an in-memory factory is given (DEV)', () => {
    // In the DEV test env, absent a backend factory the only usable branch is in-memory.
    const sel = selectProCoreRepository({ inMemoryDev: () => ({ tag: 'mem' }) });
    expect(sel.mode).toBe('in_memory_dev');
    expect(sel.isLocalDev).toBe(true);
    expect(sel.repository).toEqual({ tag: 'mem' });
  });
  it('throws BackendNotConfiguredError when no factory can satisfy any branch', () => {
    // No backend factory + no in-memory factory → never usable, regardless of env config.
    expect(() => selectProCoreRepository({})).toThrow(BackendNotConfiguredError);
  });
});
