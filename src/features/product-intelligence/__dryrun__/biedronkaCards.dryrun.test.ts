/**
 * Measure the Biedronka product-card pack across the whole Poland import.
 *
 * Costs nothing here: the cards were fetched separately from URLs the owner's
 * own export already names, with no search and no crawling. This run only
 * merges that evidence and measures the difference.
 *
 * Authority is decided per product. The owner's export marks which rows are
 * private label, and only those get first-party standing on the shop's own
 * domain — Milka and Alpro sold in the same shop stay retailer evidence.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT, type IntimportCandidate } from '@/data/products/intimport';
import { assessIntimportProduct } from '../intimportIntelligence';
import { buildMapperKnowledge } from '../mapperValueInference';
import {
  ENGINE_REQUIRED_WORKING_FIELDS,
  resolveProductWorkingValues,
  type ValueReadiness,
} from '../productWorkingValues';
import { REQUIRED_COMPOSITION_FIELDS as REQUIRED_MACROS } from '../engineFieldContract';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from '../productFieldTruth';
import {
  assessCardIdentity,
  cardContribution,
  type CardAuthority,
  type IdentityVerdict,
  type SourceCardFacts,
} from '../productSourceCard';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const IMPORT_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const CARDS_FILE = resolve(__dirname, '../../../../docs/products/biedronka_cards.json');
const REPORT = resolve(__dirname, '../../../../docs/products/biedronka_pack_result.json');

interface FetchedCard {
  productId: string;
  url: string;
  httpStatus: number;
  error: string | null;
  card: {
    heading: string | null;
    basis: 'per_100g' | 'per_100ml' | null;
    nutrition: Record<string, number>;
    ingredients: string | null;
    allergens: string | null;
  } | null;
}

type Outcome =
  | 'FETCHED_MATCHED'
  | 'FETCHED_NO_NUTRITION'
  | 'FETCHED_IDENTITY_MISMATCH'
  | 'FETCHED_AMBIGUOUS'
  | 'PER_100_ML_ONLY'
  | 'HTTP_NOT_AVAILABLE'
  | 'PARSE_FAILED';

const clean = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed && !['not_found', 'not_applicable'].includes(trimmed) ? trimmed : null;
};

describe.runIf(existsSync(IMPORT_FILE) && existsSync(MAPPER_FILE) && existsSync(CARDS_FILE))(
  'Biedronka card pack',
  () => {
    it('measures the gain across all 820 products', () => {
      const mapper = loadMapperKnowledgeRows();
      const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
      const parsed = parseINTIMPORT(readFileSync(IMPORT_FILE, 'utf8'));
      const fetched: FetchedCard[] = JSON.parse(readFileSync(CARDS_FILE, 'utf8'));
      const byProductId = new Map(fetched.map((entry) => [entry.productId, entry]));

      const declaredOf = (
        candidate: IntimportCandidate,
      ): Partial<Record<WorkingNumericField, number | null>> => {
        if (candidate.nutritionBasis !== 'per_100g') return {};
        const declared: Partial<Record<WorkingNumericField, number | null>> = {};
        for (const field of WORKING_NUMERIC_FIELDS) {
          const value = (candidate.insert as Record<string, unknown>)[field];
          if (typeof value === 'number' && Number.isFinite(value)) declared[field] = value;
        }
        return declared;
      };

      const emptyCounts = (): Record<ValueReadiness, number> => ({
        READY: 0,
        ESTIMATED_READY: 0,
        REVIEW: 0,
      });
      const before = emptyCounts();
      const after = emptyCounts();
      const outcomes: Record<string, number> = {};
      const verdicts: Record<string, number> = {};
      const authorityTally = (key: string): { products: number; fields: number } => {
        const existing = byAuthority[key];
        if (existing) return existing;
        const created = { products: 0, fields: 0 };
        byAuthority[key] = created;
        return created;
      };
      const byAuthority: Record<string, { products: number; fields: number }> = {
        OFFICIAL_PRIVATE_LABEL: { products: 0, fields: 0 },
        AUTHORITATIVE_RETAILER: { products: 0, fields: 0 },
      };
      let fieldsUpgraded = 0;
      let estimatedBefore = 0;
      let estimatedAfter = 0;
      let per100gCards = 0;
      let per100mlCards = 0;
      let eanMatches = 0;
      let productsImproved = 0;
      let verifiedEngineFieldsBefore = 0;
      let verifiedEngineFieldsAfter = 0;
      let missingEngineBefore = 0;
      let missingEngineAfter = 0;
      const blockers: Record<string, number> = {};
      const truthStateAfter = { VERIFIED: 0, ESTIMATED: 0, UNKNOWN: 0 };
      const truthStateBefore = { VERIFIED: 0, ESTIMATED: 0, UNKNOWN: 0 };
      let completeProfileBefore = 0;
      let completeProfileAfter = 0;
      let indirectlyEnabled = 0;
      let gainedWaterSolids = 0;
      let gainedDerivedComplement = 0;
      let indirectRetailerUnlock = 0;
      const transition: Record<string, number> = {};
      const upgrades: unknown[] = [];

      const usable = parsed.candidates.filter(
        (candidate) => candidate.state !== 'INVALID' && candidate.state !== 'DUPLICATE',
      );

      for (const candidate of usable) {
        const intelligence = assessIntimportProduct(candidate);
        const base = {
          declared: declaredOf(candidate),
          declaredConfidence: intelligence.assessment.confidence / 100,
          identity: {
            name: candidate.displayName,
            variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
            brand: candidate.source.Brand,
            category: candidate.sourceCategory,
            subcategory: candidate.sourceSubcategory,
            barcode: candidate.ean,
          },
          technical: intelligence.kind === 'technical',
          technicalAuthority: false,
        };

        const priorResolution = resolveProductWorkingValues(base, knowledge);
        before[priorResolution.valueReadiness] += 1;
        const priorEstimated = WORKING_NUMERIC_FIELDS.filter(
          (field) => priorResolution.fields[field].provenance.state === 'ESTIMATED',
        );
        if (priorEstimated.length > 0) estimatedBefore += 1;

        const entry = candidate.sourceProductId
          ? byProductId.get(candidate.sourceProductId)
          : undefined;
        let contribution = null;
        // Assigned on every path inside the `entry` block, and only read there.
        let outcome: Outcome;
        let verdict: IdentityVerdict | null = null;

        if (entry) {
          if (entry.httpStatus !== 200) {
            outcome = 'HTTP_NOT_AVAILABLE';
          } else if (!entry.card) {
            outcome = 'PARSE_FAILED';
          } else {
            const facts: SourceCardFacts = {
              url: entry.url,
              heading: entry.card.heading,
              basis: entry.card.basis,
              nutrition: entry.card.nutrition,
              ingredients: entry.card.ingredients,
              allergens: entry.card.allergens,
              barcode: null,
            };
            const identity = assessCardIdentity(
              {
                brand: clean(candidate.source.Brand),
                name: candidate.displayName,
                variant: clean(candidate.source['Variant Original']),
                netQuantityValue: clean(candidate.source['Net Quantity Value']),
                netQuantityUnit: clean(candidate.source['Net Quantity Unit']),
                barcode: candidate.ean,
              },
              facts,
            );
            verdict = identity.verdict;
            if (identity.verdict === 'EXACT_EAN_MATCH') eanMatches += 1;

            // Per-product authority, from the owner's own private-label marking.
            const authority: CardAuthority =
              clean(candidate.source['Product Type']) === 'private_label'
                ? 'OFFICIAL_PRIVATE_LABEL'
                : 'AUTHORITATIVE_RETAILER';

            if (identity.verdict === 'MISMATCH') outcome = 'FETCHED_IDENTITY_MISMATCH';
            else if (identity.verdict === 'AMBIGUOUS') outcome = 'FETCHED_AMBIGUOUS';
            else if (entry.card.basis === 'per_100ml') {
              outcome = 'PER_100_ML_ONLY';
              per100mlCards += 1;
            } else if (Object.keys(entry.card.nutrition).length === 0) {
              outcome = 'FETCHED_NO_NUTRITION';
            } else {
              contribution = cardContribution(facts, authority, identity.verdict);
              if (Object.keys(contribution.fields).length === 0) {
                outcome = 'FETCHED_NO_NUTRITION';
                contribution = null;
              } else {
                outcome = 'FETCHED_MATCHED';
                per100gCards += 1;
                authorityTally(authority).products += 1;
              }
            }
          }
          outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
          if (verdict) verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
        }

        const nextResolution = contribution
          ? resolveProductWorkingValues({ ...base, sourceCard: contribution }, knowledge)
          : priorResolution;
        after[nextResolution.valueReadiness] += 1;
        verifiedEngineFieldsBefore += ENGINE_REQUIRED_WORKING_FIELDS.filter(
          (field) => priorResolution.fields[field].provenance.state === 'VERIFIED',
        ).length;
        verifiedEngineFieldsAfter += ENGINE_REQUIRED_WORKING_FIELDS.filter(
          (field) => nextResolution.fields[field].provenance.state === 'VERIFIED',
        ).length;
        missingEngineBefore += priorResolution.missingEngineFields.length;
        missingEngineAfter += nextResolution.missingEngineFields.length;

        for (const field of ENGINE_REQUIRED_WORKING_FIELDS) {
          truthStateBefore[priorResolution.fields[field].provenance.state] += 1;
          truthStateAfter[nextResolution.fields[field].provenance.state] += 1;
        }
        if (priorResolution.missingEngineFields.length === 0) completeProfileBefore += 1;
        if (nextResolution.missingEngineFields.length === 0) completeProfileAfter += 1;
        // §18: readiness that exists ONLY because retailer macros arrived.
        if (
          priorResolution.valueReadiness === 'REVIEW' &&
          nextResolution.valueReadiness !== 'REVIEW'
        ) {
          indirectlyEnabled += 1;
        }

        // §21/§22: what happened to the products that had no water or solids.
        const hadNoMass =
          priorResolution.fields.water_percent.value === null &&
          priorResolution.fields.total_solids_percent.value === null;
        const nowHasMass =
          nextResolution.fields.water_percent.value !== null ||
          nextResolution.fields.total_solids_percent.value !== null;
        const waterProv = nextResolution.fields.water_percent.provenance;
        const solidsProv = nextResolution.fields.total_solids_percent.provenance;
        if (nowHasMass && waterProv.confidence >= 0.85) gainedWaterSolids += 1;
        if (solidsProv.basis === 'derived' || waterProv.basis === 'derived') {
          gainedDerivedComplement += 1;
        }
        if (hadNoMass) {
          const f = nextResolution.fields;
          let landed: string;
          if (!nowHasMass) landed = 'still_no_water_solids';
          else if (nextResolution.contradictedByDeclaration) landed = 'physical_conflict';
          else if (REQUIRED_MACROS.some((field) => f[field].value === null)) {
            landed = 'now_only_macro_blocked';
          } else if (!nextResolution.sweetnessPath.resolved) {
            landed = 'now_only_sugar_split_blocked';
          } else if ((nextResolution.engineConfidence ?? 0) < 0.85) {
            landed = 'still_weak_confidence';
          } else landed = 'completed_and_ready';
          transition[landed] = (transition[landed] ?? 0) + 1;
          // §14: did exact retailer macros make the moisture cohort specific
          // enough to clear the bar?
          if (
            landed !== 'still_no_water_solids' &&
            contribution &&
            waterProv.confidence >= 0.85
          ) {
            indirectRetailerUnlock += 1;
          }
        }

        // §17: name the exact reason a product is still not engine-ready.
        if (nextResolution.valueReadiness === 'REVIEW') {
          const f = nextResolution.fields;
          const massBalance =
            f.water_percent.value !== null || f.total_solids_percent.value !== null;
          let blocker: string;
          if (nextResolution.contradictedByDeclaration) blocker = 'physical_inconsistency';
          else if (!massBalance) blocker = 'missing_water_solids';
          else if (
            REQUIRED_MACROS.some((field) => f[field].value === null)
          ) {
            blocker = 'missing_required_macro';
          } else if (!nextResolution.sweetnessPath.resolved) {
            blocker =
              nextResolution.sweetnessPath.kind === 'unresolved' &&
              (f.polyol_percent.value ?? 0) > 0
                ? 'polyol_unsupported_by_engine'
                : 'missing_sugar_split';
          } else if ((nextResolution.engineConfidence ?? 0) < 0.85) {
            blocker = 'weak_field_confidence';
          } else blocker = 'other';
          blockers[blocker] = (blockers[blocker] ?? 0) + 1;
        }
        if (
          WORKING_NUMERIC_FIELDS.some(
            (field) => nextResolution.fields[field].provenance.state === 'ESTIMATED',
          )
        ) {
          estimatedAfter += 1;
        }

        if (contribution) {
          const authority =
            clean(candidate.source['Product Type']) === 'private_label'
              ? 'OFFICIAL_PRIVATE_LABEL'
              : 'AUTHORITATIVE_RETAILER';
          // Count only fields that were an ESTIMATE before and are measured now.
          const upgraded = WORKING_NUMERIC_FIELDS.filter(
            (field) =>
              priorResolution.fields[field].provenance.state !== 'VERIFIED' &&
              nextResolution.fields[field].provenance.state === 'VERIFIED',
          );
          fieldsUpgraded += upgraded.length;
          if (upgraded.length > 0) productsImproved += 1;
          authorityTally(authority).fields += upgraded.length;
          if (upgrades.length < 12) {
            upgrades.push({
              productId: candidate.sourceProductId,
              name: candidate.displayName,
              authority,
              upgraded,
              readinessBefore: priorResolution.valueReadiness,
              readinessAfter: nextResolution.valueReadiness,
            });
          }
        }
      }

      const report = {
        totalProducts: usable.length,
        cardsInDataset: fetched.length,
        uniqueUrls: new Set(fetched.map((entry) => entry.url)).size,
        successfullyFetched: fetched.filter((entry) => entry.httpStatus === 200).length,
        identityVerdicts: verdicts,
        exactEanMatches: eanMatches,
        outcomes,
        cardsPer100g: per100gCards,
        cardsPer100ml: per100mlCards,
        fieldsUpgradedToVerified: fieldsUpgraded,
        productsMateriallyImproved: productsImproved,
        verifiedEngineFieldsBefore,
        verifiedEngineFieldsAfter,
        missingEngineFieldsBefore: missingEngineBefore,
        missingEngineFieldsAfter: missingEngineAfter,
        productsWithEstimatedFieldBefore: estimatedBefore,
        productsWithEstimatedFieldAfter: estimatedAfter,
        readinessBefore: before,
        readinessAfter: after,
        engineFieldTruthStateBefore: truthStateBefore,
        engineFieldTruthStateAfter: truthStateAfter,
        completeProfileBefore,
        completeProfileAfter,
        readyOnlyBecauseOfRetailerMacros: indirectlyEnabled,
        remainingBlockers: blockers,
        gainedWaterSolidsAtOrAbove85: gainedWaterSolids,
        derivedComplementsAdded: gainedDerivedComplement,
        indirectRetailerUnlock,
        waterSolidsTransition: transition,
        byAuthority,
        sampleUpgrades: upgrades,
      };
      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
      expect(report.totalProducts).toBe(820);
    });
  },
);
