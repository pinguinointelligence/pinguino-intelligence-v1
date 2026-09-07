/**
 * Implementation vocabulary that must never reach ANY customer screen.
 *
 * OWNER QA 2026-09-06, second occurrence. A customer pressed „Dodaj do receptury" in the ingredient
 * picker and was shown:
 *
 *   „Dla produkt 16eba716-4f75-4675-842f-0b2e32c8937a · wersja 16eba716-4f75-4675-842f-0b2e32c8937a
 *    · Mapper brak · moduł BASE_RECIPE brakuje aktualnego ProductBehavior binding. Odśwież dane
 *    produktu i uruchom klasyfikację ponownie."
 *
 * The denylist that would have caught every word of that already existed — in
 * `features/home-creator/homeCustomerNotice.ts` — but it was reachable only through an OPT-IN prop,
 * and only HOME's two mounts opted in. The picker is one component shared by HOME and PRO, so the
 * same sentence was calm on one screen and raw on the other.
 *
 * So the list moves here, to a neutral home, and the picker applies it BY DEFAULT. An opt-in
 * denylist leaks by construction: it protects the screens someone remembered, and the next screen
 * inherits the leak. The rule is also deliberately a denylist of implementation vocabulary rather
 * than an allowlist of known-good sentences, so a NEW pipeline refusal that mentions the Mapper is
 * calm by default instead of leaking until someone notices.
 *
 * This is a PRESENTATION filter and nothing else:
 *   - it never changes a verdict — a refusal stays a refusal, fail-closed stays closed;
 *   - it never invents a reason — an unsafe sentence becomes the calm one, not a guess;
 *   - the technical sentence stays intact for logs, for tests and for the PRO diagnostics panels
 *     that are meant to carry it.
 */

/**
 * Matched case-insensitively against the whole sentence.
 *
 * `authority` and `warstwa` are here because the pipeline uses them structurally („aktualnej
 * authority produktu", „Brakująca warstwa: walidacja serwerowa") — phrasing that reads as an
 * internal report even though the individual words are ordinary.
 */
export const INTERNAL_VOCABULARY: readonly RegExp[] = [
  /productbehavior/i,
  /\bmapper\b/i,
  /snapshot/i,
  /\bbinding\b/i,
  /\bauthority\b/i,
  /\bwarstwa\b/i,
  /walidacja serwerowa/i,
  /fingerprint/i,
  /taxonomy/i,
  /PI-ING-\d+/i,
  /\b[a-z]+(?:_[a-z]+){2,}\b/,
  /\bRPC\b/,
  // A bare identifier is never customer copy. The owner's screen carried the SAME uuid twice —
  // which is the signature of a lookup that found nothing, not of anything the customer can act on.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  // module names as the pipeline spells them (lower-case „topping" is ordinary copy and is safe:
  // these are deliberately case-SENSITIVE)
  /\bTOPPING\b/,
  /\bSEARCH\b/,
  // Any SCREAMING_SNAKE code. SOL-043 named `INGREDIENTS_EVIDENCE_REQUIRED` by example; this covers
  // BASE_RECIPE, PRODUCT_SEMANTICS_UNRESOLVED and every sibling nobody has written yet.
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
  // raw status keys the pipeline emits as camelCase — SOL-043 named `roleReadiness` and
  // `recognition` by example
  /\b(?:roleReadiness|engineUsable|classificationOutcome|blockReasons|missingCritical\w*|verificationStatus|productKind|entityKind|lifecycleStatus|recognition)\b/,
];

/** Does this sentence expose how the system is built? */
export function exposesInternals(text: string): boolean {
  return INTERNAL_VOCABULARY.some((pattern) => pattern.test(text));
}

/**
 * The sentence a customer may read. `null` in, `null` out — silence is preserved, because a screen
 * with no refusal must not gain one. An unsafe sentence is replaced by `fallback`, never dropped:
 * the customer must still learn that something did not work.
 */
export function customerSafeNotice(
  text: string | null | undefined,
  fallback: string,
): string | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return exposesInternals(trimmed) ? fallback : trimmed;
}
