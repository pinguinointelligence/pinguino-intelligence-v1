import { describe, expect, it } from 'vitest';
import {
  INFOPAK_INTENT_TTL_MS,
  peekInfopakIntent,
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

const BELGIUM_DUTCH = { countryIso2: 'BE', language: 'nl' };

describe('the "Zamów za 0 €" intent survives sign-in exactly once', () => {
  it('remembers which market and language was clicked, and is taken once', () => {
    const storage = memoryStorage();
    rememberInfopakIntent(BELGIUM_DUTCH, 1_000, storage);
    expect(peekInfopakIntent(2_000, storage)).toEqual(BELGIUM_DUTCH);
    expect(takeInfopakIntent(2_000, storage)).toEqual(BELGIUM_DUTCH);
    expect(takeInfopakIntent(3_000, storage)).toBeNull();
    expect(peekInfopakIntent(3_000, storage)).toBeNull();
  });

  it('keeps script subtags such as zh-Hant', () => {
    const storage = memoryStorage();
    rememberInfopakIntent({ countryIso2: 'TW', language: 'zh-Hant' }, 0, storage);
    expect(takeInfopakIntent(1, storage)).toEqual({ countryIso2: 'TW', language: 'zh-Hant' });
  });

  it('expires, and an expired intent is cleared rather than acted on', () => {
    const storage = memoryStorage();
    rememberInfopakIntent(BELGIUM_DUTCH, 0, storage);
    expect(takeInfopakIntent(INFOPAK_INTENT_TTL_MS + 1, storage)).toBeNull();
    expect(storage.getItem('gellatti.shop.infopakIntent')).toBeNull();
  });

  it('drops an intent without a market (older build) or garbage, and tolerates missing storage', () => {
    const storage = memoryStorage();
    storage.setItem('gellatti.shop.infopakIntent', '1000');
    expect(takeInfopakIntent(2_000, storage)).toBeNull();
    storage.setItem(
      'gellatti.shop.infopakIntent',
      JSON.stringify({ at: 1_000, countryIso2: 'be', language: 'NL' }),
    );
    expect(takeInfopakIntent(2_000, storage)).toBeNull();
    storage.setItem('gellatti.shop.infopakIntent', 'not-json');
    expect(takeInfopakIntent(2_000, storage)).toBeNull();
    expect(takeInfopakIntent(1, null)).toBeNull();
    expect(() => rememberInfopakIntent(BELGIUM_DUTCH, 1, null)).not.toThrow();
  });
});
