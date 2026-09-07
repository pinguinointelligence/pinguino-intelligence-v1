/**
 * WHAT AN EAN LOOKUP ACTUALLY PRODUCED — pure, no SDK, no Deno, no React.
 *
 * OWNER DEFECT 2026-09-07, session b414f3e6-efde-447d-9545-6f75c36db9eb, EAN 8480000804693,
 * 18:51:13 UTC. The session stayed `collecting` with `overlay_state` SCAN_DRAFT, zero external
 * sources, no identity, no accuracy; the phone showed „Nie udało się sprawdzić produktu. Spróbuj
 * ponownie." and a retry button.
 *
 * What the ledgers say happened:
 *   18:51:14  reserve_product_scan_ean_lookup_v1 moved the session's web_calls 0 -> 1
 *   18:51:22  intimport-enrich answered after 8152 ms having spent THREE real web calls
 *             (intimport_enrichment_usage 1e1a2e21, model gpt-5.6-luna) and returned
 *             `facts: []` with all twenty requested fields in `notFound`
 *
 * So the lookup did not crash. It ran, it cost money, and the honest answer was that this code is
 * in no public source. Because `scanResultFromLookupFacts` returns null once no external source
 * survives, `complete_product_scan_ean_lookup_v1` was never called, and three separate things
 * went wrong at once:
 *
 *   1. the session never left `collecting`, so the very next step of the flow — a finalize on a
 *      session that can only be finalized from `analyzed` — answered 409
 *      `scan_not_ready_for_creation`. That body carries no `kind`, so the discovery adapter
 *      rethrows it, and the throw becomes the generic sentence the owner saw. The customer was
 *      told nothing true: the lookup had a specific, knowable outcome;
 *   2. the three billed web calls were never booked against the session (estimated_cost_usd
 *      stayed 0.000000 and product_scan_usage_ledger has no row at all for it);
 *   3. web_calls stayed at 1, and the reservation refuses at `web_calls >= 1`. The retry button
 *      reuses the same session id (the adapter caches sessions per GTIN for the life of the
 *      mount), so the one action the UI offered was the one action that could never work.
 *
 * The owner's requirement is „kontrolowany wynik albo konkretny, zdiagnozowany błąd z działającym
 * retry". Those are two different outcomes and the money is what separates them:
 *
 *   • the provider ANSWERED "nothing" — a controlled result. Real web calls were spent and a
 *     retry would spend three more to receive the same answer, so the allowance is NOT given
 *     back and the customer is not offered a retry that cannot help. They are told the truth and
 *     the flow continues to the label, which is the step that can actually resolve this product.
 *   • the provider NEVER ANSWERED — a diagnosed error. Nothing was billed, so the allowance must
 *     be given back, or the retry is theatre.
 */

export type EanLookupOutcome = 'resolved' | 'resolved_nothing' | 'provider_unavailable';

export interface EanLookupVerdict {
  outcome: EanLookupOutcome;
  /**
   * Give the one-per-session lookup allowance back. Only ever true when nothing was billed;
   * `release_product_scan_ean_lookup_v1` independently refuses if any record says otherwise.
   */
  releaseReservation: boolean;
  /** May the customer usefully press "try again" on THIS session? */
  retryable: boolean;
  /**
   * What the customer reads. Plain Polish: no code, no field name, no SCREAMING_SNAKE, so it
   * survives the `customerSafeNotice` gate instead of being swapped for the calm fallback.
   * `null` when the lookup worked and there is nothing to explain.
   */
  noticePl: string | null;
}

/** The code is real, the sources are exhausted, and the label is the way forward. */
export const LOOKUP_RESOLVED_NOTHING_PL =
  'Sprawdziliśmy ten kod w publicznych źródłach i nie ma tam jeszcze tego produktu. ' +
  'Zrób zdjęcie etykiety — składu i tabeli wartości odżywczych — a dodamy go na tej podstawie.';

/** The source could not be reached at all. Nothing was spent, so trying again is worth something. */
export const LOOKUP_PROVIDER_UNAVAILABLE_PL =
  'Nie udało się teraz połączyć ze źródłem danych o produktach. Spróbuj ponownie za chwilę ' +
  'albo od razu zrób zdjęcie etykiety.';

/** The one lookup this session is allowed has already run. Not a failure, and not retryable. */
export const LOOKUP_ALREADY_ASKED_PL =
  'Zewnętrzne źródła sprawdziliśmy już przy tym skanowaniu. ' +
  'Zrób zdjęcie etykiety, żeby dodać ten produkt.';

/**
 * What a refused reservation is allowed to say. The reason is an internal token — the flow used
 * to render it as „research skipped: session_lookup_already_used", which the customer-copy gate
 * then had to replace with a generic sentence. Only the one reason a customer can act on gets
 * copy; the rest stay silent rather than invent an explanation.
 */
export function lookupSkippedNoticePl(reason: string | null | undefined): string | null {
  return reason === 'session_lookup_already_used' ? LOOKUP_ALREADY_ASKED_PL : null;
}

export function eanLookupVerdict(input: {
  /** Did the provider return a usable response at all (as opposed to a transport/HTTP failure)? */
  providerAnswered: boolean;
  /** Did anything survive `scanResultFromLookupFacts` — i.e. at least one external source? */
  resultSurvived: boolean;
  /** What the provider says it actually did. A cache hit is 0 and costs nothing. */
  providerWebCalls: number;
}): EanLookupVerdict {
  if (!input.providerAnswered) {
    return {
      outcome: 'provider_unavailable',
      // Belt and braces: a provider that failed cannot have reported calls, but if it somehow
      // did, the money wins and the allowance stays spent.
      releaseReservation: input.providerWebCalls <= 0,
      retryable: true,
      noticePl: LOOKUP_PROVIDER_UNAVAILABLE_PL,
    };
  }
  if (input.resultSurvived) {
    return {
      outcome: 'resolved',
      releaseReservation: false,
      retryable: false,
      noticePl: null,
    };
  }
  return {
    outcome: 'resolved_nothing',
    releaseReservation: false,
    // The same question to the same sources returns the same nothing. Offering a retry here is
    // what left the owner tapping a button that could not succeed.
    retryable: false,
    noticePl: LOOKUP_RESOLVED_NOTHING_PL,
  };
}
