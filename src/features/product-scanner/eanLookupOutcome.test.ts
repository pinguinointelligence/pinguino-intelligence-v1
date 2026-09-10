import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { exposesInternals } from '../../copy/customerSafeNotice';
import {
  LOOKUP_ALREADY_ASKED_PL,
  LOOKUP_PROVIDER_UNAVAILABLE_PL,
  LOOKUP_RESOLVED_NOTHING_PL,
  eanLookupVerdict,
  lookupSkippedNoticePl,
} from './eanLookupOutcome';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/*
  OWNER DEFECT 2026-09-07 — session b414f3e6-efde-447d-9545-6f75c36db9eb, EAN 8480000804693,
  18:51:13 UTC. Observed on staging: state stayed `collecting`, overlay SCAN_DRAFT, zero external
  sources, no identity, no accuracy, and the phone showed „Nie udało się sprawdzić produktu.
  Spróbuj ponownie." with a retry button.

  Established from the ledgers, not guessed:
    product_scan_sessions      web_calls 1, estimated_cost_usd 0.000000, result_json null
    product_scan_usage_ledger  no row for the session at all
    intimport_enrichment_usage 1e1a2e21 at 18:51:22 — web_calls 3, 8152 ms, facts: [],
                               all twenty requested fields in `notFound`

  So the lookup ran, cost three real web calls, and honestly answered "this code is in no public
  source". The requirement is „kontrolowany wynik albo konkretny, zdiagnozowany błąd z działającym
  retry".
*/
describe('what an EAN lookup owes the customer', () => {
  describe('the verdict', () => {
    it('treats "the sources answered nothing" as a RESULT, not a failure', () => {
      const verdict = eanLookupVerdict({
        providerAnswered: true,
        resultSurvived: false,
        providerWebCalls: 3,
      });
      expect(verdict.outcome).toBe('resolved_nothing');
      expect(verdict.noticePl).toBe(LOOKUP_RESOLVED_NOTHING_PL);
    });

    it('does not offer a retry that would buy the same answer again', () => {
      // three more web calls to the same sources return the same nothing; the owner tapped a
      // button that could not succeed
      const verdict = eanLookupVerdict({
        providerAnswered: true,
        resultSurvived: false,
        providerWebCalls: 3,
      });
      expect(verdict.retryable).toBe(false);
      expect(verdict.releaseReservation).toBe(false);
    });

    it('gives the allowance back when the provider never answered, so a retry can work', () => {
      const verdict = eanLookupVerdict({
        providerAnswered: false,
        resultSurvived: false,
        providerWebCalls: 0,
      });
      expect(verdict.outcome).toBe('provider_unavailable');
      expect(verdict.releaseReservation).toBe(true);
      expect(verdict.retryable).toBe(true);
      expect(verdict.noticePl).toBe(LOOKUP_PROVIDER_UNAVAILABLE_PL);
    });

    it('keeps the allowance spent if a failed provider still reported billed calls', () => {
      expect(
        eanLookupVerdict({ providerAnswered: false, resultSurvived: false, providerWebCalls: 2 })
          .releaseReservation,
      ).toBe(false);
    });

    it('says nothing when the lookup simply worked', () => {
      const verdict = eanLookupVerdict({
        providerAnswered: true,
        resultSurvived: true,
        providerWebCalls: 1,
      });
      expect(verdict).toEqual({
        outcome: 'resolved',
        releaseReservation: false,
        retryable: false,
        noticePl: null,
      });
    });

    it('explains a refused reservation only when the customer can act on it', () => {
      expect(lookupSkippedNoticePl('session_lookup_already_used')).toBe(LOOKUP_ALREADY_ASKED_PL);
      expect(lookupSkippedNoticePl('lookup_requires_barcode')).toBeNull();
      expect(lookupSkippedNoticePl(null)).toBeNull();
    });
  });

  describe('the copy is customer copy', () => {
    it('survives the render gate instead of being swapped for the calm fallback', () => {
      // „research skipped: session_lookup_already_used" is what used to reach this gate.
      expect(exposesInternals('research skipped: session_lookup_already_used')).toBe(true);
      for (const copy of [
        LOOKUP_RESOLVED_NOTHING_PL,
        LOOKUP_PROVIDER_UNAVAILABLE_PL,
        LOOKUP_ALREADY_ASKED_PL,
      ]) {
        expect(exposesInternals(copy)).toBe(false);
        expect(copy).not.toMatch(/[A-Z]{2,}/);
      }
    });
  });

  describe('the analyze function leaves a session the flow can use', () => {
    const analyze = () => read('supabase/functions/product-scan-analyze/index.ts');

    it('persists a controlled result when the sources answered nothing', () => {
      /*
        This is the whole defect. `scanResultFromLookupFacts` returns null as soon as no external
        source survives, so the completion RPC was skipped, the session stayed `collecting`, and
        the very next finalize answered 409 `scan_not_ready_for_creation` — a body with no `kind`,
        which the discovery adapter rethrows. That throw is the generic sentence the owner read.
      */
      expect(analyze()).toContain('eanLookupVerdict');
      expect(analyze()).toContain("verdict.outcome === 'provider_unavailable'");
      // "nothing" is merged and validated like any other result, so the session reaches `analyzed`
      expect(analyze()).toContain('lookupResult ?? {}');
    });

    it('books what the lookup actually cost, even when it found nothing', () => {
      // estimated_cost_usd stayed 0.000000 on b414f3e6 while three web calls were billed
      expect(analyze()).toContain('p_cost_usd: providerWebCalls * 0.01');
    });

    it('releases an unspent reservation so the retry is not theatre', () => {
      expect(analyze()).toContain('release_product_scan_ean_lookup_v1');
      expect(analyze()).toContain('if (verdict.releaseReservation)');
    });

    it('tells the client whether a retry can help, and what to say', () => {
      expect(analyze()).toContain('retryable: verdict.retryable');
      expect(analyze()).toContain('notice: verdict.noticePl');
      expect(analyze()).toContain('lookupSkippedNoticePl(skippedReason)');
    });
  });

  describe('the release RPC cannot hand back money that was spent', () => {
    const migration = () =>
      read('supabase/migrations/20260907220750_scanner_rescan_reevaluation.sql');

    it('exists, and is server-only', () => {
      expect(migration()).toContain(
        'create or replace function public.release_product_scan_ean_lookup_v1',
      );
      expect(migration()).toContain(
        'revoke all on function public.release_product_scan_ean_lookup_v1(uuid,uuid)',
      );
      expect(migration()).toContain(
        'grant execute on function public.release_product_scan_ean_lookup_v1(uuid,uuid) to service_role',
      );
    });

    it('refuses whenever any record says the lookup produced or cost something', () => {
      expect(migration()).toContain('lookup_already_spent');
      expect(migration()).toContain('v_session.result_json is not null');
      expect(migration()).toContain('coalesce(v_session.estimated_cost_usd,0)>0');
      expect(migration()).toContain('from public.product_scan_external_sources');
    });

    it("checks the provider's OWN ledger, which is what happened on b414f3e6", () => {
      // three billed web calls with no facts: releasing that would be an unlimited free retry
      expect(migration()).toContain('from public.intimport_enrichment_usage');
      expect(migration()).toContain("import_id='product-scan-'||p_session_id::text");
      expect(migration()).toContain('lookup_provider_already_billed');
    });

    it('holds the same session lock the reservation holds', () => {
      expect(migration()).toContain("pg_advisory_xact_lock(hashtext('product-scan-lookup:'");
    });

    it('never drives the counter negative', () => {
      expect(migration()).toContain('web_calls=greatest(web_calls-1,0)');
      expect(migration()).toContain('no_reservation_held');
    });
  });

  describe('the sentence reaches the customer instead of an internal token', () => {
    const adapter = () => read('src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts');
    const discovery = () => read('src/scan-import-v2/discovery/discovery.ts');

    it('carries the server sentence through the discovery port', () => {
      expect(adapter()).toContain("typeof d['notice'] === 'string'");
      expect(adapter()).toContain("reason: d['skipped'] as string, notice");
    });

    it('no longer composes a note out of internal tokens', () => {
      // the template literal itself, not the comment that records what it used to produce
      expect(discovery()).not.toMatch(/`research skipped: \$\{/);
      expect(discovery()).toContain('r.notice ?? null');
    });
  });
});
