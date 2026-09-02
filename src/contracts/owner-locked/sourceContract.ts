/**
 * OWNER-LOCKED CONTRACT SUPPORT — source-invariant helpers.
 *
 * Two kinds of contract live in this directory:
 *
 *  1. BEHAVIOURAL — a pure exported function is called and its accepted answer
 *     asserted. Preferred whenever the authority is reachable as a pure export.
 *
 *  2. SOURCE-INVARIANT — the accepted wiring is asserted against the source
 *     text. This exists because the regressions that actually happened were
 *     *deletions of wiring*, not wrong arithmetic: a control removed from a
 *     row, a predicate no longer consulted at a gate, a default no longer
 *     applied. A behavioural test cannot see a control that is gone from JSX
 *     without rendering the whole workbench, which is far too slow for a gate
 *     that must run on every push.
 *
 * Source-invariant assertions deliberately read the PRODUCTION file, never a
 * snapshot or a copy, so they cannot drift away from what ships.
 *
 * These helpers perform no IO beyond reading repository sources and must stay
 * dependency-free so the owner-locked suite starts in milliseconds.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Absolute path of `src/`, resolved from this file's location. */
export const SRC_ROOT = resolve(import.meta.dirname, '..', '..');

/** Reads a production source file, relative to `src/`. */
export function readSource(...parts: string[]): string {
  return readFileSync(join(SRC_ROOT, ...parts), 'utf8');
}

/**
 * Strips line and block comments so a contract can never be satisfied by a
 * mention inside a docstring. Every source-invariant assertion below runs on
 * the stripped text.
 */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Executable source of a production file: comments removed. */
export function readCode(...parts: string[]): string {
  return withoutComments(readSource(...parts));
}

/** Counts non-overlapping occurrences of a literal needle. */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}
