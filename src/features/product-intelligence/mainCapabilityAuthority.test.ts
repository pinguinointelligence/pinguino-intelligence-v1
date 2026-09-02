/**
 * GLOBAL MAIN AUTHORITY v1.4 — capability contract.
 *
 * The architecture claim under test: Main eligibility is derived from product
 * SEMANTICS, and a missing calibrated envelope never vetoes the owner's Main
 * intent. Every case here is expressed through resolver snapshots only; no test
 * may reintroduce an exact ingredient-id allow-list as the eligibility rule.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ProductBehaviorSnapshot } from './contracts';
import {
  hasCalibratedMainEnvelope,
  resolveMainCapability,
  userHeldMainLineIds,
} from './mainCapability';
import { mainBehaviorBlockReason, productBehaviorCanBeMain } from './productBehaviorAccess';
import { snapshotServerResolvedProductBehavior } from './productBehaviorResolver';

const CALIBRATED_POLICY = {
  policyId: 'main-sorbet-exact-fruit-60-v1',
  policyVersion: '1',
  familyId: 'fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  basis: 'FRUIT_EQUIVALENT' as const,
  ecoFloorPercent: 60,
  optimalCeilingPercent: 60,
  hardLimitPercent: 60,
  mainEquivalentFactor: 1,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedMixedFamilyIds: [],
  evidenceStatus: 'PINGUINO_CALIBRATED' as const,
};

function snapshot(overrides: Partial<ProductBehaviorSnapshot> = {}): ProductBehaviorSnapshot {
  return {
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId: 'line-1',
    productId: 'product-1',
    productVersionId: 'version-1',
    source: 'mapper',
    factsFingerprint: 'facts-1',
    behaviorBindingId: 'binding-1',
    behaviorBindingVersion: 'v1',
    taxonomyVersion: 'pinguino-product-taxonomy-v1',
    familyId: 'fruit',
    subfamilyId: 'banana',
    formId: 'fresh',
    verificationState: 'verified',
    technicalAuthority: 'mapper_exact',
    mapperIngredientId: 'PI-ING-000345',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
    mainAuthority: 'USER_HELD',
    mainCalibrationLevel: 'NONE',
    mainPolicyId: null,
    mainPolicyVersion: null,
    ecoFloorPercent: null,
    optimalCeilingPercent: null,
    hardLimitPercent: null,
    mainEquivalentFactor: null,
    mainBasis: null,
    requiresLiquidDairyCarrier: false,
    liquidDairyCarrierFloorPercent: null,
    approvedLiquidDairyCarrier: false,
    approvedMixedFamilyIds: [],
    moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'eligible' },
    processScope: 'BASE_FORMULATION',
    resolutionContext: null,
    resolverVersion: 'unified-product-behavior-v2',
    sharedFacts: null,
    warnings: [],
    blockReasons: [],
    ...overrides,
  };
}

const calibrated = (overrides: Partial<ProductBehaviorSnapshot> = {}): ProductBehaviorSnapshot =>
  snapshot({
    mainCapability: 'MAIN_CAPABLE',
    mainAuthority: 'CALIBRATED',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainPolicyId: CALIBRATED_POLICY.policyId,
    mainPolicyVersion: CALIBRATED_POLICY.policyVersion,
    ecoFloorPercent: 60,
    optimalCeilingPercent: 60,
    hardLimitPercent: 60,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    ...overrides,
  });

describe('resolveMainCapability — capability states (§3)', () => {
  it('a calibrated flavour carrier is MAIN_CAPABLE and keeps its exact-product envelope', () => {
    const capability = resolveMainCapability({ snapshot: calibrated() });
    expect(capability.state).toBe('MAIN_CAPABLE');
    expect(capability.calibrationLevel).toBe('EXACT_PRODUCT');
    expect(capability.policyId).toBe(CALIBRATED_POLICY.policyId);
    expect(capability.userHeld).toBe(false);
    expect(capability.selectable).toBe(true);
    expect(capability.reasonPl).toBeNull();
  });

  it('a family-calibrated carrier reports FAMILY, not EXACT_PRODUCT (§8)', () => {
    const capability = resolveMainCapability({
      snapshot: calibrated({
        mainCalibrationLevel: 'FAMILY',
        mainPolicyId: 'main-banana-fresh-dairy',
      }),
    });
    expect(capability.state).toBe('MAIN_CAPABLE');
    expect(capability.calibrationLevel).toBe('FAMILY');
  });

  it('OWNER REPRODUCER: Banana in Sorbet is selectable as user-held Main (§4, §5, §16)', () => {
    const capability = resolveMainCapability({ snapshot: snapshot() });
    expect(capability.state).toBe('MAIN_CAPABLE_UNCALIBRATED');
    expect(capability.userHeld).toBe(true);
    expect(capability.selectable).toBe(true);
    expect(capability.calibrationLevel).toBe('NONE');
    // No percentage floor/ceiling is invented for it.
    expect(capability.policyId).toBeNull();
    expect(mainBehaviorBlockReason(snapshot())).toBeNull();
    expect(productBehaviorCanBeMain(snapshot())).toBe(true);
  });

  it.each([
    ['STRUCTURAL_ONLY', 'Składnik techniczny — nie definiuje smaku receptury.'],
    ['TOPPING_ONLY', 'Produkt po produkcji (topping) nie może być składnikiem głównym.'],
    ['PROTEIN_CONTRIBUTOR_ONLY', 'Składnik białkowy nie jest automatycznie smakiem Main.'],
    ['STANDARD_ONLY', 'Składnik bazowy/standardowy — nie definiuje smaku receptury.'],
  ])(
    'a %s product is blocked with its real reason, never a vague tooltip (§23)',
    (role, reason) => {
      const blocked = snapshot({
        mainCapability: 'MAIN_TECHNICAL_BLOCKED',
        behaviorRole: role as ProductBehaviorSnapshot['behaviorRole'],
        moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'blocked' },
      });
      const capability = resolveMainCapability({ snapshot: blocked });
      expect(capability.state).toBe('MAIN_TECHNICAL_BLOCKED');
      expect(capability.selectable).toBe(false);
      expect(capability.reasonPl).toBe(reason);
      expect(mainBehaviorBlockReason(blocked)).toBe(reason);
    },
  );

  it('a post-process line can never be Main', () => {
    const topping = snapshot({ processScope: 'POST_PROCESS_ADDON' });
    expect(resolveMainCapability({ snapshot: topping }).state).toBe('MAIN_TECHNICAL_BLOCKED');
  });

  it('a stale snapshot fails closed as MAIN_UNKNOWN, not as a silent yes', () => {
    const stale = snapshot({ resolutionState: 'REVALIDATION_REQUIRED' });
    expect(resolveMainCapability({ snapshot: stale }).state).toBe('MAIN_UNKNOWN');
    expect(resolveMainCapability({ snapshot: stale }).selectable).toBe(false);
    expect(resolveMainCapability({ snapshot: undefined, snapshotRequired: true }).state).toBe(
      'MAIN_UNKNOWN',
    );
  });
});

describe('legacy snapshots (§35, §36)', () => {
  it('reconstructs capability from a schema-v1 snapshot with no capability layer', () => {
    const { mainCapability, mainAuthority, mainCalibrationLevel, behaviorRole, ...legacy } =
      snapshot();
    void mainCapability;
    void mainAuthority;
    void mainCalibrationLevel;
    void behaviorRole;
    const capability = resolveMainCapability({ snapshot: legacy as ProductBehaviorSnapshot });
    // MAIN_PROFILE_SPECIFIC with no envelope is the historical "blocked policy"
    // state; it is a calibration gap, so the honest answer is user-held.
    expect(capability.state).toBe('MAIN_CAPABLE_UNCALIBRATED');
  });

  it('a legacy MAIN_BLOCKED_POLICY row becomes user-held rather than blocked', () => {
    const legacy = snapshot({ mainClassification: 'MAIN_BLOCKED_POLICY' });
    delete (legacy as Partial<ProductBehaviorSnapshot>).mainCapability;
    delete (legacy as Partial<ProductBehaviorSnapshot>).behaviorRole;
    expect(resolveMainCapability({ snapshot: legacy }).state).toBe('MAIN_CAPABLE_UNCALIBRATED');
  });

  it('a legacy structural row stays blocked', () => {
    const legacy = snapshot({ mainClassification: 'NOT_MAIN' });
    delete (legacy as Partial<ProductBehaviorSnapshot>).mainCapability;
    delete (legacy as Partial<ProductBehaviorSnapshot>).behaviorRole;
    expect(resolveMainCapability({ snapshot: legacy }).state).toBe('MAIN_TECHNICAL_BLOCKED');
  });
});

describe('multi-main groups (§19, §21)', () => {
  const items = [
    { id: 'main-a', lock_type: 'main' },
    { id: 'main-b', lock_type: 'main' },
    { id: 'sugar', lock_type: 'unlocked' },
  ];

  it('two calibrated Mains keep the calibrated envelope', () => {
    const held = userHeldMainLineIds({
      items,
      snapshots: {
        'main-a': calibrated({ lineId: 'main-a' }),
        'main-b': calibrated({ lineId: 'main-b' }),
      },
    });
    expect(held).toEqual([]);
  });

  it('mixing a calibrated and an uncalibrated Main makes the WHOLE group user-held', () => {
    const held = userHeldMainLineIds({
      items,
      snapshots: {
        'main-a': calibrated({ lineId: 'main-a' }),
        'main-b': snapshot({ lineId: 'main-b' }),
      },
    });
    // §21: no cross-family calibration is invented from one member's science.
    expect(held).toEqual(['main-a', 'main-b']);
  });

  it('a non-Main line is never user-held', () => {
    const held = userHeldMainLineIds({
      items,
      snapshots: {
        'main-a': snapshot({ lineId: 'main-a' }),
        'main-b': snapshot({ lineId: 'main-b' }),
      },
    });
    expect(held).not.toContain('sugar');
  });

  it('Owner Review technical-only Main seeds stay outside the user-held group', () => {
    const held = userHeldMainLineIds({
      items,
      snapshots: {
        'main-a': snapshot({ lineId: 'main-a' }),
        'main-b': snapshot({ lineId: 'main-b' }),
      },
      excludeLineIds: ['main-a', 'main-b'],
    });
    expect(held).toEqual([]);
  });
});

describe('server projection (§26)', () => {
  const resolved = (
    capability: 'MAIN_CAPABLE' | 'MAIN_CAPABLE_UNCALIBRATED' | 'MAIN_TECHNICAL_BLOCKED',
    mainPolicy: typeof CALIBRATED_POLICY | null,
  ) => ({
    schemaVersion: 1 as const,
    resolverVersion: 'unified-product-behavior-v2',
    entityKind: 'mapper' as const,
    productId: 'product-1',
    productVersionId: 'version-1',
    factsFingerprint: 'facts-1',
    catalogStatus: 'verified' as const,
    provenance: 'mapper',
    behaviorBindingId: 'binding-1',
    behaviorBindingVersion: 'v1',
    taxonomyVersion: 'pinguino-product-taxonomy-v1',
    mapperIngredientId: 'PI-ING-000345',
    familyId: 'fruit',
    subfamilyId: 'banana',
    formId: 'fresh',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC' as const,
    mainCapability: capability,
    mainAuthority: (capability === 'MAIN_CAPABLE' ? 'CALIBRATED' : 'USER_HELD') as
      'CALIBRATED' | 'USER_HELD',
    mainCalibrationLevel: (mainPolicy ? 'EXACT_PRODUCT' : 'NONE') as 'EXACT_PRODUCT' | 'NONE',
    mainEligibility: 'MAIN_PROFILE_SPECIFIC' as const,
    veganEligibility: 'unknown' as const,
    proteinBehavior: 'neutral' as const,
    processBehavior: {},
    approvedLiquidDairyCarrier: false,
    context: {},
    module: 'MAIN' as const,
    state: 'eligible' as const,
    moduleEligibility: { BASE_RECIPE: 'eligible' as const },
    mainPolicy,
    warnings: [],
    blockReasons:
      capability === 'MAIN_CAPABLE_UNCALIBRATED' ? ['main_user_held_no_calibration'] : [],
  });

  it('an uncalibrated flavour carrier is stored MAIN-eligible with no envelope', () => {
    const stored = snapshotServerResolvedProductBehavior({
      lineId: 'line-1',
      processScope: 'BASE_FORMULATION',
      resolved: resolved('MAIN_CAPABLE_UNCALIBRATED', null),
    });
    expect(stored.moduleEligibility.MAIN).toBe('eligible');
    expect(stored.mainCapability).toBe('MAIN_CAPABLE_UNCALIBRATED');
    expect(stored.mainPolicyId).toBeNull();
    expect(hasCalibratedMainEnvelope(stored)).toBe(false);
    expect(resolveMainCapability({ snapshot: stored }).userHeld).toBe(true);
  });

  it('a technically blocked product is stored MAIN-blocked', () => {
    const stored = snapshotServerResolvedProductBehavior({
      lineId: 'line-1',
      processScope: 'BASE_FORMULATION',
      resolved: { ...resolved('MAIN_TECHNICAL_BLOCKED', null), behaviorRole: 'STRUCTURAL_ONLY' },
    });
    expect(stored.moduleEligibility.MAIN).toBe('blocked');
    expect(resolveMainCapability({ snapshot: stored }).selectable).toBe(false);
  });

  it('a calibrated product keeps its envelope end to end', () => {
    const stored = snapshotServerResolvedProductBehavior({
      lineId: 'line-1',
      processScope: 'BASE_FORMULATION',
      resolved: resolved('MAIN_CAPABLE', CALIBRATED_POLICY),
    });
    expect(stored.optimalCeilingPercent).toBe(60);
    expect(hasCalibratedMainEnvelope(stored)).toBe(true);
    expect(resolveMainCapability({ snapshot: stored }).calibrationLevel).toBe('EXACT_PRODUCT');
  });
});

describe('architecture guard (§24, §39)', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const MAIN_AUTHORITY_SOURCES = [
    'src/features/product-intelligence/mainCapability.ts',
    'src/features/product-intelligence/productBehaviorAccess.ts',
    'src/features/product-intelligence/mainEnvelope.ts',
    'src/features/product-intelligence/productBehaviorResolver.ts',
  ];

  it('no Main capability source decides eligibility from an exact ingredient id', () => {
    for (const relative of MAIN_AUTHORITY_SOURCES) {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      expect(source, `${relative} must not contain a PI-ING identity literal`).not.toMatch(
        /PI-ING-\d{6}/,
      );
    }
  });

  it('the server capability layer never gates MAIN on an exact ingredient id', () => {
    const migration = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20260823130000_global_main_capability_authority.sql'),
      'utf8',
    );
    const capabilityFn = migration.slice(
      migration.indexOf('create or replace function public.main_capability_v1'),
      migration.indexOf('revoke all on function public.main_capability_v1'),
    );
    expect(capabilityFn.length).toBeGreaterThan(0);
    expect(capabilityFn).not.toMatch(/PI-ING-\d{6}/);
  });
});

describe('full Mapper audit artifact (§12, §38)', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const rows = fs
    .readFileSync(path.join(ROOT, 'reports/MAIN_CAPABILITY_MAPPER_AUDIT.csv'), 'utf8')
    .trim()
    .split('\n');
  const header = rows[0]!.split(',');
  const index = (column: string) => header.indexOf(column);
  const cells = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else quoted = false;
        } else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const byId = new Map(
    rows.slice(1).map((line) => {
      const parts = cells(line);
      return [parts[index('ingredient_id')]!, parts];
    }),
  );
  const capabilityOf = (id: string) => byId.get(id)?.[index('capability')];

  it('covers every active Mapper row exactly once', () => {
    expect(rows.length - 1).toBe(2089);
    expect(byId.size).toBe(2089);
  });

  it('matches the counts proved on the staging authority', () => {
    const counts = [...byId.values()].reduce<Record<string, number>>((acc, parts) => {
      const key = parts[index('capability')]!;
      return { ...acc, [key]: (acc[key] ?? 0) + 1 };
    }, {});
    expect(counts).toEqual({
      MAIN_CAPABLE: 110,
      MAIN_CAPABLE_UNCALIBRATED: 1282,
      MAIN_TECHNICAL_BLOCKED: 697,
    });
  });

  it.each([
    ['PI-ING-001553', 'MAIN_CAPABLE'], // strawberry, exact Sorbet 60 %
    ['PI-ING-000369', 'MAIN_CAPABLE'], // lime, exact Sorbet 60 %
    ['PI-ING-000340', 'MAIN_CAPABLE'], // mango puree, exact Sorbet 60 %
    ['PI-ING-000345', 'MAIN_CAPABLE'], // banana fresh
    ['PI-ING-001589', 'MAIN_CAPABLE'], // banana puree
    ['PI-ING-000394', 'MAIN_CAPABLE'], // raspberries
    ['PI-ING-000366', 'MAIN_CAPABLE'], // kiwi
    ['PI-ING-000614', 'MAIN_CAPABLE'], // pistachio paste
    ['PI-ING-001578', 'MAIN_CAPABLE'], // cocoa
    ['PI-ING-000166', 'MAIN_CAPABLE_UNCALIBRATED'], // ground coffee
  ])('%s is %s', (id, expected) => {
    expect(capabilityOf(id)).toBe(expected);
  });

  it.each([
    'PI-ING-001409', // water
    'PI-ING-000514', // sucrose
    'PI-ING-000494', // dextrose
    'PI-ING-000496', // fructose
    'PI-ING-000456', // inulin
    'PI-ING-000492', // tara gum
    'PI-ING-000472', // guar gum
    'PI-ING-000475', // locust bean gum
    'PI-ING-000458', // salt
  ])('technical control %s is blocked', (id) => {
    expect(capabilityOf(id)).toBe('MAIN_TECHNICAL_BLOCKED');
  });

  it('no product in a technical Mapper category is Main-capable', () => {
    const technical = new Set([
      'sweetener',
      'stabilizer',
      'fiber',
      'emulsifier',
      'starch',
      'acid',
      'colorant',
      'functional_additive',
      'additive',
      'protein',
    ]);
    const leaked = [...byId.values()].filter(
      (parts) =>
        technical.has(parts[index('category')]!) &&
        parts[index('capability')] !== 'MAIN_TECHNICAL_BLOCKED',
    );
    expect(leaked.map((parts) => parts[index('ingredient_id')])).toEqual([]);
  });
});
