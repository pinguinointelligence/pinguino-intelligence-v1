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
import { customerSafeNotice, exposesInternals } from '@/copy/customerSafeNotice';
import { homeCreatorCopy } from './homeCreatorCopy';

export { exposesInternals };

/**
 * Implementation vocabulary that must never reach a HOME screen. Matched
 * case-insensitively against the whole sentence.
 *
 * `authority` and `warstwa` are here because the pipeline uses them structurally
 * („aktualnej authority produktu", „Brakująca warstwa: walidacja serwerowa") — phrasing
 * that reads as an internal report even though the individual words are ordinary.
 */
/* The list itself now lives in `@/copy/customerSafeNotice`, so every customer surface
   shares one denylist instead of each screen remembering to opt in. */

export function homeCustomerNotice(text: string | null | undefined): string | null {
  return customerSafeNotice(text, homeCreatorCopy.recipe.unresolvedProduct);
}
