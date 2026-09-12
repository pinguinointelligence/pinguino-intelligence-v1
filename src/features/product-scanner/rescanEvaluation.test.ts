import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DERIVED_FACT_KEYS,
  rescanReevaluationPlan,
  scanResultFromStoredFacts,
} from './rescanEvaluation';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/**
 * Executable text only. These files EXPLAIN the routing rule at length — quoting it is how the
 * next reader learns where it lives — so "the rule is not restated here" has to be asserted about
 * the code, not about the prose that documents it.
 */
const tsCode = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const sqlCode = (source: string) => source.replace(/^\s*--[^\n]*$/gm, '');

/*
  OWNER CONTRACT 2026-09-07:
    „Ponowny skan istniejącego PM nie może kończyć się natychmiastowym zwrotem starego PM. Musi
     ponownie ocenić produkt na aktualnym evidence i, jeśli spełnia warunki, awansować go do
     PR-ING bez duplikatu."

  The zero-cost exact path is NOT the defect and is pinned by paidCallContract.test.ts. The defect
  is that it was the whole answer.
*/
describe('rescan of a known code', () => {
  describe('which products are re-evaluated', () => {
    it("re-evaluates the caller's own private product", () => {
      expect(rescanReevaluationPlan({ productKind: 'customer_provisional' })).toEqual({
        reevaluate: true,
        reason: 'private_product_may_be_promoted',
      });
    });

    /*
      REVERSED 2026-09-08, and the reason is a measurement.

      This asserted that a shared product is never re-evaluated because "there is nothing to
      promote" — true of the ROUTE, false of the DATA. PR-ING-007197 was written at 94.12 while
      PM-ING-007193, the same article, sat at 73.4, and every classifier fix that landed on
      2026-09-07 could reach neither: one is shared, the other is not the caller's.

      A shared product is now re-evaluated when an authority version has moved, and left alone
      when nothing has. The route is untouched; only staleness is addressed.
    */
    const VERSIONS = {
      evidence: 'e1',
      sourceClassifier: 'c1',
      mapper: 'm1',
      assessor: 'a1',
    } as const;

    it('re-evaluates a shared registry product when an authority version moved', () => {
      expect(
        rescanReevaluationPlan({
          productKind: 'commercial_product',
          storedVersions: { ...VERSIONS, sourceClassifier: 'c0' },
          currentVersions: VERSIONS,
        }),
      ).toMatchObject({ reevaluate: true, reason: 'shared_product_authority_version_changed' });
    });

    it('leaves a shared registry product alone when nothing moved', () => {
      expect(
        rescanReevaluationPlan({
          productKind: 'commercial_product',
          storedVersions: VERSIONS,
          currentVersions: VERSIONS,
        }),
      ).toEqual({ reevaluate: false, reason: 'shared_product_already_current' });
    });

    it('re-evaluates a shared product that predates version stamping', () => {
      // The population that most needs it: scored before any version was recorded.
      expect(
        rescanReevaluationPlan({
          productKind: 'commercial_product',
          storedVersions: null,
          currentVersions: VERSIONS,
        }).reevaluate,
      ).toBe(true);
    });

    it('never re-evaluates a Mapper reference, which is not a customer product', () => {
      expect(rescanReevaluationPlan({ productKind: 'mapper_reference' }).reevaluate).toBe(false);
    });

    it('refuses an unknown kind rather than guessing', () => {
      expect(rescanReevaluationPlan({ productKind: null }).reevaluate).toBe(false);
      expect(rescanReevaluationPlan({ productKind: 'something_new' })).toEqual({
        reevaluate: false,
        reason: 'unknown_product_kind',
      });
    });
  });

  describe('recovering the evidence a stored product was built from', () => {
    it('strips exactly the keys the save RPC adds, and keeps the scan result', () => {
      const facts = {
        schemaVersion: 'gellatti_product_scan_v1',
        identity: { displayName: 'Napój sojowy', brand: 'Hacendado' },
        nutrition: { protein: 3.2 },
        evidence: [{ field: 'nutrition_protein', source: 'label' }],
        externalSources: [{ sourceType: 'manufacturer', url: 'https://example.test' }],
        // everything below is DERIVED — `v_facts := p_scan_result || jsonb_build_object(...)`
        technicalComposition: { fat: 1 },
        productAccuracy: 74.5,
        productAccuracyAssessment: { gellattiReadiness: { ready: false } },
        allergenEvidenceStatus: 'declared',
        ingredientsEvidenceStatus: 'declared',
        productIntelligence: { engineUsable: false },
        missingFields: [],
        invalidFields: [],
      };
      expect(scanResultFromStoredFacts(facts)).toEqual({
        schemaVersion: 'gellatti_product_scan_v1',
        identity: { displayName: 'Napój sojowy', brand: 'Hacendado' },
        nutrition: { protein: 3.2 },
        evidence: [{ field: 'nutrition_protein', source: 'label' }],
        externalSources: [{ sourceType: 'manufacturer', url: 'https://example.test' }],
      });
    });

    it('covers every key the deployed RPC adds', () => {
      // If the save RPC ever learns a new derived key, this list must learn it too, or the key
      // round-trips into the next version and the product grows on every rescan.
      for (const key of [
        'technicalComposition',
        'productAccuracy',
        'productAccuracyAssessment',
        'allergenEvidenceStatus',
        'ingredientsEvidenceStatus',
        'productIntelligence',
        'missingFields',
        'invalidFields',
      ])
        expect(DERIVED_FACT_KEYS).toContain(key);
    });

    it('reports nothing to re-seed rather than seeding an empty session', () => {
      expect(scanResultFromStoredFacts(null)).toBeNull();
      expect(scanResultFromStoredFacts({})).toBeNull();
      expect(scanResultFromStoredFacts({ productIntelligence: {} })).toBeNull();
      expect(scanResultFromStoredFacts('not an object')).toBeNull();
    });
  });

  /*
    Source-level, like the paid-call contract beside it: the path lives inside an edge function
    that cannot be imported here, and a comment is not a guarantee — the code shape is.
  */
  describe('the analyze function acts on the plan', () => {
    const analyze = () => read('supabase/functions/product-scan-analyze/index.ts');

    it('re-seeds the session from the stored evidence instead of returning the row alone', () => {
      expect(analyze()).toContain('rescanReevaluationPlan');
      expect(analyze()).toContain('scanResultFromStoredFacts');
      // the evidence travels with the exact match, so nothing has to be re-acquired to use it
      expect(analyze()).toContain('stored_facts: facts');
    });

    it('re-evaluates through the finalize authority, never a second rule', () => {
      expect(analyze()).toContain('product-scan-finalize');
      // No routing rule may be restated here — the RPC owns it. Asserted on the CODE, because the
      // comment above the call deliberately quotes the rule to say where it lives.
      const code = tsCode(analyze());
      expect(code).not.toContain('PM_UNVERIFIED');
      expect(code).not.toContain('PM_READY');
      expect(code).not.toMatch(/>\s*85/);
      // reading the route the RPC decided is fine; assigning one here is not
      expect(code).not.toMatch(/\broute\s*=[^=]/);
      expect(code).toContain("payload.route === 'string'");
    });

    it('keeps the rescan free: the re-evaluation books no cost and reads no photograph', () => {
      const branch = analyze().slice(analyze().indexOf("if (mode === 'ean_lookup')"));
      const exactBranch = branch.slice(0, branch.indexOf('reserve_product_scan_ean_lookup_v1'));
      expect(exactBranch).toContain('p_cost_usd: 0');
      expect(exactBranch).toContain('visionCalls: 0, webCalls: 0, estimatedCostUsd: 0');
      expect(exactBranch).not.toContain('api.openai.com');
      expect(exactBranch).not.toContain('intimport-enrich');
    });

    it('reads the row back after a promotion so the answer carries the new article and version', () => {
      const branch = analyze().slice(analyze().indexOf("if (mode === 'ean_lookup')"));
      const exactBranch = branch.slice(0, branch.indexOf('reserve_product_scan_ean_lookup_v1'));
      expect(exactBranch).toContain('if (promoted)');
      expect(exactBranch).toContain('exactProductForBarcode');
      expect(exactBranch).toContain('current.product_code');
      expect(exactBranch).toContain('currentVersionId: current.current_version_id');
    });

    it('imports the shared modules with the .ts extension Deno requires', () => {
      // A value import from src/ without an explicit extension deploys as a hard failure and
      // nothing in CI can see it.
      expect(analyze()).toContain(
        "from '../../../src/features/product-scanner/rescanEvaluation.ts'",
      );
      expect(analyze()).toContain(
        "from '../../../src/features/product-scanner/eanLookupOutcome.ts'",
      );
    });
  });

  describe('promotion happens on the SAME product id', () => {
    const promotion = () =>
      read('supabase/migrations/20260907220750_scanner_rescan_reevaluation.sql');
    const routing = () =>
      read('supabase/migrations/20260907030000_scanner_final_pr_pm_routing.sql');

    it('does not restate, weaken or re-derive the routing rule', () => {
      // The rule stays exactly where 20260907030000 put it.
      expect(routing()).toContain("v_route:=case when v_ready and v_conf>85 then ''PR''");
      // Asserted on the SQL that runs: the header comment quotes the rule on purpose, to say
      // that this migration leaves it alone.
      const sql = sqlCode(promotion());
      expect(sql).not.toMatch(/v_(?:route|ready|conf)\s*:=/);
      expect(sql).not.toMatch(/v_conf\s*>\s*85/);
      // and the migration refuses to run at all if that rule is not already there
      expect(promotion()).toContain('final PR/PM routing missing');
    });

    it('promotes the existing private row rather than inserting a second one', () => {
      expect(promotion()).toContain('RESCAN PROMOTION');
      expect(promotion()).toContain("v_prior_kind=''customer_provisional''");
      expect(promotion()).toContain('update public.products set');
      expect(promotion()).toContain("product_kind=''commercial_product''");
      expect(promotion()).toContain("visibility=''shared''");
      expect(promotion()).toContain('owner_user_id=null');
      expect(promotion()).toContain('owning_account_id=null');
      expect(promotion()).toContain('where id=v_product_id;');
      // an in-place promotion must never reach an insert into products
      expect(promotion()).not.toMatch(/insert\s+into\s+public\.products\b/i);
    });

    it('lets the PR route see the caller’s own demand row, which is what created duplicates', () => {
      // Before: `owner_user_id is not distinct from (case when v_route='PR' then null else ...)`
      // hid the caller's own row on the PR route, so a qualifying rescan fell through to CREATE.
      expect(promotion()).toContain('then owner_user_id is null or owner_user_id=p_actor_user_id');
      // a genuinely shared record still wins when both exist
      expect(promotion()).toContain('order by case when owner_user_id is null then 0 else 1 end');
    });

    it('re-issues the article code so later customers can find the shared product', () => {
      // the existing-PR probe at the top of the RPC matches on `product_code like 'PR-ING-%'`
      expect(promotion()).toContain("product_code like ''PR-ING-%''");
      expect(promotion()).toContain('public.next_product_code()');
    });

    it('serializes on the EAN so a promotion cannot interleave with a concurrent save', () => {
      expect(promotion()).toContain(
        "perform pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean,0));",
      );
    });

    it('patches the deployed body and fails loudly if an anchor moved', () => {
      for (const anchor of [
        'promotion_anchor_declare_not_found',
        'promotion_anchor_lock_not_found',
        'promotion_anchor_pending_not_found',
        'promotion_anchor_existing_name_not_found',
      ])
        expect(promotion()).toContain(anchor);
      // re-running the migration must be a no-op, not a second patch
      expect(promotion()).toContain("position('RESCAN PROMOTION' in v_def) > 0");
    });
  });
});
