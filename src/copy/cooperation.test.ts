import { describe, expect, it } from 'vitest';
import { cooperationCopyEn, cooperationCopyPl, resolveCooperationCopy } from './cooperation';

const keyPaths = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => keyPaths(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      keyPaths(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
};

describe('cooperation copy', () => {
  it('keeps both locales on identical key sets', () => {
    expect(keyPaths(cooperationCopyEn).sort()).toEqual(keyPaths(cooperationCopyPl).sort());
  });

  it('resolves Polish by default and English on request', () => {
    expect(resolveCooperationCopy()).toBe(cooperationCopyPl);
    expect(resolveCooperationCopy('en')).toBe(cooperationCopyEn);
  });

  it('never states a commission percentage or an income promise', () => {
    const text = JSON.stringify([cooperationCopyPl, cooperationCopyEn]);
    expect(text).not.toMatch(/\d+\s?%/);
    expect(text).not.toMatch(/zarobisz|gwarantujemy|guaranteed earnings|you will earn/i);
  });
});
