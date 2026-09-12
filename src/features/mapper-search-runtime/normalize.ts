import type { SourceSpan } from './types.ts';

const safeLocale = (locale: string): string | undefined => {
  const candidate = locale === '*' ? undefined : locale;
  try {
    return candidate && Intl.getCanonicalLocales(candidate)[0];
  } catch {
    return undefined;
  }
};

const normalizePiece = (value: string, locale: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase(safeLocale(locale))
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"');

export interface NormalizedWithSpans {
  text: string;
  originalStart: number[];
  originalEnd: number[];
  originalSpan(start: number, end: number): SourceSpan;
}

/** NFKC/case/punctuation normalization with a reverse map to original spans. */
export function normalizeWithSpans(input: string, locale: string): NormalizedWithSpans {
  let text = '';
  const originalStart: number[] = [];
  const originalEnd: number[] = [];
  let previousWasSpace = false;
  for (let offset = 0; offset < input.length; ) {
    const point = input.codePointAt(offset)!;
    const source = String.fromCodePoint(point);
    const next = offset + source.length;
    const normalized = normalizePiece(source, locale);
    for (const character of normalized) {
      const isSpace = /\s/u.test(character);
      if (isSpace && previousWasSpace) continue;
      text += isSpace ? ' ' : character;
      originalStart.push(offset);
      originalEnd.push(next);
      previousWasSpace = isSpace;
    }
    offset = next;
  }
  return {
    text,
    originalStart,
    originalEnd,
    originalSpan(start, end) {
      if (start >= end || originalStart.length === 0) return { start: 0, end: 0 };
      return {
        start: originalStart[Math.min(start, originalStart.length - 1)] ?? 0,
        end: originalEnd[Math.min(end - 1, originalEnd.length - 1)] ?? input.length,
      };
    },
  };
}

export function normalizeMapperSearchText(input: string, locale = 'en'): string {
  return normalizeWithSpans(input, locale).text.trim();
}

export function accentless(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
}

export function isTokenStartBoundary(text: string, index: number): boolean {
  return index <= 0 || !/[\p{L}\p{N}_]/u.test(text[index - 1] ?? '');
}

export function isTokenEndBoundary(text: string, index: number): boolean {
  return index >= text.length || !/[\p{L}\p{N}_]/u.test(text[index] ?? '');
}
