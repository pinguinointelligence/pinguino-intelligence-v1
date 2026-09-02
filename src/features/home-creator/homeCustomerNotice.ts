/**
 * HOME customer voice — OWNER served QA, 2026-09-02.
 *
 * The engine and the product-authority pipeline are shared with PRO, and their refusals
 * carry the diagnosis a professional needs: „ProductBehavior binding", „Mapper brak",
 * „brak aktualnego snapshotu zachowania", module and version ids. On the PRO dashboard
 * that detail is the point. On a HOME screen it is noise the customer cannot act on, and
 * the owner found it served.
 *
 * This is a PRESENTATION filter and nothing else:
 *
 *   - it never changes a verdict — a refusal stays a refusal, fail-closed stays closed;
 *   - it never invents a reason — an unsafe sentence becomes the calm one, not a guess;
 *   - the technical sentence stays intact for PRO, for logs and for tests, because the
 *     filter is opt-in and only HOME opts in.
 *
 * The rule is deliberately a denylist of implementation vocabulary rather than an
 * allowlist of known-good sentences: a new pipeline refusal that mentions the Mapper is
 * then calm by default, instead of leaking until someone notices.
 */
import { homeCreatorCopy } from './homeCreatorCopy';

/**
 * Implementation vocabulary that must never reach a HOME screen. Matched
 * case-insensitively against the whole sentence.
 *
 * `authority` and `warstwa` are here because the pipeline uses them structurally
 * („aktualnej authority produktu", „Brakująca warstwa: walidacja serwerowa") — phrasing
 * that reads as an internal report even though the individual words are ordinary.
 */
const INTERNAL_VOCABULARY: readonly RegExp[] = [
  /productbehavior/i,
  /\bmapper\b/i,
  /snapshot/i,
  /\bbinding\b/i,
  /\bauthority\b/i,
  /\bwarstwa\b/i,
  /walidacja serwerowa/i,
  /fingerprint/i,
  /taxonomy/i,
  /\bentity\b/i,
  /\bmodu[łl]\b/i,
  /\bwersja\s+[\w-]*\d/i,
  /PI-ING-\d+/i,
  /\b[a-z]+(?:_[a-z]+){2,}\b/,
  /\bRPC\b/,
];

/** Does this sentence expose how the system is built? */
export function exposesInternals(text: string): boolean {
  return INTERNAL_VOCABULARY.some((pattern) => pattern.test(text));
}

/**
 * The sentence HOME may show. `null` in, `null` out — silence is preserved, because a
 * screen with no refusal must not gain one.
 */
export function homeCustomerNotice(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return exposesInternals(trimmed) ? homeCreatorCopy.recipe.unresolvedProduct : trimmed;
}
