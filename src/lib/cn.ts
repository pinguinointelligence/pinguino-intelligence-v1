/** Minimal class joiner — keeps primitives dependency-free. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
