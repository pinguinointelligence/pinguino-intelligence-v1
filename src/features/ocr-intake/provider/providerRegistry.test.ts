/**
 * Provider-registry tests — explicit-id selection only, loud failures, no fallbacks.
 */
import { describe, expect, it } from 'vitest';
import type { OcrProvider } from '../intakeContracts';
import { createOcrProviderRegistry } from './providerRegistry';

const stub = (providerId: string): OcrProvider => ({
  providerId,
  recognize: () => Promise.resolve({ ok: false, failure: { kind: 'unreadable_image' } }),
});

describe('createOcrProviderRegistry', () => {
  it('returns the provider registered under the exact id', () => {
    const tesseract = stub('tesseract');
    const fixture = stub('fixture');
    const registry = createOcrProviderRegistry([tesseract, fixture]);
    expect(registry.get('tesseract')).toBe(tesseract);
    expect(registry.get('fixture')).toBe(fixture);
    expect(registry.providerIds).toEqual(['tesseract', 'fixture']);
  });

  it('throws loudly on unknown ids — never guesses a provider', () => {
    const registry = createOcrProviderRegistry([stub('fixture')]);
    expect(() => registry.get('tesseract')).toThrow(/unknown OCR provider "tesseract"/);
    expect(() => registry.get('tesseract')).toThrow(/fixture/); // the honest hint
  });

  it('rejects duplicate provider ids at construction', () => {
    expect(() => createOcrProviderRegistry([stub('fixture'), stub('fixture')])).toThrow(/duplicate/);
  });

  it('an empty registry still fails honestly', () => {
    const registry = createOcrProviderRegistry([]);
    expect(registry.providerIds).toEqual([]);
    expect(() => registry.get('anything')).toThrow(/\(none\)/);
  });
});
