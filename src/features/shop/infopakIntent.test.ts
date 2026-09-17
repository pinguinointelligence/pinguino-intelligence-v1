import { describe, expect, it } from 'vitest';
import {
  INFOPAK_INTENT_TTL_MS,
  hasInfopakIntent,
  rememberInfopakIntent,
  takeInfopakIntent,
} from './infopakIntent';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

describe('the "Zamów za 0 €" intent survives sign-in exactly once', () => {
  it('is taken once and never repeats', () => {
    const storage = memoryStorage();
    rememberInfopakIntent(1_000, storage);
    expect(hasInfopakIntent(2_000, storage)).toBe(true);
    expect(takeInfopakIntent(2_000, storage)).toBe(true);
    expect(takeInfopakIntent(3_000, storage)).toBe(false);
    expect(hasInfopakIntent(3_000, storage)).toBe(false);
  });

  it('expires, and an expired intent is cleared rather than acted on', () => {
    const storage = memoryStorage();
    rememberInfopakIntent(0, storage);
    expect(takeInfopakIntent(INFOPAK_INTENT_TTL_MS + 1, storage)).toBe(false);
    expect(storage.getItem('gellatti.shop.infopakIntent')).toBeNull();
  });

  it('ignores garbage and missing storage', () => {
    const storage = memoryStorage();
    storage.setItem('gellatti.shop.infopakIntent', 'not-a-time');
    expect(takeInfopakIntent(1, storage)).toBe(false);
    expect(takeInfopakIntent(1, null)).toBe(false);
    expect(() => rememberInfopakIntent(1, null)).not.toThrow();
  });
});
