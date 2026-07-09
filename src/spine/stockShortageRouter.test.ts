/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routeStockShortage as routeFromBarrel } from './index';
import {
  routeStockShortage,
  STOCK_SHORTAGE_USER_DECISIONS,
  type StockShortageIntent,
  type StockShortageLine,
  type StockShortageSubstitute,
} from './stockShortageRouter';

const substitute = (over: Partial<StockShortageSubstitute> = {}): StockShortageSubstitute => ({
  ingredientName: 'Raspberry puree',
  available: true,
  hasVerifiedIngredientData: true,
  correctionFamily: 'fruit',
  ...over,
});

const line = (over: Partial<StockShortageLine> = {}): StockShortageLine => ({
  lineId: 'strawberry',
  ingredientName: 'Strawberry',
  correctionFamily: 'fruit',
  requiredG: 1000,
  availableG: 720,
  ...over,
});

const intent = (over: Partial<StockShortageIntent> = {}): StockShortageIntent => ({
  productProfile: 'sorbet',
  qualityTier: 'classic',
  batchSizeG: 5000,
  observation: { shortages: [line()] },
  constraints: {
    canScaleBatchDown: true,
    canReformulate: true,
    purchaseOrWaitPossible: true,
  },
  ...over,
});

describe('routeStockShortage — feasible strategies (locked §18 precedence)', () => {
  it('missing ingredient with an approved, verified substitute → substitution_possible', () => {
    const r = routeStockShortage(
      intent({ observation: { shortages: [line({ availableG: 0, substitute: substitute() })] } }),
    );
    expect(r.decision).toBe('substitution_possible');
    const a = r.recommendedActions[0]!;
    expect(a.kind).toBe('use_substitute');
    expect(a.lineId).toBe('strawberry');
    expect(a.substituteName).toBe('Raspberry puree');
    expect(a.notes).toContain('never_applied_without_user_decision');
    expect(r.requiredMeasurements).toContain('recalculate_recipe_with_substitute_composition_and_verify_bands');
  });

  it('substitution wins over scaling when both are possible (precedence)', () => {
    const r = routeStockShortage(
      intent({ observation: { shortages: [line({ substitute: substitute() })] } }),
    );
    expect(r.decision).toBe('substitution_possible');
  });

  it('insufficient quantity, no substitute, scalable → scale_down_possible with the limiting RATIO (never grams)', () => {
    const r = routeStockShortage(intent()); // 720/1000 available, no substitute
    expect(r.decision).toBe('scale_down_possible');
    const a = r.recommendedActions[0]!;
    expect(a.kind).toBe('scale_batch_down');
    expect(a.scaleFactor).toBeCloseTo(0.72, 5);
    expect(a.notes).toContain('uniform_scaling_keeps_composition_percentages_unchanged');
    expect(r.requiredMeasurements).toContain('recompute_scaled_recipe_and_verify_machine_minimums');
  });

  it('scaling honors the minimum acceptable batch (below it → falls to the next strategy)', () => {
    const r = routeStockShortage(
      intent({ constraints: { canScaleBatchDown: true, canReformulate: false, purchaseOrWaitPossible: true, minAcceptableBatchG: 4000 } }),
    ); // 5000 × 0.72 = 3600 < 4000
    expect(r.decision).toBe('purchase_required');
    expect(r.warnings).toContain('scaled_batch_below_minimum_acceptable');
  });

  it('a fully-missing line can never be scaled around (ratio 0 → next strategy)', () => {
    const r = routeStockShortage(
      intent({
        observation: { shortages: [line({ availableG: 0 })] },
        constraints: { canScaleBatchDown: true, canReformulate: false, purchaseOrWaitPossible: true },
      }),
    );
    expect(r.decision).toBe('purchase_required');
    expect(r.warnings).toContain('scaling_impossible_ingredient_missing_entirely');
  });

  it('no substitute, not scalable → purchase_required, or production_blocked when nothing is possible', () => {
    const purchase = routeStockShortage(
      intent({ constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: true } }),
    );
    expect(purchase.decision).toBe('purchase_required');

    const blocked = routeStockShortage(
      intent({ constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false } }),
    );
    expect(blocked.decision).toBe('production_blocked');
    expect(blocked.blockedReason).toBe('no_feasible_strategy_under_constraints');
  });

  it('purchase impossible but reformulation allowed → reformulation_required (last resort before blocked)', () => {
    const r = routeStockShortage(
      intent({
        observation: { shortages: [line({ availableG: 0, isHero: true })] },
        constraints: { canScaleBatchDown: false, canReformulate: true, purchaseOrWaitPossible: false },
      }),
    );
    expect(r.decision).toBe('reformulation_required');
    expect(r.warnings).toContain('hero_ingredient_missing_reformulation_changes_product_identity');
    expect(r.requiredMeasurements).toContain('designer_reformulation_then_full_reevaluation');
  });
});

describe('routeStockShortage — substitution safety gates (never silent)', () => {
  const allApprovals = {
    canScaleBatchDown: false,
    canReformulate: false,
    purchaseOrWaitPossible: false,
    allergenSubstitutionApproved: true,
    alcoholSubstitutionApproved: true,
    sweetenerSubstitutionRuleApproved: true,
  };

  it('vegan NEVER receives a dairy substitute — no approval flag can override', () => {
    const r = routeStockShortage(
      intent({
        productProfile: 'vegan_gelato',
        observation: { shortages: [line({ correctionFamily: 'oat_drink', availableG: 0, substitute: substitute({ ingredientName: 'Cream 30%', correctionFamily: 'cream', isDairy: true }) })] },
        constraints: allApprovals,
      }),
    );
    expect(r.decision).not.toBe('substitution_possible');
    expect(r.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('dairy_substitute_forbidden_for_profile');
  });

  it('sorbet NEVER receives a dairy substitute (flagged by isDairy alone, without a family)', () => {
    const r = routeStockShortage(
      intent({
        productProfile: 'sorbet',
        observation: { shortages: [line({ availableG: 0, substitute: substitute({ ingredientName: 'Milk 3.5%', correctionFamily: null, isDairy: true }) })] },
        constraints: allApprovals,
      }),
    );
    expect(r.decision).not.toBe('substitution_possible');
    expect(r.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('dairy_substitute_forbidden_for_profile');
  });

  it('allergen substitution requires explicit approval (blocked without, viable with)', () => {
    const shortages = [line({ availableG: 0, substitute: substitute({ containsAllergens: true }) })];
    const noFlag = routeStockShortage(intent({ observation: { shortages } }));
    expect(noFlag.decision).not.toBe('substitution_possible');
    expect(noFlag.warnings.join(',')).toContain('allergen_substitution_requires_explicit_approval');

    const withFlag = routeStockShortage(
      intent({
        observation: { shortages },
        constraints: { canScaleBatchDown: true, canReformulate: true, purchaseOrWaitPossible: true, allergenSubstitutionApproved: true },
      }),
    );
    expect(withFlag.decision).toBe('substitution_possible');
  });

  it('alcohol-containing substitute requires its explicit approval flag', () => {
    const shortages = [line({ availableG: 0, substitute: substitute({ containsAlcohol: true }) })];
    const noFlag = routeStockShortage(intent({ observation: { shortages } }));
    expect(noFlag.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('alcohol_substitution_requires_explicit_approval');
    const withFlag = routeStockShortage(
      intent({ observation: { shortages }, constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false, alcoholSubstitutionApproved: true } }),
    );
    expect(withFlag.decision).toBe('substitution_possible');
  });

  it('sweetener/polyol/HIS substitution blocks unless an explicit supported rule is approved', () => {
    const shortages = [line({ correctionFamily: 'sucrose', availableG: 0, substitute: substitute({ ingredientName: 'Erythritol blend', correctionFamily: 'sucrose', isSweetenerPolyolOrHis: true }) })];
    const noRule = routeStockShortage(intent({ observation: { shortages } }));
    expect(noRule.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('sweetener_polyol_his_substitution_requires_supported_rule');
    const withRule = routeStockShortage(
      intent({ observation: { shortages }, constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false, sweetenerSubstitutionRuleApproved: true } }),
    );
    expect(withRule.decision).toBe('substitution_possible');
  });

  it('replacement requires VERIFIED ingredient data (locked acceptance 28)', () => {
    const r = routeStockShortage(
      intent({ observation: { shortages: [line({ availableG: 0, substitute: substitute({ hasVerifiedIngredientData: false }) })] } }),
    );
    expect(r.decision).not.toBe('substitution_possible');
    expect(r.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('substitute_data_not_verified');
  });

  it('an unknown / unlisted substitute family is blocked, never remapped', () => {
    const junkFamily = routeStockShortage(
      intent({ observation: { shortages: [line({ availableG: 0, substitute: substitute({ correctionFamily: 'unicorn_dust' as never }) })] } }),
    );
    expect(junkFamily.decision).not.toBe('substitution_possible');
    expect(junkFamily.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('substitute_family_not_allowed_for_profile');

    const noFamily = routeStockShortage(
      intent({ observation: { shortages: [line({ availableG: 0, substitute: substitute({ correctionFamily: null }) })] } }),
    );
    expect(noFamily.trace.lineAssessments[0]!.substitutionBlockedReasons).toContain('substitute_family_unknown');
  });
});

describe('routeStockShortage — blocks and honest reporting', () => {
  it('unknown product profile → not_supported (never remapped)', () => {
    const r = routeStockShortage(intent({ productProfile: 'granita' }));
    expect(r.decision).toBe('not_supported');
    expect(r.blockedReason).toBe('unsupported_product_profile');
    expect(r.nextUserDecisionOptions).toEqual([]);
  });

  it('missing stock quantity → blocked_missing_data + measurement requirement', () => {
    const r = routeStockShortage(
      intent({ observation: { shortages: [line({ availableG: null })] } }),
    );
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('missing_stock_quantity');
    expect(r.requiredMeasurements).toContain('measure_required_and_available_grams_per_line');
    expect(routeStockShortage(intent({ observation: { shortages: [line({ requiredG: null })] } })).decision).toBe('blocked_missing_data');
  });

  it('duplicate line ids → blocked_missing_data (adversarial-review regression: the bypass repro)', () => {
    // The exact reviewed bypass: a not-short duplicate carrying an unverified DAIRY
    // substitute must never reach substitution_possible on sorbet — now it blocks.
    const r = routeStockShortage(
      intent({
        productProfile: 'sorbet',
        observation: {
          shortages: [
            line({ lineId: 'x', requiredG: 100, availableG: 50, substitute: substitute() }),
            line({ lineId: 'x', ingredientName: 'Cream line', requiredG: 100, availableG: 100, substitute: substitute({ ingredientName: 'Heavy cream 35%', correctionFamily: 'cream', isDairy: true, hasVerifiedIngredientData: false }) }),
          ],
        },
        constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false },
      }),
    );
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('duplicate_line_ids');
    expect(r.recommendedActions).toEqual([]);
    expect(r.requiredMeasurements).toContain('assign_unique_line_ids');
    // crash variant from the review: duplicate not-short line WITHOUT a substitute
    const crashVariant = routeStockShortage(
      intent({
        observation: {
          shortages: [
            line({ lineId: 'x', availableG: 0, substitute: substitute() }),
            line({ lineId: 'x', ingredientName: 'No-sub line', requiredG: 100, availableG: 100, substitute: null }),
          ],
        },
      }),
    );
    expect(crashVariant.decision).toBe('blocked_missing_data'); // never throws
  });

  it('lines and assessments are paired by index — a not-short line never contributes an action', () => {
    const r = routeStockShortage(
      intent({
        observation: {
          shortages: [
            line({ lineId: 'a', availableG: 0, substitute: substitute() }),
            line({ lineId: 'b', ingredientName: 'Sucrose', correctionFamily: 'sucrose', requiredG: 200, availableG: 500, substitute: substitute({ ingredientName: 'ShouldNeverAppear' }) }),
          ],
        },
      }),
    );
    expect(r.decision).toBe('substitution_possible');
    expect(r.recommendedActions).toHaveLength(1); // only the SHORT line gets an action
    expect(r.recommendedActions[0]!.lineId).toBe('a');
    expect(JSON.stringify(r.recommendedActions)).not.toContain('ShouldNeverAppear');
  });

  it('unverifiable scale bounds are ALWAYS flagged, never guessed (review regression)', () => {
    // NaN batch size with a STATED minimum — scaling allowed but flagged
    const nanBatch = routeStockShortage(
      intent({ batchSizeG: Number.NaN, constraints: { canScaleBatchDown: true, canReformulate: false, purchaseOrWaitPossible: false, minAcceptableBatchG: 4000 } }),
    );
    expect(nanBatch.decision).toBe('scale_down_possible');
    expect(nanBatch.warnings).toContain('scaled_batch_bounds_unverified');
    // known batch but NO stated minimum — also flagged
    const noMin = routeStockShortage(
      intent({ batchSizeG: 5000, constraints: { canScaleBatchDown: true, canReformulate: false, purchaseOrWaitPossible: false } }),
    );
    expect(noMin.decision).toBe('scale_down_possible');
    expect(noMin.warnings).toContain('scaled_batch_bounds_unverified');
    // fully verifiable bounds that pass — NOT flagged
    const ok = routeStockShortage(
      intent({ batchSizeG: 5000, constraints: { canScaleBatchDown: true, canReformulate: false, purchaseOrWaitPossible: false, minAcceptableBatchG: 3000 } }),
    );
    expect(ok.decision).toBe('scale_down_possible');
    expect(ok.warnings).not.toContain('scaled_batch_bounds_unverified');
  });

  it('empty observation → blocked_missing_data; nothing-short observation → not_supported', () => {
    expect(routeStockShortage(intent({ observation: { shortages: [] } })).decision).toBe('blocked_missing_data');
    const notShort = routeStockShortage(
      intent({ observation: { shortages: [line({ availableG: 2000 })] } }),
    );
    expect(notShort.decision).toBe('not_supported');
    expect(notShort.blockedReason).toBe('observation_contains_no_shortage');
  });

  it('hero shortage is flagged — never silently reduced (locked §18)', () => {
    const r = routeStockShortage(
      intent({ observation: { shortages: [line({ isHero: true })] } }),
    );
    expect(r.warnings).toContain('hero_ingredient_short_never_silently_reduced');
  });
});

describe('routeStockShortage — locked user-decision menu (§18 / Optimizer §7A.1)', () => {
  it('every feasible decision offers the full locked five-option menu', () => {
    const feasible = [
      routeStockShortage(intent({ observation: { shortages: [line({ availableG: 0, substitute: substitute() })] } })),
      routeStockShortage(intent()),
      routeStockShortage(intent({ constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: true } })),
      routeStockShortage(intent({ constraints: { canScaleBatchDown: false, canReformulate: true, purchaseOrWaitPossible: false } })),
    ];
    for (const r of feasible) {
      expect(r.nextUserDecisionOptions).toEqual([...STOCK_SHORTAGE_USER_DECISIONS]);
    }
    expect(STOCK_SHORTAGE_USER_DECISIONS).toEqual([
      'reduce_batch_to_available_stock',
      'replace_ingredient',
      'keep_batch_and_mark_missing',
      'best_possible_lower_intensity',
      'stop_and_buy_missing_product',
    ]);
  });

  it('production_blocked limits the menu to the honest remaining choices, with the reason', () => {
    const r = routeStockShortage(
      intent({ constraints: { canScaleBatchDown: false, canReformulate: false, purchaseOrWaitPossible: false } }),
    );
    expect(r.nextUserDecisionOptions).toEqual(['keep_batch_and_mark_missing', 'stop_and_buy_missing_product']);
    expect(r.menuLimitedReason).toBe('substitution_scaling_purchase_and_reformulation_all_unavailable');
  });
});

describe('routeStockShortage — output contract invariants', () => {
  it('output is gram-free: the only numeric on any action is the dimensionless scale ratio', () => {
    const results = [
      routeStockShortage(intent()),
      routeStockShortage(intent({ observation: { shortages: [line({ availableG: 0, substitute: substitute() })] } })),
      routeStockShortage(intent({ constraints: { canScaleBatchDown: false, canReformulate: true, purchaseOrWaitPossible: false } })),
    ];
    for (const r of results) {
      for (const a of r.recommendedActions) {
        expect('grams' in a).toBe(false);
        const numerics = Object.entries(a).filter(([, v]) => typeof v === 'number');
        for (const [key, value] of numerics) {
          expect(key).toBe('scaleFactor');
          expect(value as number).toBeGreaterThan(0);
          expect(value as number).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('carries the capability gate hint (existing spine capability)', () => {
    expect(routeStockShortage(intent()).capabilityGate).toBe('canUseStockShortageWorkflow');
  });

  it('echoes the quality tier untouched (never silently changed)', () => {
    const r = routeStockShortage(intent({ qualityTier: 'premium' }));
    expect(r.trace.qualityTierEchoed).toBe('premium');
  });

  it('never mutates its input', () => {
    const input = intent({
      recipeSnapshot: { items: [{ id: 'strawberry', planned_grams: 1000 }] },
      observation: { shortages: [line({ substitute: substitute() }), line({ lineId: 'sugar', ingredientName: 'Sucrose', correctionFamily: 'sucrose', requiredG: 200, availableG: 300 })] },
    });
    const snapshot = JSON.stringify(input);
    routeStockShortage(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic', () => {
    const run = () => routeStockShortage(intent({ observation: { shortages: [line({ substitute: substitute({ containsAllergens: true }) })] } }));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('is exported through the spine barrel', () => {
    expect(routeFromBarrel).toBe(routeStockShortage);
  });
});

describe('stockShortageRouter — boundary (pure spine module)', () => {
  const src = readFileSync(join(import.meta.dirname, 'stockShortageRouter.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('imports only within src/spine (no engine, no DB, no Mapper, no services)', () => {
    for (const match of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      expect(match[1]).toMatch(/^\.\//);
    }
    expect(/@\/engine|@\/services|@\/lib|@\/data/.test(src)).toBe(false);
    expect(/mapper_basement|service_role/i.test(src)).toBe(false);
  });

  it('has no inventory/DB write path and no product PAC-POD or status writes', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
    expect(/saveRecipe|persistRecipe|\.save\(|writeInventory|updateStock|decrementStock/.test(src)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(src)).toBe(false);
  });
});
