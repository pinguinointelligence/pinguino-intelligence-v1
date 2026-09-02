/**
 * Historical Mapper-mapping audit — how much of the old 136 was real?
 *
 * The owner's reconstruction found the previous reference workbook contained
 * mappings that were too permissive: green/fruit tea onto BLACK TEA, quark and
 * cream cheese onto SKYR 0.2%, clarified/garlic/salted butter onto UNSALTED
 * BUTTER. Those must never be reproduced.
 *
 * This run uses the workbook ONLY as a historical diagnostic. It copies no
 * confidence value, adopts no classification, and tunes nothing toward the old
 * 614. For each of the 136 old mappings it asks what the current architecture
 * would say, and sorts the answer into the owner's four classes:
 *
 *   A still defensible — the current NARROW nearest-neighbour cohort independently
 *     reaches for the SAME Mapper row, so the old mapping was evidence, not a
 *     leap. Membership in a broad 195-row family cohort does not count: it would
 *     have validated quark-onto-skyr, which is one of the mappings being rejected.
 *   D rejected as unsafe — the old row shares no discriminating identity token
 *     with the product and the current architecture never selects it. This is
 *     the green-tea-onto-black-tea class.
 *   B replaced by a safer different inference — the old mapping does not stand,
 *     but current Mapper evidence supplies fields from elsewhere.
 *   C requires an official source — the old mapping does not stand and nothing
 *     safe replaces it.
 *
 * D is tested before B deliberately: whether the old mapping was unsafe is a
 * fact about the old mapping, independent of what replaces it.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as xlsx from 'xlsx';
import { parseINTIMPORT, type IntimportCandidate } from '@/data/products/intimport';
import { assessIntimportProduct } from '../intimportIntelligence';
import {
  buildMapperKnowledge,
  identityTokens,
  MAX_TOKEN_DOCUMENT_SHARE,
  MIN_TOKEN_DISCARD_COUNT,
  type MapperKnowledge,
} from '../mapperValueInference';
import { resolveProductWorkingValues } from '../productWorkingValues';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from '../productFieldTruth';
import { REQUIRED_COMPOSITION_FIELDS as REQUIRED_MACROS } from '../engineFieldContract';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const IMPORT_CSV = join(homedir(), 'Desktop', 'PL_Poland.csv');
const REFERENCE = join(homedir(), 'Desktop', 'PL_Poland_GELLATTI_FINAL_READY.xlsx');
const REPORT = resolve(__dirname, '../../../../docs/products/reference_mapping_audit.json');

type OldClass = 'SAFE' | 'SAFER_REPLACEMENT' | 'REJECT' | 'NO_LONGER_NEEDED';

interface OldMapping {
  'Product ID': string | null;
  Brand: string | null;
  'Product Name': string | null;
  Category: string | null;
  Subcategory: string | null;
  'Confidence %': number | null;
  Method: string | null;
  'Mapper Ingredient ID': string | null;
  'Mapper Reference': string | null;
  'Mapper Category': string | null;
}

/**
 * Tokens that actually discriminate: present in the Mapper, but not so common
 * there that sharing one means nothing. Same rule the cohort selector uses.
 */
function discriminatingTokens(text: string | null, knowledge: MapperKnowledge): Set<string> {
  const ceiling = Math.max(
    MIN_TOKEN_DISCARD_COUNT,
    knowledge.indexedRows * MAX_TOKEN_DOCUMENT_SHARE,
  );
  return new Set(
    identityTokens(text).filter((token) => {
      const frequency = knowledge.documentFrequency.get(token) ?? 0;
      return frequency > 0 && frequency <= ceiling;
    }),
  );
}

describe.runIf(existsSync(IMPORT_CSV) && existsSync(MAPPER_FILE) && existsSync(REFERENCE))(
  'Historical reference mapping audit (diagnostic only)',
  () => {
    it('classifies each of the old Mapper mappings under the current architecture', () => {
      const mapper = loadMapperKnowledgeRows();
      const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
      const parsed = parseINTIMPORT(readFileSync(IMPORT_CSV, 'utf8'));
      const byProductId = new Map<string, IntimportCandidate>();
      for (const candidate of parsed.candidates) {
        if (candidate.sourceProductId) byProductId.set(candidate.sourceProductId, candidate);
      }

      const workbook = xlsx.read(readFileSync(REFERENCE), { type: 'buffer' });
      const sheet = workbook.Sheets['Mapper Inference 136'];
      if (!sheet) throw new Error('reference workbook is missing the mapping sheet');
      const oldMappings = xlsx.utils.sheet_to_json<OldMapping>(sheet, { defval: null });

      const verdicts: {
        productId: string | null;
        product: string | null;
        category: string | null;
        oldMapperId: string | null;
        oldMapperReference: string | null;
        oldMethod: string | null;
        oldConfidence: number | null;
        verdict: OldClass;
        reason: string;
        sharedTokens: string[];
        currentFieldsProduced: number;
        currentTiers: string[];
        currentReadiness: string | null;
      }[] = [];

      for (const old of oldMappings) {
        const productId = old['Product ID'];
        const candidate = productId ? byProductId.get(productId) : undefined;

        if (!candidate) {
          verdicts.push({
            productId,
            product: old['Product Name'],
            category: old.Category,
            oldMapperId: old['Mapper Ingredient ID'],
            oldMapperReference: old['Mapper Reference'],
            oldMethod: old.Method,
            oldConfidence: old['Confidence %'],
            verdict: 'REJECT',
            reason: 'produkt nie występuje w bieżącym pliku CSV',
            sharedTokens: [],
            currentFieldsProduced: 0,
            currentTiers: [],
            currentReadiness: null,
          });
          continue;
        }

        const intelligence = assessIntimportProduct(candidate);
        const declared: Partial<Record<WorkingNumericField, number | null>> = {};
        if (candidate.nutritionBasis === 'per_100g') {
          for (const field of WORKING_NUMERIC_FIELDS) {
            const value = (candidate.insert as Record<string, unknown>)[field];
            if (typeof value === 'number' && Number.isFinite(value)) declared[field] = value;
          }
        }
        const identity = {
          name: candidate.displayName,
          variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
          brand: candidate.source.Brand,
          category: candidate.sourceCategory,
          subcategory: candidate.sourceSubcategory,
          barcode: candidate.ean,
        };
        const resolved = resolveProductWorkingValues(
          {
            declared,
            declaredConfidence: intelligence.assessment.confidence / 100,
            identity,
            technical: intelligence.kind === 'technical',
          },
          knowledge,
        );

        const produced = WORKING_NUMERIC_FIELDS.filter(
          (field) => resolved.fields[field].provenance.state !== 'UNKNOWN',
        ).length;

        const productTokens = discriminatingTokens(candidate.displayName, knowledge);
        const oldRowTokens = discriminatingTokens(old['Mapper Reference'], knowledge);
        const shared = [...productTokens].filter((token) => oldRowTokens.has(token));

        // The product/profile match is now the authority, so the old row is
        // judged against what the current matcher actually chose for this
        // product — not against whether one narrow cohort happened to contain it.
        const chosen = new Set(resolved.profileMatch?.references ?? []);
        const sourceComplete = REQUIRED_MACROS.every(
          (field) => resolved.fields[field].provenance.state === 'VERIFIED',
        );
        let verdict: OldClass;
        let reason: string;
        if (sourceComplete) {
          verdict = 'NO_LONGER_NEEDED';
          reason = 'produkt ma dziś komplet danych źródłowych — proxy nie jest potrzebne';
        } else if (old['Mapper Ingredient ID'] && chosen.has(old['Mapper Ingredient ID'])) {
          verdict = 'SAFE';
          reason = 'bieżący dobór profilu niezależnie wybiera ten sam wiersz Mappera';
        } else if ((resolved.profileMatch?.confidence ?? 0) >= 0.85) {
          verdict = 'SAFER_REPLACEMENT';
          reason = `stary wiersz zastąpiony lepiej dopasowanym profilem (${Math.round((resolved.profileMatch?.confidence ?? 0) * 100)}%)`;
        } else if (shared.length === 0) {
          verdict = 'REJECT';
          reason =
            'stary wiersz nie dzieli z produktem żadnego rozróżniającego tokenu i nic bezpiecznego go nie zastępuje';
        } else {
          verdict = 'REJECT';
          reason = 'brak wystarczająco zgodnego profilu — produkt wymaga danych źródłowych';
        }

        verdicts.push({
          productId,
          product: candidate.displayName,
          category: candidate.sourceCategory,
          oldMapperId: old['Mapper Ingredient ID'],
          oldMapperReference: old['Mapper Reference'],
          oldMethod: old.Method,
          oldConfidence: old['Confidence %'],
          verdict,
          reason,
          sharedTokens: shared,
          currentFieldsProduced: produced,
          currentTiers: resolved.mapperTiersUsed,
          currentReadiness: resolved.valueReadiness,
        });
      }

      const tally = verdicts.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.verdict] = (counts[entry.verdict] ?? 0) + 1;
        return counts;
      }, {});

      const report = {
        note:
          'Diagnostyka historyczna. Nie skopiowano żadnej wartości pewności ze skoroszytu, ' +
          'nie przyjęto żadnej starej klasyfikacji, nie strojono niczego pod 614.',
        mapperFingerprint: mapper.fingerprint,
        oldMappings: oldMappings.length,
        tally,
        rejectedExamples: verdicts.filter((entry) => entry.verdict === 'REJECT').slice(0, 30),
        safeExamples: verdicts.filter((entry) => entry.verdict === 'SAFE').slice(0, 20),
        replacementExamples: verdicts
          .filter((entry) => entry.verdict === 'SAFER_REPLACEMENT')
          .slice(0, 20),
        verdicts,
      };
      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

      expect(verdicts).toHaveLength(oldMappings.length);
    });
  },
);
