import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKEND_NOT_CONFIGURED,
  BackendNotConfiguredReadError,
  chooseUnconfiguredReadBehavior,
  emptyUnconfiguredRead,
  __resetUnconfiguredReadWarnings,
} from './backendGuard';

describe('backendGuard — pure policy', () => {
  it('a production build must throw, a dev build resolves an explicit empty', () => {
    expect(chooseUnconfiguredReadBehavior(true)).toBe('throw_production');
    expect(chooseUnconfiguredReadBehavior(false)).toBe('empty_dev');
  });
});

describe('backendGuard — emptyUnconfiguredRead', () => {
  beforeEach(() => {
    __resetUnconfiguredReadWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DEV: returns the honest empty value and logs the surface (never silent)', () => {
    expect(emptyUnconfiguredRead('m.list', [], false)).toEqual([]);
    expect(emptyUnconfiguredRead('m.get', null, false)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain('m.list');
    expect(vi.mocked(console.warn).mock.calls[1][0]).toContain('m.get');
  });

  it('DEV: warns once per surface, not once per call', () => {
    emptyUnconfiguredRead('m.list', [], false);
    emptyUnconfiguredRead('m.list', [], false);
    emptyUnconfiguredRead('m.list', [], false);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('PRODUCTION: throws a typed, attributable error instead of faking an empty read', () => {
    expect(() => emptyUnconfiguredRead('products.listMyProducts', [], true)).toThrow(
      BackendNotConfiguredReadError,
    );
    try {
      emptyUnconfiguredRead('products.listMyProducts', [], true);
    } catch (error) {
      const e = error as BackendNotConfiguredReadError;
      expect(e.code).toBe(BACKEND_NOT_CONFIGURED);
      expect(e.name).toBe('BackendNotConfiguredReadError');
      expect(e.message).toContain('products.listMyProducts');
    }
    // Logged too, so a caller that swallows the error still leaves console evidence.
    expect(console.error).toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('products.listMyProducts');
  });

  it('PRODUCTION: never returns the empty value', () => {
    let leaked: unknown = 'sentinel';
    try {
      leaked = emptyUnconfiguredRead('m.list', [], true);
    } catch {
      // expected
    }
    expect(leaked).toBe('sentinel');
  });
});
