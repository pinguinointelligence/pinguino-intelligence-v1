import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPLY_APPROVAL_TOKEN,
  APPLY_PROJECT_REF,
  buildApplyPlan,
  evaluateApplyGuard,
} from '../../../scripts/countryProducts/lib/applyPlan.mjs';
import { isValidGtin } from '../../features/global-catalog/normalization';
import {
  EXACT_PRODUCT_SLOTS,
  EXISTING_STABILIZER_PI_IDS,
  GELATO_BASE_SLOTS,
  GELATO_BASE_SLOT_PI,
  GELATO_BASE_V12_MANIFEST_PATH,
  GELATO_BASE_V12_REGISTRY_PATH,
  GELATO_BASE_V12_SOURCE_SHA256,
  loadGelatoBaseRegistryFromJson,
  openGapsForRole,
  productFor,
  resolveRegistryText,
  selectionFor,
  sourceUrlsFor,
  type NutrientField,
} from './gelatoBaseCountryProducts';

interface Manifest {
  source: { basename: string; sha256: string };
  outputs: Array<{ path: string; sha256: string; bytes: number }>;
  dbPlan: { executed: boolean; approvalToken: string };
}

const registryText = readFileSync(resolve(process.cwd(), GELATO_BASE_V12_REGISTRY_PATH), 'utf8');
const registry = loadGelatoBaseRegistryFromJson(registryText);
const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), GELATO_BASE_V12_MANIFEST_PATH), 'utf8'),
) as Manifest;

// The owner's remaining-gap lists (brief of 2026-09-11), compared with 40_POZOSTALE_V12.
const OWNER_OPEN = {
  CREAM: ['CR', 'DZ', 'JP', 'UY'],
  SMP: ['BE', 'BH', 'CR', 'DO', 'ID', 'IL', 'JP', 'KW', 'LT', 'LV', 'MY', 'SA', 'SK', 'UY', 'VN', 'ZA'],
  DEXTROSE: [
    'AE', 'AR', 'AU', 'BD', 'BH', 'BR', 'CA', 'CL', 'CN', 'CO', 'CR', 'DO', 'DZ', 'EG', 'GH', 'HK', 'ID',
    'IL', 'IN', 'JP', 'KE', 'KR', 'KW', 'LK', 'MA', 'MX', 'MY', 'NG', 'NZ', 'PA', 'PH', 'PK', 'SA', 'SG',
    'TH', 'TN', 'TR', 'TW', 'US', 'UY', 'VN', 'ZA',
  ],
} as const;

const countriesOf = (role: 'CREAM' | 'SMP' | 'DEXTROSE' | 'TARA') =>
  openGapsForRole(registry, role)
    .map((gap) => gap.country)
    .sort();

describe('GELATO base v12 country-product registry', () => {
  it('is built from the pinned owner workbook and matches the manifest byte-for-byte', () => {
    expect(registry.source.sha256).toBe(GELATO_BASE_V12_SOURCE_SHA256);
    expect(manifest.source.sha256).toBe(GELATO_BASE_V12_SOURCE_SHA256);
    expect(manifest.source.basename).toBe('GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx');
    const entry = manifest.outputs.find((output) => output.path === GELATO_BASE_V12_REGISTRY_PATH);
    expect(entry?.sha256).toBe(createHash('sha256').update(registryText, 'utf8').digest('hex'));
    expect(manifest.dbPlan.executed).toBe(false);
  });

  it('covers exactly 75 countries and 450 country × slot selections', () => {
    expect(registry.countries).toHaveLength(75);
    expect(new Set(registry.countries.map((country) => country.iso2)).size).toBe(75);
    expect(registry.selections).toHaveLength(450);
    for (const country of registry.countries) {
      for (const slot of GELATO_BASE_SLOTS) {
        expect(selectionFor(registry, country.iso2, slot), `${country.iso2}/${slot}`).toBeDefined();
      }
    }
  });

  it('maps the six base slots only to existing PIs and creates no PI', () => {
    expect(registry.base.map((slot) => [slot.slot, slot.piIngId])).toEqual(
      GELATO_BASE_SLOTS.map((slot) => [slot, GELATO_BASE_SLOT_PI[slot]]),
    );
    const allowed = new Set<string>([...Object.values(GELATO_BASE_SLOT_PI), ...EXISTING_STABILIZER_PI_IDS]);
    for (const product of registry.products) expect(product.piIngId).toBe(GELATO_BASE_SLOT_PI[product.slot]);
    for (const selection of registry.selections) expect(selection.piIngId).toBe(GELATO_BASE_SLOT_PI[selection.slot]);
    const mentioned = new Set(registryText.match(/PI-ING-\d{6}/g) ?? []);
    expect([...mentioned].filter((id) => !allowed.has(id))).toEqual([]);
    expect(registry.invariants.newPiCreated).toBe(0);
    expect(registry.counts.newPiCreated).toBe(0);
    expect(registry.invariants.mapperModified).toBe(false);
    expect(registry.invariants.prIngNumbersAssigned).toBe(false);
    expect(registryText).not.toMatch(/PR-ING-00(?!7174|7172|7173|7171|7170|7169|7140|7142|7144|7146|7149|7158)\d{4}/);
  });

  it('keeps every present EAN checksum-valid, or flags it', () => {
    const withGtin = registry.products.filter((product) => product.identity.gtin !== null);
    expect(withGtin.length).toBeGreaterThan(0);
    for (const product of withGtin) {
      expect(isValidGtin(product.identity.gtin), product.productKey).toBe(true);
      expect(product.identity.gtinCheckDigitValid).toBe(true);
      expect(product.productKey).toBe(`V12:${product.slot}:GTIN-${product.identity.gtin14}`);
    }
    for (const product of registry.products.filter((entry) => entry.identity.gtin === null)) {
      expect(product.identity.gtinCheckDigitValid).toBeNull();
    }
    for (const alternative of registry.alternatives.filter((entry) => entry.code && /^\d+$/.test(entry.code))) {
      expect(alternative.codeHasValidGs1CheckDigit).toBe(isValidGtin(alternative.code));
    }
  });

  it('never lets two registry identities share an EAN', () => {
    const keys = registry.products.flatMap((product) =>
      product.identity.gtin ? [product.identity.gtin.replace(/^0+/, '')] : [],
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(registry.products.map((product) => product.productKey)).size).toBe(registry.products.length);
    const proposalKeys = registry.selections.flatMap((selection) => (selection.proposalKey ? [selection.proposalKey] : []));
    expect(new Set(proposalKeys).size).toBe(375);
  });

  it('matches the 40_POZOSTALE_V12 header and the owner lists exactly (109 = 4 + 16 + 42 + 47)', () => {
    expect(registry.counts.openGaps.workbookHeader).toEqual({ total: 109, CREAM: 4, SMP: 16, DEXTROSE: 42, TARA: 47 });
    expect(registry.counts.openGaps.byWorkbookRole).toEqual({ CREAM: 4, SMP: 16, DEXTROSE: 42, TARA: 47 });
    expect(registry.counts.openGaps.total).toBe(109);
    expect(registry.counts.openGaps.matchesWorkbookHeader).toBe(true);
    expect(countriesOf('CREAM')).toEqual([...OWNER_OPEN.CREAM]);
    expect(countriesOf('SMP')).toEqual([...OWNER_OPEN.SMP]);
    expect(countriesOf('DEXTROSE')).toEqual([...OWNER_OPEN.DEXTROSE]);
    expect(countriesOf('TARA')).toHaveLength(47);
    const europe = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'CH'];
    expect(countriesOf('DEXTROSE').filter((iso) => europe.includes(iso))).toEqual([]);
  });

  it('never labels a stabilizer research entry as a missing mandatory TARA', () => {
    const stabilizer = openGapsForRole(registry, 'TARA');
    expect(stabilizer).toHaveLength(47);
    for (const gap of stabilizer) {
      expect(gap.slot).toBe('STABILIZER');
      expect(gap.gapKind).toBe('STABILIZER_RESEARCH');
      expect(gap.stabilizerResearch?.taraMandatory).toBe(false);
      expect(gap.stabilizerResearch?.missingMandatoryTara).toBe(false);
    }
    expect(registryText).not.toMatch(/MISSING_MANDATORY_TARA/);
    expect(registry.invariants.stabilizerTaraMandatory).toBe(false);
    expect(registry.base.find((slot) => slot.slot === 'STABILIZER')?.stabilizerSlotRule?.taraMandatory).toBe(false);
    for (const selection of registry.selections.filter((entry) => entry.slot === 'STABILIZER')) {
      expect(selection.stabilizer?.taraMandatory).toBe(false);
    }
  });

  it('keeps unknown values null, never 0', () => {
    for (const product of registry.products) {
      expect(product.labelLanguage).toBeNull();
      for (const field of product.nutrition.estimatedFields) {
        expect(product.nutrition.declared[field], `${product.productKey} ${field}`).toBeNull();
      }
      for (const field of product.nutrition.missingFields) {
        expect(product.nutrition.workingProfile[field]).toBeNull();
        expect(product.nutrition.declared[field]).toBeNull();
      }
      if (!product.package.stated) {
        expect(product.package.quantity).toBeNull();
        expect(product.package.normalizedQuantity).toBeNull();
      }
    }
    const uruguayCream = productFor(registry, selectionFor(registry, 'UY', 'CREAM')?.productKey ?? '');
    expect(uruguayCream?.nutrition.workingProfile.sugars).toBe(0);
    expect(uruguayCream?.nutrition.declared.sugars).toBeNull();
    expect(uruguayCream?.nutrition.estimatedFields).toContain<NutrientField>('sugars');
    const australianMilk = productFor(registry, selectionFor(registry, 'AU', 'MILK')?.productKey ?? '');
    expect(australianMilk?.nutrition.declared.fibre).toBeNull();
  });

  it('deduplicates before creating and reuses the existing PR-ING only on the same EAN', () => {
    expect(registry.counts.productsBySlot).toEqual({ MILK: 67, CREAM: 52, SMP: 52, DEXTROSE: 51, STABILIZER: 31 });
    expect(registry.counts.proposalDecisions).toEqual({
      DUPLICATE_WITHIN_V12: 122,
      NEW_PR_REQUIRED: 252,
      REUSE_EXISTING_PR: 1,
    });
    expect(registry.counts.duplicatesPrevented).toEqual({
      total: 122,
      alreadyGroupedByWorkbookProposalKey: 119,
      additionalMergesBySameGtin: 0,
      additionalMergesBySameBrandArticlePack: 3,
    });
    const reused = registry.products.filter((product) => product.catalog.decision === 'REUSE_EXISTING_PR');
    expect(reused.map((product) => [product.productKey, product.catalog.existingPrIng])).toEqual([
      ['V12:MILK:GTIN-03262970109108', 'PR-ING-007174'],
    ]);
    const polishMilk = productFor(registry, selectionFor(registry, 'PL', 'MILK')?.productKey ?? '');
    expect(polishMilk?.identity.gtin).toBe('5900820016296');
    expect(polishMilk?.catalog.decision).toBe('NEW_PR_REQUIRED');
    expect(polishMilk?.catalog.relatedExisting.map((entry) => entry.productCode)).toContain('PR-ING-007172');
    const louisFrancois = productFor(registry, 'V12:DEXTROSE:SKU-LOUIS-FRANCOIS-450A-1KG');
    expect(louisFrancois?.markets).toEqual(['FR', 'GR', 'OM', 'QA']);
  });

  it('stores sources and long notes once and resolves them', () => {
    const product = productFor(registry, selectionFor(registry, 'PL', 'DEXTROSE')?.productKey ?? '');
    expect(product).toBeDefined();
    const urls = sourceUrlsFor(registry, product?.sourceIds ?? []);
    expect(urls.length).toBe(product?.sourceIds.length);
    for (const url of urls) expect(url).toMatch(/^https?:\/\//);
    const textIds = Object.keys(registry.texts);
    expect(textIds.length).toBeGreaterThan(0);
    for (const id of textIds.slice(0, 20)) {
      expect(resolveRegistryText(registry, id)).toBe(registry.texts[id]);
      expect((registry.texts[id] ?? '').length).toBeGreaterThan(120);
    }
  });
});

describe('GELATO base v12 DB package', () => {
  const plan = buildApplyPlan(registry);

  it('is a dry run unless all three owner arguments are exact', () => {
    expect(evaluateApplyGuard([]).mode).toBe('DRY_RUN');
    expect(evaluateApplyGuard(['--json']).mode).toBe('DRY_RUN');
    expect(evaluateApplyGuard(['--apply']).mode).toBe('REFUSED');
    expect(evaluateApplyGuard(['--apply', `--project-ref=${APPLY_PROJECT_REF}`]).mode).toBe('REFUSED');
    expect(evaluateApplyGuard(['--apply', '--owner-db-approval=GELLATTI-V12-PR-ING']).mode).toBe('REFUSED');
    expect(
      evaluateApplyGuard(['--apply', '--project-ref=riwipywgqobrulyzrzad', `--owner-db-approval=${APPLY_APPROVAL_TOKEN}`]).mode,
    ).toBe('REFUSED');
    expect(evaluateApplyGuard(['--apply', `--project-ref=${APPLY_PROJECT_REF}`, '--owner-db-approval=yes']).mode).toBe(
      'REFUSED',
    );
    expect(evaluateApplyGuard(['--force']).mode).toBe('REFUSED');
    expect(
      evaluateApplyGuard(['--apply', `--project-ref=${APPLY_PROJECT_REF}`, `--owner-db-approval=${APPLY_APPROVAL_TOKEN}`]).mode,
    ).toBe('APPLY');
    expect(APPLY_PROJECT_REF).toBe('tunabqqrwabacxjcxxkz');
    expect(APPLY_APPROVAL_TOKEN).toBe('GELLATTI-V12-PR-ING');
    expect(manifest.dbPlan.approvalToken).toBe(APPLY_APPROVAL_TOKEN);
  });

  it('only plans routes in markets that exist in catalog_market_countries and never replaces a primary', () => {
    const markets = new Set(registry.catalogSnapshot.catalogMarketCountries);
    expect(markets.size).toBe(18);
    for (const product of plan.productsToCreate) {
      expect(product.routes.length).toBeGreaterThan(0);
      expect(markets.has(product.requestMarket)).toBe(true);
      for (const route of product.routes) {
        expect(markets.has(route.country)).toBe(true);
        expect(route.assignmentKind).toBe('PRIMARY_DEFAULT');
        const selection = selectionFor(registry, route.country, product.slot as (typeof EXACT_PRODUCT_SLOTS)[number]);
        expect(selection?.route.decision).toBe('ROUTE_CREATABLE_NOW');
        expect(selection?.selectionState).toBe('SELECTION_CLOSED');
      }
      expect(product.requestIdempotencyKey).toBe(`gellatti-v12-pr-ing:${product.productKey}`);
      expect(product.requestIdempotencyKey.length).toBeLessThanOrEqual(160);
    }
    expect(plan.routeConflicts.map((conflict) => [conflict.selectionKey, conflict.existingPrimary?.productCode])).toEqual([
      ['V12:ES:MILK', 'PR-ING-007173'],
      ['V12:PL:MILK', 'PR-ING-007172'],
    ]);
    expect(plan.routeConflicts.every((conflict) => conflict.decision === 'NOT_CHANGED_REQUIRES_SEPARATE_OWNER_DECISION')).toBe(true);
    expect(plan.reuse).toEqual([
      { productKey: 'V12:MILK:GTIN-03262970109108', prIng: 'PR-ING-007174', routesAlreadyPresent: ['FR'], routesToAdd: [], blockedRoutes: [] },
    ]);
  });

  it('counts rows per table consistently with the plan', () => {
    const products = plan.productsToCreate.length;
    const routes = plan.productsToCreate.reduce((sum, product) => sum + product.routes.length, 0);
    const extraMarkets = plan.productsToCreate.reduce((sum, product) => sum + product.additionalMarkets.length, 0);
    expect(plan.tableCounts.product_add_requests).toBe(products);
    expect(plan.tableCounts.products).toBe(products);
    expect(plan.tableCounts.product_variants).toBe(products);
    expect(plan.tableCounts.product_canonical_slot_reviews).toBe(products);
    expect(plan.tableCounts.product_variant_markets).toBe(products + extraMarkets);
    expect(plan.tableCounts.country_product_slot_assignments).toBe(routes);
    expect(plan.tableCounts.mapper_basement).toBe(0);
    expect(plan.tableCounts.pi_ing_created).toBe(0);
    expect(plan.routeCounts.creatableNow).toBe(routes);
    expect(plan.routeCounts.creatableNow + plan.routeCounts.alreadyPresent + plan.routeCounts.blockedByMarketForeignKey + plan.routeCounts.blockedOtherwise).toBe(375);
    for (const product of plan.productsToCreate) {
      const registryProduct = productFor(registry, product.productKey);
      expect(registryProduct?.readiness.engineProfileExpectation).toBe('DECLARED_PROFILE_COMPLETE');
      const nutrition = (product.requestPayload.result as { nutrition: Record<string, unknown> }).nutrition;
      for (const field of registryProduct?.nutrition.estimatedFields ?? []) expect(nutrition[field]).toBeNull();
    }
  });
});
