// Builds the GELATO base country-product registry from a parsed owner workbook
// plus the committed read-only catalog snapshot. One builder serves every
// workbook version: a registry profile (V12_REGISTRY_PROFILE and
// V23_REGISTRY_PROFILE at the end of this file) names the registry, the key
// namespace and the workbook trail (current sync + open-case ledger); identity,
// dedupe, readiness and route logic are shared.
//
// Owner rules enforced here (see reports/COUNTRY_PRODUCTS_V12_*.md and
// reports/COUNTRY_PRODUCTS_V23_*.md):
// - exact country products are PR-ING proposals, never new PI-ING; the six base
//   slots map only to existing PIs and the Mapper is not touched;
// - identities are deduplicated before anything is proposed: same GTIN = one
//   product with several market routes; different GTIN / pack / article = never
//   merged; name similarity alone never merges;
// - v12 is partial: open research stays open, nothing is forced to 75/75 and no
//   missing product is replaced by a guessed one;
// - v23 is FINAL for the six base roles: no selection is reopened or changed,
//   and the v23 workbook status and activation condition stay visible per
//   selection; a status that is not a PR candidate never gets a DB route;
// - TARA is one functional STABILIZER option, not a mandatory ingredient;
// - unknown values stay null and are listed as REVIEW_REQUIRED.

import {
  cleanText,
  codeTokens,
  compareText,
  extractUrls,
  foldForComparison,
  iso2FromCountryCell,
  keySlug,
  parsePackage,
  shortHash,
  splitLines,
  uniqueSorted,
} from './text.mjs';
import {
  digitsOnly,
  gtinComparisonKey,
  gtinSymbology,
  isRestrictedCirculationGtin,
  isValidGtin,
  toGtin14,
} from './gtin.mjs';
import {
  CALCULATION_SHEET_BY_SLOT,
  SELECTION_SHEET_BY_SLOT,
  SLOT_BY_WORKBOOK_ROLE,
  V12_WORKBOOK,
  WORKBOOK_ROLE_BY_SLOT,
  sheetsUsedByParser,
} from './workbookV12.mjs';
import { CHECKLIST_DECISION_GROUPS, V23_WORKBOOK, sheetsUsedByV23 } from './workbookV23.mjs';

export const REGISTRY_SCHEMA = 'gellatti.country-products.gelato-base.registry/v1';
export const REGISTRY_ID = 'GELATO_BASE_V12';
export const PROPOSAL_NAMESPACE = 'V12';
export const SLOT_ORDER = Object.freeze(['MILK', 'CREAM', 'SMP', 'SUCROSE', 'DEXTROSE', 'STABILIZER']);
export const EXACT_PRODUCT_SLOTS = Object.freeze(['MILK', 'CREAM', 'SMP', 'DEXTROSE', 'STABILIZER']);
export const BASE_SLOT_PI = Object.freeze({
  MILK: 'PI-ING-000236',
  CREAM: 'PI-ING-000180',
  SMP: 'PI-ING-000270',
  SUCROSE: 'PI-ING-000514',
  DEXTROSE: 'PI-ING-000494',
  STABILIZER: 'PI-ING-000492',
});
export const EXISTING_STABILIZER_PIS = Object.freeze({
  TARA: ['PI-ING-000492'],
  GUAR: ['PI-ING-000472'],
  LBG: ['PI-ING-000475', 'PI-ING-001384'],
  GELLATTI_STABILIZER_BLEND: ['PI-ING-002114'],
});
export const NUTRIENT_FIELDS = Object.freeze([
  'energyKcal',
  'fat',
  'saturatedFat',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
]);
const PROFILE_FIELDS = Object.freeze([...NUTRIENT_FIELDS, 'fibre']);
export const TEXT_INLINE_LIMIT = 120;
const GAP_ROLE_ORDER = Object.freeze(['CREAM', 'SMP', 'DEXTROSE', 'TARA']);

const ESTIMATE_ALIASES = Object.freeze({
  kcal: 'energyKcal',
  tłuszcz: 'fat',
  nasycone: 'saturatedFat',
  węglowodany: 'carbohydrate',
  'węglowodany dostępne': 'carbohydrate',
  cukry: 'sugars',
  sugars: 'sugars',
  białko: 'protein',
  sól: 'salt',
  błonnik: 'fibre',
  'fiber = model pi': 'fibre',
});

const GAP_CONDITION_CODES = Object.freeze({
  'DANE / ETYKIETA': 'LABEL_DATA',
  'GTIN / OPAKOWANIE': 'GTIN_OR_PACKAGE',
  'OFERTA / DOSTAWA': 'OFFER_OR_DELIVERY',
  ALERGENY: 'ALLERGENS',
  'PARTIA / COA': 'LOT_COA',
  'ENERGIA / TECHNOLOGIA': 'ENERGY_OR_TECHNOLOGY',
  HOLD_US: 'HOLD_US',
});

const GENERIC_BRAND = /unspecified|nieujawnion|niepodan|generic|bez marki|undisclosed/i;

const slotRank = (slot) => SLOT_ORDER.indexOf(slot);
const numberOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const textOrNull = (value) => (value === null || value === undefined ? null : String(value));

function fail(message) {
  throw new Error(`registry build refused: ${message}`);
}

function parseEstimatedList(text, ref) {
  const value = cleanText(text);
  if (!value || /^brak estymacji/i.test(value)) return [];
  return uniqueSorted(
    value.split(',').map((part) => {
      const key = part.trim().toLowerCase();
      const mapped = ESTIMATE_ALIASES[key];
      if (!mapped) fail(`unrecognised estimated-field token "${part.trim()}" in ${ref}`);
      return mapped;
    }),
  );
}

function gapConditionCodes(text, ref) {
  return splitLines(text).map((line) => {
    const code = GAP_CONDITION_CODES[line];
    if (!code) fail(`unrecognised gap condition "${line}" in ${ref}`);
    return code;
  });
}

function unionFind(size) {
  const parent = [...Array(size).keys()];
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  return { find, union };
}

function brandIsKnown(brand) {
  const value = cleanText(brand);
  return Boolean(value) && !GENERIC_BRAND.test(value);
}

function supplierRoot(text) {
  const words = foldForComparison(text).split(' ');
  return words.find((word) => word.length >= 4) ?? null;
}

function declaredBasisFor(slot, calcValues) {
  const portion = numberOrNull(calcValues.portion);
  const raw = cleanText(calcValues.basisUnit);
  const perPortion = portion !== null && portion !== 100;
  if (slot === 'MILK' || slot === 'CREAM') {
    if (raw === 'ml') return { declaredBasis: perPortion ? 'PER_PORTION_ML' : 'PER_100ML', raw };
    if (raw === 'g') return { declaredBasis: perPortion ? 'PER_PORTION_G' : 'PER_100G', raw };
    return { declaredBasis: 'AS_STATED_G_OR_ML', raw };
  }
  if (slot === 'SMP') {
    return { declaredBasis: perPortion ? 'PER_PORTION_G_DRY' : 'PER_100G_DRY', raw };
  }
  return { declaredBasis: perPortion ? 'PER_PORTION_G' : 'PER_100G', raw: null };
}

function derivationsFor(calcValues) {
  const derivations = [];
  const portion = numberOrNull(calcValues.portion);
  if (portion !== null && portion !== 100) derivations.push('PORTION_SCALED_TO_100');
  if (calcValues.energyKcal === null && calcValues.energyKj !== null) {
    derivations.push('ENERGY_KCAL_FROM_KJ_DIV_4_184');
  }
  if (calcValues.salt === null && calcValues.sodiumMg !== null) {
    derivations.push('SALT_FROM_SODIUM_X_2_5');
  }
  return derivations;
}

function estimatedFieldsFor(slot, selection, calculation) {
  switch (slot) {
    case 'CREAM':
      return parseEstimatedList(selection.values.estimatedFields, selection.ref);
    case 'SMP':
    case 'DEXTROSE':
    case 'STABILIZER':
      return parseEstimatedList(calculation.values.estimatedFields, calculation.ref);
    default:
      return [];
  }
}

function fibreFacts(slot, selection, calculation, estimated) {
  const raw = calculation.values.fibre;
  const working = numberOrNull(selection.values.fibre);
  if (typeof raw === 'string') {
    return { declared: null, working, declarationText: raw };
  }
  const declaredNumeric = typeof raw === 'number' && !estimated.includes('fibre');
  if (slot === 'SMP' && /błonnik:\s*PI-ING/i.test(String(calculation.values.method ?? ''))) {
    return { declared: null, working, declarationText: null };
  }
  return { declared: declaredNumeric ? working : null, working, declarationText: null };
}

function nutritionFor(slot, selection, calculation) {
  const estimated = estimatedFieldsFor(slot, selection, calculation);
  const fibre = fibreFacts(slot, selection, calculation, estimated);
  const working = {};
  const declared = {};
  const nonNumeric = {};
  for (const field of NUTRIENT_FIELDS) {
    const value = selection.values[field];
    working[field] = numberOrNull(value);
    if (value !== null && working[field] === null) nonNumeric[field] = String(value);
    declared[field] = estimated.includes(field) ? null : working[field];
  }
  working.fibre = fibre.working;
  declared.fibre = fibre.declared;
  const estimatedFibre = estimated.includes('fibre') || (fibre.working !== null && fibre.declared === null && !fibre.declarationText);
  const estimatedAll = uniqueSorted([...estimated, ...(estimatedFibre ? ['fibre'] : [])]);
  const basis = declaredBasisFor(slot, calculation.values);
  return {
    declaredBasis: basis.declaredBasis,
    rawBasisText: basis.raw,
    portion: {
      quantity: numberOrNull(calculation.values.portion),
      unitText: slot === 'MILK' || slot === 'CREAM' ? basis.raw : 'g',
    },
    workingBasis: 'PER_100G',
    normalization:
      basis.declaredBasis.includes('ML') || basis.declaredBasis === 'AS_STATED_G_OR_ML'
        ? 'GELLATTI_1ML_1G_NORMALIZATION'
        : null,
    derivations: derivationsFor(calculation.values),
    declared,
    workingProfile: working,
    estimatedFields: estimatedAll,
    missingFields: NUTRIENT_FIELDS.filter((field) => working[field] === null),
    nonNumericCells: nonNumeric,
    fibreDeclarationText: fibre.declarationText,
    workbookCompleteness: textOrNull(selection.values.completeness),
    carbohydrateConvention:
      slot === 'STABILIZER' ? textOrNull(selection.values.carbohydrateConvention) : null,
  };
}

function technicalSpecFor(slot, selection, calculation) {
  const v = selection.values;
  switch (slot) {
    case 'MILK':
      return { targetFatPercent: v.targetFat, deltaFatToTarget: v.deltaToTarget };
    case 'CREAM':
      return {
        targetFatPercent: v.targetFat,
        nominalFatPercent: v.nominalFat,
        deltaFatToTarget: v.deltaToTarget,
        matchCondition: v.matchCondition,
      };
    case 'SMP':
      return { targetFatPercent: v.targetFat, dryPowderBasis: true };
    case 'DEXTROSE':
      return {
        form: v.form,
        waterModelPiPer100g: { value: v.waterModel, provenance: 'MODEL_PI_NOT_LOT_MEASUREMENT' },
        activeDextroseModelPiPer100g: {
          value: v.activeDextroseModel,
          provenance: 'MODEL_PI_NOT_LOT_MEASUREMENT',
        },
        modelBasis: calculation.values.modelBasis,
        formEvidence: calculation.values.formEvidence,
      };
    case 'STABILIZER':
      return {
        stabilizerType: 'TARA',
        waterPer100g: { value: v.water, origin: calculation.values.waterOrigin },
        activityModelPi: { value: v.activityModel, provenance: 'MODEL_PI_NOT_LOT_MEASUREMENT' },
        carbohydrateConvention: v.carbohydrateConvention,
        viscosityAsSourced: v.viscosity,
        technicalNotes: v.technicalNotes,
        referenceDoseGramsPer1000g: calculation.values.baseGrams,
        referenceDosePercent: calculation.values.baseDosePercent,
        energyCheck: calculation.values.energyCheck,
        energyReference949: calculation.values.energyReference,
        macroCheck: calculation.values.macroCheck,
      };
    default:
      return {};
  }
}

function productFieldsFor(slot, selection, article) {
  const v = selection.values;
  const a = article?.values ?? {};
  const brand = slot === 'DEXTROSE' || slot === 'STABILIZER' ? v.brand ?? a.brand : a.brand;
  return {
    brand: textOrNull(brand),
    articleBrand: textOrNull(a.brand ?? null),
    manufacturerOrSupplier: textOrNull(v.manufacturerOrSupplier ?? a.manufacturerOrSupplier ?? null),
    origin: textOrNull(v.origin ?? a.origin ?? null),
    ingredientsText: textOrNull(v.ingredients ?? a.ingredients ?? null),
    allergensText: textOrNull(v.allergens ?? a.allergens ?? null),
    skuText: textOrNull(v.sku ?? null),
    articleSkuText: textOrNull(a.sku ?? null),
  };
}

const exactNameFor = (row) =>
  cleanText(row.article.values.product) ?? cleanText(row.selection.values.product);

/** Cross-market differences that bear on identity or composition (not wording). */
const IDENTITY_RELEVANT_DIFFERENCES = new Set([
  'nutrition.workingProfile',
  'nutrition.estimatedFields',
  'package.normalized',
  'brand',
]);

function indexBy(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    if (map.has(key)) fail(`duplicate key ${key} (${map.get(key).ref} and ${row.ref})`);
    map.set(key, row);
  }
  return map;
}

function groupBy(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function parseCountryRole(text) {
  const match = /^([A-Z]{2}) · .+ \/ ([A-Z]+)$/.exec(cleanText(text) ?? '');
  return match ? { country: match[1], role: match[2] } : null;
}

const ALTERNATIVE_PATTERNS = [
  {
    kind: 'USER_SUPPLIED_LOCAL_ALTERNATIVE',
    pattern:
      /^([A-Z]{2})(?:\/[A-Z]+)?: user (?:later )?supplied(?:\/verified)? (.+?)(?: \/ (EAN|SKU|barcode) (\d{8,14}))?(?:;| alternative;)/,
  },
  { kind: 'CHAT_LOCAL_ALTERNATIVE', pattern: /chat: (.+?) jako (?:lokalna )?alternatywa/ },
  { kind: 'CHAT_ADDITIONAL_CONFIRMATION', pattern: /Chat dodatkowo potwierdził (.+?), EAN (\d{8,14})/ },
];

function alternativesFromSync(syncRows, selectionKeyFor) {
  const alternatives = [];
  for (const row of syncRows) {
    const target = parseCountryRole(row.values.countryRole);
    if (!target) continue;
    const slot = SLOT_BY_WORKBOOK_ROLE[target.role];
    for (const field of ['basis', 'decision']) {
      const text = cleanText(row.values[field]);
      if (!text) continue;
      for (const { kind, pattern } of ALTERNATIVE_PATTERNS) {
        const match = pattern.exec(text);
        if (!match) continue;
        let name = null;
        let codeLabel = null;
        let code = null;
        if (kind === 'USER_SUPPLIED_LOCAL_ALTERNATIVE') {
          name = match[2];
          codeLabel = match[3] ?? null;
          code = match[4] ?? null;
        } else if (kind === 'CHAT_LOCAL_ALTERNATIVE') {
          name = match[1];
          const sku = /SKU (\S+)/.exec(match[1]);
          if (sku) {
            codeLabel = 'SKU';
            code = sku[1];
          }
        } else {
          name = match[1];
          codeLabel = 'EAN';
          code = match[2];
        }
        alternatives.push({
          country: target.country,
          slot,
          kind,
          status: 'ALTERNATIVE_LEAD_NOT_SELECTED',
          name: cleanText(name),
          codeLabel,
          code,
          codeHasValidGs1CheckDigit: code && /^\d+$/.test(code) ? isValidGtin(code) : null,
          selectedSelectionKey: selectionKeyFor(target.country, slot),
          caseId: row.values.id,
          rawText: text,
          sourceRef: `${row.sheet}!${field === 'basis' ? 'F' : 'E'}${row.rowNumber}`,
        });
      }
    }
  }
  return alternatives;
}

function alternativesFromDeAt(rows, selectionKeyFor) {
  const decisionMap = {
    'WYBRANY W ARKUSZU': 'SELECTED_IN_WORKBOOK',
    ALTERNATYWA: 'ALTERNATIVE_LEAD_NOT_SELECTED',
    'ODRZUCONO DLA CZYSTEJ DEKSTROZY': 'REJECTED_NOT_PURE_DEXTROSE',
  };
  const out = [];
  for (const row of rows) {
    const status = decisionMap[row.values.decision];
    if (!status) fail(`unknown DE/AT decision "${row.values.decision}" in ${row.ref}`);
    if (status === 'SELECTED_IN_WORKBOOK') continue;
    for (const market of String(row.values.market).split(';').map((part) => part.trim())) {
      out.push({
        country: market,
        slot: 'DEXTROSE',
        kind: 'DE_AT_AUDIT_CANDIDATE',
        status,
        name: textOrNull(row.values.product),
        packageText: textOrNull(row.values.size),
        codeLabel: textOrNull(row.values.codeType),
        code: textOrNull(row.values.identifier),
        codeHasValidGs1CheckDigit:
          row.values.codeType && /^EAN|^GTIN/.test(row.values.codeType)
            ? isValidGtin(row.values.identifier)
            : null,
        selectedSelectionKey: selectionKeyFor(market, 'DEXTROSE'),
        caseId: row.values.id,
        rawText: textOrNull(row.values.limitations),
        sourceRef: row.ref,
      });
    }
  }
  return out;
}

/**
 * @param {object} input
 * @param {object} input.workbook parseWorkbookV12() or parseWorkbookV23() result
 * @param {string} input.workbookSha256
 * @param {object} input.snapshot parsed catalog-dedupe-snapshot.json
 * @param {string} input.snapshotSha256
 * @param {string} input.snapshotPath repository-relative path
 * @param {object | null} [input.snapshotNotes] extra catalogSnapshot fields (seed copy, refresh requirement)
 * @param {object} [input.profile] registry profile — V12_REGISTRY_PROFILE by default
 */
export function buildRegistry({
  workbook,
  workbookSha256,
  snapshot,
  snapshotSha256,
  snapshotPath,
  snapshotNotes = null,
  profile = V12_REGISTRY_PROFILE,
}) {
  const namespace = profile.namespace;
  if (workbookSha256 !== profile.workbook.sha256) {
    fail(`workbook sha256 ${workbookSha256} is not the pinned ${profile.label} ${profile.workbook.sha256}`);
  }
  if (snapshot?.schema !== 'gellatti.country-products.catalog-dedupe-snapshot/v1') {
    fail('catalog snapshot schema mismatch');
  }
  const results = snapshot.results;
  const catalogMarkets = new Set(
    results.catalogMarketCountries.filter((row) => row.isActive).map((row) => row.code),
  );
  const consistencyChecks = [];
  const check = (id, passed, detail) => consistencyChecks.push({ id, passed, detail });

  // ---------------------------------------------------------------- base
  const base = workbook.base.map((row) => {
    const role = row.values.role;
    const slot = SLOT_BY_WORKBOOK_ROLE[role];
    if (!slot) fail(`unknown base role ${role} in ${row.ref}`);
    return {
      slot,
      functionalSlot: slot,
      workbookRole: role,
      ingredient: row.values.ingredient,
      grams: row.values.grams,
      shareOfBase: row.values.share,
      piIngId: row.values.piIngId,
      mapperNameInWorkbook: row.values.mapperName,
      referenceParameter: row.values.referenceParameter,
      target: row.values.target,
      approvedForBaseInWorkbook: row.values.approvedBase,
      approvedForEnginesInWorkbook: row.values.approvedEngines,
      processMessage: row.values.processMessage,
      stabilizerSlotRule:
        slot === 'STABILIZER'
          ? {
              defaultOption: 'TARA',
              taraMandatory: false,
              priority: [
                'LOCAL_VERIFIED_TARA',
                'LOCAL_VERIFIED_EXISTING_GELLATTI_STABILIZER',
                'LOCAL_VERIFIED_STABILIZER_PREMIX_OR_BLEND',
                'VERIFIED_CROSS_BORDER_FALLBACK',
                'BRAK_REVIEW_REQUIRED',
              ],
              existingStabilizerPis: EXISTING_STABILIZER_PIS,
              substitutionRule:
                'TARA ≠ GUAR ≠ LBG ≠ BLEND: another stabilizer needs its own exact PR identity, composition, Engine readiness and recalculated grams; TARA grams are never kept under another name.',
            }
          : null,
      sourceRef: row.ref,
    };
  });
  base.sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  for (const slot of SLOT_ORDER) {
    const row = base.find((entry) => entry.slot === slot);
    if (!row) fail(`base slot ${slot} missing from 01_BAZA_PI`);
    if (row.piIngId !== BASE_SLOT_PI[slot]) {
      fail(`base slot ${slot} maps to ${row.piIngId}, expected existing ${BASE_SLOT_PI[slot]}`);
    }
  }
  const mapperRows = new Map(results.mapperSlotRows.map((row) => [row.ingredientId, row]));
  for (const slotRow of base) {
    const mapper = mapperRows.get(slotRow.piIngId);
    slotRow.liveMapperRow = mapper
      ? {
          isActive: mapper.isActive,
          approvedForBase: mapper.approvedForBase,
          approvedForEngines: mapper.approvedForEngines,
          verificationStatus: mapper.verificationStatus,
          nameDisplay: mapper.nameDisplay,
        }
      : null;
    if (!mapper) fail(`live Mapper row for ${slotRow.piIngId} missing from snapshot`);
  }

  // ----------------------------------------------------------- countries
  const countries = workbook.countries
    .map((row) => ({
      iso2: row.values.iso2,
      iso3: row.values.iso3,
      namePl: row.values.namePl,
      nameEn: row.values.nameEn,
      region: row.values.region,
      priority: row.values.priority,
      hot15: row.values.hot15 === 'TAK',
      workbookCountryStatus: row.values.status,
      catalogMarketRowPresent: catalogMarkets.has(row.values.iso2),
      sourceRef: row.ref,
    }))
    .sort((a, b) => compareText(a.iso2, b.iso2));
  if (countries.length !== 75) fail(`expected 75 countries, found ${countries.length}`);
  const countrySet = new Set(countries.map((country) => country.iso2));
  if (countrySet.size !== 75) fail('duplicate ISO2 in 02_KRAJE_75');

  const regions = workbook.regions.map((row) => ({
    code: row.values.code,
    name: row.values.name,
    countries: String(row.values.countries)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
    type: row.values.type,
    exactPrRule: row.values.exactPrRule,
    note: 'Research grouping only — a region never activates an exact PR (08_ZASADY rule 7).',
    sourceRef: row.ref,
  }));

  // ------------------------------------------- workbook cross-references
  const coverageByKey = indexBy(workbook.coverage, (row) => `${row.values.iso}|${row.values.role}`);
  // One 05_PR_ING_ARTYKULY row per proposal key — or, where the workbook lists
  // a key once per market (v23: SMP-GTIN-039978115201 for JP and for UY), the
  // row whose "Kraje użycia" names the selection's country. Anything else fails.
  const articlesByKey = groupBy(workbook.articles, (row) => row.values.proposalKey);
  const articleFor = (key, country, ref) => {
    const candidates = articlesByKey.get(key) ?? [];
    if (candidates.length <= 1) return candidates[0] ?? null;
    const matching = candidates.filter((row) =>
      String(row.values.countriesOfUse ?? '')
        .split(/[\s,;]+/)
        .includes(country),
    );
    if (matching.length !== 1) {
      fail(`05_PR_ING_ARTYKULY lists ${key} ${candidates.length} times and ${matching.length} of those rows name ${country} (${ref})`);
    }
    return matching[0];
  };
  const gapRows = profile.trail.gapRows(workbook);
  const gapByKey = indexBy(gapRows, (row) => {
    const iso = iso2FromCountryCell(row.values.country);
    if (!iso) fail(`cannot parse country in ${row.ref}`);
    return `${iso}|${SLOT_BY_WORKBOOK_ROLE[row.values.role]}`;
  });
  const checklistByKey = groupBy(workbook.checklist, (row) => {
    const iso = iso2FromCountryCell(row.values.country);
    const slot = SLOT_BY_WORKBOOK_ROLE[row.values.role];
    return iso && slot ? `${iso}|${slot}` : null;
  });
  // Per-selection trail records (v12: 36/37/39; v23: 83_SYNC_V23).
  const trail = profile.trail.prepare(workbook);
  const sourcesByUrl = groupBy(
    workbook.sources.filter((row) => /^https?:\/\//.test(String(row.values.url ?? ''))),
    (row) => String(row.values.url).trim(),
  );

  // ------------------------------------------------ exact-product rows
  const rows = [];
  for (const slot of EXACT_PRODUCT_SLOTS) {
    const role = WORKBOOK_ROLE_BY_SLOT[slot];
    const calcByIso = indexBy(workbook.calculations[slot], (row) => row.values.iso);
    for (const selection of workbook.selections[slot]) {
      const iso = selection.values.iso;
      if (!countrySet.has(iso)) fail(`unknown country ${iso} in ${selection.ref}`);
      const calculation = calcByIso.get(iso);
      if (!calculation) fail(`no calculation row for ${iso} in ${CALCULATION_SHEET_BY_SLOT[slot]}`);
      if (calculation.values.product !== undefined && calculation.values.product !== null) {
        if (cleanText(calculation.values.product) !== cleanText(selection.values.product)) {
          check(
            `CALC_PRODUCT_NAME_MATCH:${slot}:${iso}`,
            false,
            `${calculation.ref} names "${calculation.values.product}" but ${selection.ref} names "${selection.values.product}"`,
          );
        }
      }
      const coverage = coverageByKey.get(`${iso}|${role}`);
      if (!coverage) fail(`no 04_POKRYCIE_PR row for ${iso}/${role}`);
      const workbookKey = selection.values.proposalKey;
      const article = articleFor(workbookKey, iso, selection.ref);
      if (!article) fail(`05_PR_ING_ARTYKULY has no row for ${workbookKey} (${selection.ref})`);
      const eanText = selection.values.ean === null ? null : String(selection.values.ean);
      const eanDigits = digitsOnly(eanText);
      const gtinValid = eanDigits ? isValidGtin(eanDigits) : false;
      if (eanDigits && !gtinValid) fail(`invalid GS1 check digit ${eanText} in ${selection.ref}`);
      if (
        coverage.values.proposalKey !== workbookKey ||
        (digitsOnly(coverage.values.ean) ?? '').replace(/^0+/, '') !==
          (eanDigits ?? '').replace(/^0+/, '')
      ) {
        check(`COVERAGE_MATCH:${slot}:${iso}`, false, `${coverage.ref} differs from ${selection.ref}`);
      }
      const fields = productFieldsFor(slot, selection, article);
      const pack = parsePackage(selection.values.pack);
      rows.push({
        index: rows.length,
        slot,
        role,
        country: iso,
        selection,
        calculation,
        coverage,
        article,
        workbookKey,
        eanText,
        gtin: gtinValid ? eanDigits : null,
        gtin14: gtinValid ? toGtin14(eanDigits) : null,
        fields,
        brandKey: brandIsKnown(fields.brand) ? foldForComparison(fields.brand) : null,
        supplierKey: supplierRoot(fields.manufacturerOrSupplier),
        pack,
        tokens: codeTokens(fields.skuText),
        nutrition: nutritionFor(slot, selection, calculation),
      });
    }
    if (workbook.selections[slot].length !== 75) {
      fail(`${SELECTION_SHEET_BY_SLOT[slot]} has ${workbook.selections[slot].length} rows, expected 75`);
    }
  }
  check('COVERAGE_MATCH:ALL', !consistencyChecks.some((c) => c.id.startsWith('COVERAGE_MATCH')), '04_POKRYCIE_PR proposal key and EAN equal the per-ingredient sheet for all 375 exact-product rows');

  // --------------------------------------------------- identity merges
  const uf = unionFind(rows.length);
  const mergeEdges = [];
  const bucket = (keyOf) => {
    const map = new Map();
    for (const row of rows) {
      const key = keyOf(row);
      if (key === null) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  };
  for (const [key, group] of bucket((row) => (row.gtin14 ? `${row.slot}|${row.gtin14}` : null))) {
    for (const row of group.slice(1)) {
      uf.union(group[0].index, row.index);
      mergeEdges.push({ basis: 'SAME_GTIN', key, from: row.index, to: group[0].index });
    }
  }
  for (const [key, group] of bucket((row) => `${row.slot}|${row.workbookKey}`)) {
    const gtins = uniqueSorted(group.map((row) => row.gtin14));
    if (gtins.length > 1) fail(`workbook proposal key ${key} spans different GTINs ${gtins.join(', ')}`);
    const packs = uniqueSorted(group.map((row) => row.pack.slug));
    if (packs.length > 1) fail(`workbook proposal key ${key} spans different packs ${packs.join(', ')}`);
    for (const row of group.slice(1)) {
      uf.union(group[0].index, row.index);
      mergeEdges.push({ basis: 'SAME_WORKBOOK_PROPOSAL_KEY', key, from: row.index, to: group[0].index });
    }
  }
  const articleBuckets = new Map();
  for (const row of rows) {
    if (row.gtin14 || !row.brandKey || !row.pack.stated) continue;
    for (const token of row.tokens) {
      const key = `${row.slot}|${row.brandKey}|${row.pack.slug}|${token}`;
      if (!articleBuckets.has(key)) articleBuckets.set(key, []);
      articleBuckets.get(key).push(row);
    }
  }
  for (const [key, group] of [...articleBuckets.entries()].sort((a, b) => compareText(a[0], b[0]))) {
    for (const row of group.slice(1)) {
      if (uf.find(row.index) !== uf.find(group[0].index)) {
        mergeEdges.push({ basis: 'SAME_BRAND_ARTICLE_PACK', key, from: row.index, to: group[0].index });
      }
      uf.union(group[0].index, row.index);
    }
  }

  const groups = new Map();
  for (const row of rows) {
    const root = uf.find(row.index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  }

  // ------------------------------------------------ shared tables
  // Every source URL is stored once in `sources`, keyed by a hash of the URL;
  // long workbook notes are stored once in `texts`. Records reference ids.
  const sourceTable = new Map();
  const sourceIdFor = (url) => {
    const id = `SRC-${shortHash(url)}`;
    const existing = sourceTable.get(id);
    if (existing && existing.url !== url) fail(`source id collision ${id}`);
    if (!existing) {
      sourceTable.set(id, {
        url,
        workbookSourceRecords: (sourcesByUrl.get(url) ?? [])
          .map((source) => ({
            id: source.values.id,
            auditDate: cleanText(source.values.auditDate),
            evidenceType: cleanText(source.values.evidenceType),
          }))
          .sort((a, b) => compareText(a.id, b.id)),
      });
    }
    return id;
  };
  const textTable = new Map();
  const internText = (value) => {
    if (typeof value !== 'string' || value.length <= TEXT_INLINE_LIMIT) return value;
    const id = `TXT-${shortHash(value)}`;
    if (textTable.has(id) && textTable.get(id) !== value) fail(`text id collision ${id}`);
    textTable.set(id, value);
    return id;
  };
  const internDeep = (value) => {
    if (Array.isArray(value)) return value.map(internDeep);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, internDeep(entry)]));
    }
    return internText(value);
  };

  // -------------------------------------------------------- products
  const catalogProducts = results.catalogProducts;
  const catalogByGtin = new Map();
  const addCatalogGtin = (ean, product, via) => {
    const key = gtinComparisonKey(ean);
    if (!key) return;
    if (!catalogByGtin.has(key)) catalogByGtin.set(key, []);
    const list = catalogByGtin.get(key);
    if (!list.some((entry) => entry.productCode === product.productCode)) {
      list.push({ ...product, matchedVia: via });
    }
  };
  const productByCode = new Map(catalogProducts.map((product) => [product.productCode, product]));
  for (const product of catalogProducts) addCatalogGtin(product.eanNormalized, product, 'products.ean_code_normalized');
  for (const variant of results.catalogVariants) {
    const product = productByCode.get(variant.productCode);
    if (product) addCatalogGtin(variant.ean, product, 'product_variants.ean');
  }
  const requestsByGtin = groupBy(results.productAddRequests, (request) =>
    gtinComparisonKey(request.detectedEan),
  );
  const activeAssignments = results.countryProductSlotAssignments.filter((row) => row.active);

  const products = [];
  const proposalRecords = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => compareText(a.country, b.country));
    const anchor = group[0];
    const slot = anchor.slot;
    const gtin14s = uniqueSorted(group.map((row) => row.gtin14));
    if (gtin14s.length > 1) fail(`identity group spans GTINs ${gtin14s.join(', ')}`);
    const gtin14 = gtin14s[0] ?? null;
    const gtinRow = gtin14 ? (group.find((row) => row.gtin14 === gtin14) ?? null) : null;
    const markets = group.map((row) => row.country);
    if (new Set(markets).size !== markets.length) {
      fail(`identity group lists a market twice: ${markets.join(', ')}`);
    }
    let basis;
    let ident;
    let productKey;
    let articleCode = null;
    if (gtin14) {
      basis = 'GTIN';
      ident = `GTIN-${gtin14}`;
      productKey = `${namespace}:${slot}:${ident}`;
    } else {
      const shared = group
        .map((row) => new Set(row.tokens))
        .reduce((acc, set) => new Set([...acc].filter((token) => set.has(token))));
      const sharedTokens = [...shared].sort(compareText);
      if (group.length > 1 && sharedTokens.length === 0 && group.some((row) => row.workbookKey !== anchor.workbookKey)) {
        fail(`merged identity without a shared article code: ${group.map((row) => row.selection.ref).join(', ')}`);
      }
      if (anchor.brandKey && sharedTokens.length > 0) {
        basis = 'BRAND_ARTICLE_CODE';
        articleCode = group.length > 1 ? sharedTokens[0] : anchor.tokens[0];
        ident = `SKU-${keySlug(anchor.fields.brand)}-${keySlug(articleCode)}-${anchor.pack.slug}`;
        productKey = `${namespace}:${slot}:${ident}`;
      } else if (sharedTokens.length > 0 && group.length === 1) {
        basis = 'LISTING_CODE';
        articleCode = anchor.tokens[0];
        ident = `SKU-${keySlug(articleCode)}`;
        productKey = `${namespace}:${anchor.country}:${slot}:${ident}`;
      } else {
        basis = 'NAME_HASH';
        const material = [
          slot,
          group.length === 1 ? anchor.country : anchor.workbookKey,
          foldForComparison(anchor.fields.brand),
          foldForComparison(anchor.selection.values.product),
          anchor.pack.slug,
        ].join('|');
        ident = `NAME-${shortHash(material)}`;
        productKey =
          group.length === 1
            ? `${namespace}:${anchor.country}:${slot}:${ident}`
            : `${namespace}:${slot}:${ident}`;
      }
    }

    // Cross-row consistency: identical values are expected for one identity.
    const crossRowDifferences = [];
    const compareAcross = (field, valueOf) => {
      const values = group.map((row) => ({ country: row.country, value: valueOf(row) }));
      const distinct = uniqueSorted(values.map((entry) => JSON.stringify(entry.value)));
      if (distinct.length > 1) crossRowDifferences.push({ field, values });
    };
    compareAcross('nutrition.workingProfile', (row) => row.nutrition.workingProfile);
    compareAcross('nutrition.estimatedFields', (row) => row.nutrition.estimatedFields);
    compareAcross('package.normalized', (row) => [
      row.pack.normalizedQuantity,
      row.pack.normalizedUnit,
      row.pack.multipackCount,
      row.pack.stated,
    ]);
    compareAcross('brand', (row) => foldForComparison(row.fields.brand));
    compareAcross('ingredientsText', (row) => row.fields.ingredientsText);
    compareAcross('allergensText', (row) => row.fields.allergensText);

    const nutrition = anchor.nutrition;
    const unionEstimated = uniqueSorted(group.flatMap((row) => row.nutrition.estimatedFields));
    const unionMissing = uniqueSorted(group.flatMap((row) => row.nutrition.missingFields));
    const sourceUrls = uniqueSorted(
      group.flatMap((row) => [
        ...extractUrls(row.selection.values.sources),
        ...extractUrls(row.calculation.values.sources),
        ...extractUrls(row.article.values.sources),
      ]),
    );
    const auditDates = uniqueSorted(
      sourceUrls.flatMap((url) =>
        (sourcesByUrl.get(url) ?? []).map((source) => cleanText(source.values.auditDate)),
      ),
    );

    // Catalog deduplication (read-only snapshot).
    const comparisonKey = gtinRow ? gtinComparisonKey(gtinRow.gtin) : null;
    const catalogMatches = comparisonKey ? catalogByGtin.get(comparisonKey) ?? [] : [];
    let catalogDecision = 'NEW_PR_REQUIRED';
    let existingPrIng = null;
    let existingProductName = null;
    if (catalogMatches.length > 0) {
      const reusable = catalogMatches.filter(
        (match) =>
          match.productKind === 'commercial_product' &&
          String(match.productCode).startsWith('PR-ING-') &&
          match.isActive &&
          !match.merged,
      );
      if (reusable.length === 1 && catalogMatches.length === 1) {
        catalogDecision = 'REUSE_EXISTING_PR';
        existingPrIng = reusable[0].productCode;
        existingProductName = reusable[0].name;
      } else {
        catalogDecision = 'BLOCKED_EAN_HELD_BY_OTHER_CATALOG_ROW';
      }
    }
    const brandFold = foldForComparison(anchor.fields.brand);
    const brandWords = new Set(brandFold.split(' '));
    const nameWords = (name) =>
      new Set(
        foldForComparison(name)
          .split(' ')
          .filter((word) => word.length >= 4 && !brandWords.has(word)),
      );
    const ownWords = nameWords(exactNameFor(anchor));
    const relatedExisting = catalogProducts
      .filter(
        (candidate) =>
          candidate.productKind === 'commercial_product' &&
          brandFold &&
          foldForComparison(candidate.brand) === brandFold &&
          [...nameWords(candidate.name)].some((word) => ownWords.has(word)) &&
          !catalogMatches.some((match) => match.productCode === candidate.productCode),
      )
      .map((candidate) => ({
        productCode: candidate.productCode,
        name: candidate.name,
        ean: candidate.eanNormalized,
        isActive: candidate.isActive,
        reason: 'SAME_BRAND_DIFFERENT_GTIN_OR_PACK_NEVER_MERGED',
      }))
      .sort((a, b) => compareText(a.productCode, b.productCode));
    const pendingRequests = comparisonKey
      ? (requestsByGtin.get(comparisonKey) ?? []).map((request) => ({
          requestNumber: request.requestNumber,
          status: request.status,
          idempotencyKey: request.idempotencyKey,
          approvedProductCode: request.approvedProductCode,
        }))
      : [];

    const exactName = exactNameFor(anchor);
    const product = {
      productKey,
      slot,
      functionalSlot: slot,
      workbookRole: anchor.role,
      piIngId: BASE_SLOT_PI[slot],
      identity: {
        basis,
        gtin: gtinRow ? gtinRow.gtin : null,
        gtin14,
        gtinSymbology: gtinRow ? gtinSymbology(gtinRow.gtin) : null,
        gtinCheckDigitValid: gtinRow ? true : null,
        gtinRestrictedCirculation: gtinRow ? isRestrictedCirculationGtin(gtinRow.gtin) : null,
        articleCode,
        skuTexts: uniqueSorted(group.flatMap((row) => [row.fields.skuText, row.fields.articleSkuText])),
      },
      exactName,
      brand: anchor.fields.brand,
      brandKnown: brandIsKnown(anchor.fields.brand),
      manufacturerOrSupplier: anchor.fields.manufacturerOrSupplier,
      origin: anchor.fields.origin,
      labelLanguage: null,
      package: {
        text: anchor.pack.text,
        stated: anchor.pack.stated,
        quantity: anchor.pack.quantity,
        unit: anchor.pack.unit,
        multipackCount: anchor.pack.multipackCount,
        normalizedQuantity: anchor.pack.normalizedQuantity,
        normalizedUnit: anchor.pack.normalizedUnit,
      },
      ingredientsText: anchor.fields.ingredientsText,
      allergensText: anchor.fields.allergensText,
      nutrition: { ...nutrition, estimatedFieldsAcrossMarkets: unionEstimated, missingFieldsAcrossMarkets: unionMissing },
      technicalSpec: technicalSpecFor(slot, anchor.selection, anchor.calculation),
      sourceIds: uniqueSorted(sourceUrls.map(sourceIdFor)),
      evidence: {
        auditDates,
      },
      workbook: {
        proposalKeys: uniqueSorted(group.map((row) => row.workbookKey)),
        finalPrIngColumn: uniqueSorted(group.map((row) => row.coverage.values.finalPrIng)),
        articleStatus: uniqueSorted(group.map((row) => row.article.values.status)),
        piMatch: uniqueSorted(group.map((row) => row.article.values.piMatch)),
        articleNote: cleanText(anchor.article.values.missing),
        anchorSelectionRef: anchor.selection.ref,
        anchorCalculationRef: anchor.calculation.ref,
        articleRefs: uniqueSorted(group.map((row) => row.article.ref)),
      },
      markets,
      marketRoutes: [],
      readiness: null,
      catalog: {
        decision: catalogDecision,
        existingPrIng,
        existingProductName,
        catalogMatches: catalogMatches.map((match) => ({
          productCode: match.productCode,
          productKind: match.productKind,
          isActive: match.isActive,
          matchedVia: match.matchedVia,
        })),
        pendingRequests,
        relatedExisting,
      },
      dedupe: {
        mergedProposalCount: group.length - 1,
        mergeBasis: uniqueSorted(
          mergeEdges
            .filter((edge) => group.some((row) => row.index === edge.from))
            .map((edge) => edge.basis),
        ),
        possibleDuplicates: [],
      },
      crossRowDifferences,
      reviewRequired: [],
      _rows: group,
      _ident: ident,
    };
    products.push(product);
  }

  const productKeys = new Set();
  for (const product of products) {
    if (productKeys.has(product.productKey)) fail(`duplicate product key ${product.productKey}`);
    productKeys.add(product.productKey);
  }
  const gtinOwners = new Map();
  for (const product of products) {
    if (!product.identity.gtin14) continue;
    const key = `${product.identity.gtin14}`;
    if (gtinOwners.has(key)) fail(`two identities share GTIN ${key}`);
    gtinOwners.set(key, product.productKey);
  }

  // ---------------------------------------------- possible duplicates
  const possibleDuplicates = [];
  for (const slot of EXACT_PRODUCT_SLOTS) {
    const noGtin = products.filter((product) => product.slot === slot && !product.identity.gtin14);
    const byRoot = groupBy(noGtin, (product) => {
      const row = product._rows[0];
      return row.brandKey ?? row.supplierKey;
    });
    for (const [root, list] of [...byRoot.entries()].sort((a, b) => compareText(a[0], b[0]))) {
      if (list.length < 2) continue;
      possibleDuplicates.push({
        slot,
        basis: 'SAME_BRAND_OR_SUPPLIER_WITHOUT_SHARED_IDENTIFIER',
        root,
        productKeys: list.map((product) => product.productKey).sort(compareText),
        decision: 'NOT_MERGED_REVIEW_REQUIRED',
        reason:
          'Same brand or supplier but no shared GTIN or article code; name similarity alone never confirms one product.',
      });
    }
    const withGtin = products.filter((product) => product.slot === slot && product.identity.gtin14);
    for (const product of noGtin) {
      const row = product._rows[0];
      if (!row.brandKey || !row.pack.stated) continue;
      const peers = withGtin.filter(
        (candidate) =>
          candidate._rows[0].brandKey === row.brandKey && candidate._rows[0].pack.slug === row.pack.slug,
      );
      if (peers.length === 0) continue;
      possibleDuplicates.push({
        slot,
        basis: 'SAME_BRAND_AND_PACK_ONE_SIDE_WITHOUT_GTIN',
        root: row.brandKey,
        productKeys: [product.productKey, ...peers.map((peer) => peer.productKey)].sort(compareText),
        decision: 'NOT_MERGED_REVIEW_REQUIRED',
        reason: 'A GTIN product and a no-GTIN listing share brand and pack; identity is not proven.',
      });
    }
  }
  for (const duplicate of possibleDuplicates) {
    for (const key of duplicate.productKeys) {
      const product = products.find((entry) => entry.productKey === key);
      product.dedupe.possibleDuplicates.push(
        ...duplicate.productKeys.filter((other) => other !== key && !product.dedupe.possibleDuplicates.includes(other)),
      );
    }
  }

  // --------------------------------------------------- open gap ledger
  const productBySelection = new Map();
  for (const product of products) {
    for (const row of product._rows) productBySelection.set(`${row.country}|${row.slot}`, { product, row });
  }
  const openGaps = gapRows
    .map((row) => {
      const country = iso2FromCountryCell(row.values.country);
      const slot = SLOT_BY_WORKBOOK_ROLE[row.values.role];
      if (!slot || slot === 'SUCROSE' || slot === 'MILK') fail(`unexpected gap role ${row.values.role} in ${row.ref}`);
      const state = row.values.state === 'ZABLOKOWANE' ? 'BLOCKED' : row.values.state === 'OTWARTE' ? 'OPEN' : null;
      if (!state) fail(`unknown gap state ${row.values.state} in ${row.ref}`);
      const linked = productBySelection.get(`${country}|${slot}`);
      const gap = {
        id: row.values.id,
        priority: row.values.priority,
        state,
        workbookState: row.values.state,
        country,
        countryLabel: row.values.country,
        workbookRole: row.values.role,
        slot,
        functionalSlot: slot,
        gapKind: slot === 'STABILIZER' ? 'STABILIZER_RESEARCH' : `${row.values.role}_OPEN`,
        product: row.values.product,
        conditions: gapConditionCodes(row.values.condition, row.ref),
        conditionText: row.values.condition,
        missing: row.values.missing,
        checklistRef: row.values.checklistRef,
        notesV12: row.values.notesV12,
        selectionKey: `${namespace}:${country}:${slot}`,
        productKey: linked ? linked.product.productKey : null,
        sourceRef: row.ref,
      };
      if (slot === 'STABILIZER') {
        gap.stabilizerResearch = {
          taraMandatory: false,
          missingMandatoryTara: false,
          meaning:
            'Open research on the product chosen for the functional STABILIZER slot. It is not a market that lacks a mandatory TARA.',
        };
      }
      return gap;
    })
    .sort(
      (a, b) =>
        GAP_ROLE_ORDER.indexOf(a.workbookRole) - GAP_ROLE_ORDER.indexOf(b.workbookRole) ||
        compareText(a.country, b.country) ||
        compareText(a.id, b.id),
    );
  const gapBySelection = new Map(openGaps.map((gap) => [`${gap.country}|${gap.slot}`, gap]));

  // ---------------------------------------------------- readiness
  const PRODUCT_LEVEL_GAP_CODES = new Set(['LABEL_DATA', 'ENERGY_OR_TECHNOLOGY']);
  for (const product of products) {
    const routeGaps = product.markets
      .map((country) => gapBySelection.get(`${country}|${product.slot}`))
      .filter(Boolean);
    const productLevelGaps = routeGaps.filter((gap) =>
      gap.conditions.some((code) => PRODUCT_LEVEL_GAP_CODES.has(code)),
    );
    const estimated7 = product.nutrition.estimatedFieldsAcrossMarkets.filter((field) =>
      NUTRIENT_FIELDS.includes(field),
    );
    const missing7 = product.nutrition.missingFieldsAcrossMarkets;
    let expectation;
    if (estimated7.length > 0 || missing7.length > 0) expectation = 'ESTIMATED_OR_MISSING_LABEL_FIELDS';
    else if (productLevelGaps.length > 0) expectation = 'DECLARED_BUT_DISPUTED_OPEN_CASE';
    else expectation = 'DECLARED_PROFILE_COMPLETE';
    const blockers = [];
    if (estimated7.length > 0) blockers.push(`ESTIMATED_FIELDS:${estimated7.join(',')}`);
    if (missing7.length > 0) blockers.push(`MISSING_FIELDS:${missing7.join(',')}`);
    for (const gap of productLevelGaps) blockers.push(`OPEN_CASE:${gap.id}:${gap.conditions.join('+')}`);
    if (!product.package.stated) blockers.push('PACKAGE_NOT_STATED');
    else if (!product.package.normalizedUnit) blockers.push('PACKAGE_NOT_METRIC');
    // Version-specific readiness holds (v23: a carbohydrate value that is not
    // in the available-carbohydrate convention); none in v12.
    const profileBlockers = profile.readinessBlockers(product);
    blockers.push(...profileBlockers);
    product.readiness = {
      engineProfileExpectation: expectation,
      expectedPickerRoutability:
        expectation === 'DECLARED_PROFILE_COMPLETE' && product.package.normalizedUnit && profileBlockers.length === 0
          ? 'EXPECTED_AFTER_SANCTIONED_INGEST_SUBJECT_TO_SERVER_VERDICT'
          : 'NOT_ROUTABLE_UNTIL_PROFILE_AND_IDENTITY_COMPLETE',
      blockers,
    };
    const review = [];
    if (estimated7.length > 0 || product.nutrition.estimatedFieldsAcrossMarkets.includes('fibre')) {
      review.push(`ESTIMATED_FIELDS:${product.nutrition.estimatedFieldsAcrossMarkets.join(',')}`);
    }
    if (missing7.length > 0) review.push(`MISSING_FIELDS:${missing7.join(',')}`);
    if (!product.package.stated) review.push('PACKAGE_NOT_STATED');
    else if (!product.package.normalizedUnit) review.push('PACKAGE_NOT_METRIC');
    if (!product.brandKnown) review.push('BRAND_NOT_DISCLOSED');
    if (product.identity.gtinRestrictedCirculation) review.push('GTIN_RESTRICTED_CIRCULATION_PREFIX');
    const identityDifferences = product.crossRowDifferences
      .map((difference) => difference.field)
      .filter((field) => IDENTITY_RELEVANT_DIFFERENCES.has(field));
    if (identityDifferences.length > 0) {
      review.push(`CROSS_MARKET_DIFFERENCES:${identityDifferences.join(',')}`);
    }
    if (product.dedupe.possibleDuplicates.length > 0) {
      review.push(`POSSIBLE_DUPLICATE_OF:${product.dedupe.possibleDuplicates.join(',')}`);
    }
    for (const gap of routeGaps) review.push(`${gap.state === 'BLOCKED' ? 'BLOCKED' : 'OPEN_CASE'}:${gap.id}:${gap.country}`);
    if (product.catalog.decision === 'BLOCKED_EAN_HELD_BY_OTHER_CATALOG_ROW') {
      review.push('EAN_HELD_BY_OTHER_CATALOG_ROW');
    }
    review.push(...profileBlockers);
    product.reviewRequired = review;
  }

  // ------------------------------------------------------- selections
  const selectionKeyFor = (country, slot) => `${namespace}:${country}:${slot}`;
  // Offer channel → STABILIZER slot option. v23 adds "LOCAL — USA B2B": the US
  // exact grade is offered by domestic B2B distributors on request
  // (86_DOWODY_V23 V23-S04/S05), i.e. a quote, not a retail offer.
  const stabilizerSlotOptions = new Map([
    ['LOCAL', 'LOCAL_TARA'],
    ['IMPORT', 'CROSS_BORDER_TARA'],
    ['B2B', 'B2B_TARA_QUOTE_REQUIRED'],
    ['LOCAL — USA B2B', 'B2B_TARA_QUOTE_REQUIRED'],
  ]);
  const selections = [];
  for (const country of countries.map((entry) => entry.iso2)) {
    for (const slot of SLOT_ORDER) {
      const role = WORKBOOK_ROLE_BY_SLOT[slot];
      const coverage = coverageByKey.get(`${country}|${role}`);
      if (!coverage) fail(`no 04_POKRYCIE_PR row for ${country}/${role}`);
      if (coverage.values.piIngId !== BASE_SLOT_PI[slot]) {
        fail(`${coverage.ref} maps ${slot} to ${coverage.values.piIngId}`);
      }
      const base = {
        selectionKey: selectionKeyFor(country, slot),
        country,
        slot,
        functionalSlot: slot,
        workbookRole: role,
        piIngId: BASE_SLOT_PI[slot],
        grams: coverage.values.grams,
      };
      if (slot === 'SUCROSE') {
        selections.push({
          ...base,
          selectionKind: 'GLOBAL_PI',
          proposalKey: null,
          productKey: null,
          dedupeDecision: 'NOT_APPLICABLE_GLOBAL_PI',
          selectionState: 'GLOBAL_PI_READY',
          workbook: {
            proposalKey: coverage.values.proposalKey,
            finalPrIngColumn: coverage.values.finalPrIng,
            coverageMatrixStatus: coverage.values.status,
            description: coverage.values.product,
            activationCondition: coverage.values.activationCondition,
            coverageRef: coverage.ref,
          },
          route: {
            decision: 'NOT_APPLICABLE_GLOBAL_PI',
            blockers: [],
          },
        });
        continue;
      }
      const linked = productBySelection.get(`${country}|${slot}`);
      if (!linked) fail(`no product identity for ${country}/${slot}`);
      const { product, row } = linked;
      const gap = gapBySelection.get(`${country}|${slot}`) ?? null;
      const closedCases = (checklistByKey.get(`${country}|${slot}`) ?? [])
        .filter((entry) => /ZAMKNI/.test(String(entry.values.state)))
        .map((entry) => profile.trail.closedCase(entry));
      const selectionState = gap ? (gap.state === 'BLOCKED' ? 'BLOCKED' : 'RESEARCH_OPEN') : 'SELECTION_CLOSED';
      const v = row.selection.values;
      selections.push({
        ...base,
        selectionKind: 'EXACT_PRODUCT',
        proposalKey: `${namespace}:${country}:${slot}:${product._ident}`,
        productKey: product.productKey,
        dedupeDecision: null,
        mergedIntoProposalKey: null,
        duplicateBasis: null,
        selectionState,
        openGapId: gap ? gap.id : null,
        localName: cleanText(v.product),
        localPackText: row.pack.text,
        offerChannel: slot === 'STABILIZER' ? v.offerChannel : null,
        supplierOrRetailer: row.fields.manufacturerOrSupplier,
        availabilityEvidence: {
          marketEvidence: row.coverage.values.marketEvidence,
          offerConditions: v.offerConditions ?? null,
        },
        notes: {
          correction: v.correction ?? null,
          estimates: v.estimatesText ?? null,
          matchCondition: v.matchCondition ?? null,
          processMessage: row.coverage.values.processMessage,
          activationCondition: row.coverage.values.activationCondition,
          technicalMatch: row.coverage.values.technicalMatch,
        },
        sourceIds: uniqueSorted(
          [...extractUrls(v.sources), ...extractUrls(row.calculation.values.sources)].map(sourceIdFor),
        ),
        ...profile.trail.selectionFields(trail, { key: `${country}|${slot}`, workbook, sourceIdFor }),
        closedCases,
        workbook: {
          proposalKey: row.workbookKey,
          finalPrIngColumn: row.coverage.values.finalPrIng,
          coverageMatrixStatus: row.coverage.values.status,
          selectionRef: row.selection.ref,
          calculationRef: row.calculation.ref,
          coverageRef: row.coverage.ref,
          articleRef: row.article.ref,
        },
        stabilizer:
          slot === 'STABILIZER'
            ? {
                stabilizerType: 'TARA',
                taraMandatory: false,
                offerChannel: v.offerChannel,
                slotOption: stabilizerSlotOptions.get(v.offerChannel) ?? 'TARA_DELIVERY_UNCONFIRMED',
                alternativesConsidered: [],
              }
            : null,
        route: null,
      });
      const proposalKey = selections.at(-1).proposalKey;
      if (proposalRecords.has(proposalKey)) fail(`duplicate proposal key ${proposalKey}`);
      proposalRecords.set(proposalKey, selections.at(-1));
    }
  }

  // ------------------------------------- dedupe decisions + routes
  const existingPrimary = (country, piIngId) =>
    activeAssignments.find(
      (row) =>
        row.countryCode === country &&
        row.mapperIngredientId === piIngId &&
        row.assignmentKind === 'PRIMARY_DEFAULT',
    ) ?? null;
  for (const product of products) {
    const anchorCountry = product._rows[0].country;
    const anchorSelection = selections.find(
      (selection) => selection.country === anchorCountry && selection.slot === product.slot,
    );
    const anchorWorkbookKey = product._rows[0].workbookKey;
    for (const row of product._rows) {
      const selection = selections.find(
        (entry) => entry.country === row.country && entry.slot === product.slot,
      );
      if (row.country === anchorCountry) {
        selection.dedupeDecision = product.catalog.decision;
      } else {
        selection.dedupeDecision = `DUPLICATE_WITHIN_${namespace}`;
        selection.mergedIntoProposalKey = anchorSelection.proposalKey;
        selection.duplicateBasis =
          row.gtin14 && row.gtin14 === product.identity.gtin14
            ? row.workbookKey === anchorWorkbookKey
              ? 'SAME_GTIN_AND_WORKBOOK_PROPOSAL_KEY'
              : 'SAME_GTIN'
            : row.workbookKey === anchorWorkbookKey
              ? 'SAME_WORKBOOK_PROPOSAL_KEY'
              : 'SAME_BRAND_ARTICLE_PACK';
      }
      const blockers = [];
      let decision = null;
      if (!catalogMarkets.has(row.country)) blockers.push('MARKET_NOT_IN_CATALOG_MARKET_COUNTRIES');
      const primary = existingPrimary(row.country, product.piIngId);
      if (primary) {
        if (primary.productCode === product.catalog.existingPrIng) decision = 'ROUTE_ALREADY_PRESENT';
        else blockers.push(`EXISTING_PRIMARY_FOR_OTHER_PRODUCT:${primary.productCode}`);
      }
      if (selection.selectionState === 'BLOCKED') blockers.push(`SELECTION_BLOCKED:${selection.openGapId}`);
      if (selection.selectionState === 'RESEARCH_OPEN') blockers.push(`OPEN_RESEARCH_CASE:${selection.openGapId}`);
      if (product.readiness.engineProfileExpectation !== 'DECLARED_PROFILE_COMPLETE') {
        blockers.push(`PROFILE_NOT_ENGINE_READY:${product.readiness.engineProfileExpectation}`);
      }
      if (!product.package.stated) blockers.push('PACKAGE_NOT_STATED');
      else if (!product.package.normalizedUnit) blockers.push('PACKAGE_NOT_METRIC');
      if (product.catalog.decision === 'BLOCKED_EAN_HELD_BY_OTHER_CATALOG_ROW') {
        blockers.push('EAN_HELD_BY_OTHER_CATALOG_ROW');
      }
      // Version-specific route holds (v23: a workbook status that is not a PR
      // candidate, a non-available carbohydrate convention); none in v12.
      blockers.push(...profile.routeBlockers({ product, row, selection }));
      if (!decision) decision = blockers.length > 0 ? 'ROUTE_BLOCKED' : 'ROUTE_CREATABLE_NOW';
      selection.route = {
        decision,
        blockers,
        existingPrimary: primary
          ? { productCode: primary.productCode, productEan: primary.productEan }
          : null,
        marketRowPresent: catalogMarkets.has(row.country),
      };
      product.marketRoutes.push({
        country: row.country,
        proposalKey: selection.proposalKey,
        selectionState: selection.selectionState,
        routeDecision: decision,
      });
    }
    product.marketRoutes.sort((a, b) => compareText(a.country, b.country));
    product.canonicalProposalKey = anchorSelection.proposalKey;
    product.evidence.latestEvidenceDate =
      uniqueSorted([
        ...product.evidence.auditDates,
        ...product.marketRoutes.flatMap((route) =>
          profile.trail.evidenceDates(proposalRecords.get(route.proposalKey)),
        ),
      ]).at(-1) ?? null;
  }

  // --------------------------------------------------- alternatives
  const alternatives = [
    ...alternativesFromSync(workbook.syncV12, selectionKeyFor),
    ...alternativesFromDeAt(workbook.deAtProducts, selectionKeyFor),
  ].sort(
    (a, b) =>
      compareText(a.country, b.country) ||
      slotRank(a.slot) - slotRank(b.slot) ||
      compareText(a.sourceRef, b.sourceRef),
  );
  for (const alternative of alternatives) {
    const selection = selections.find((entry) => entry.selectionKey === alternative.selectedSelectionKey);
    if (!selection) fail(`alternative ${alternative.sourceRef} points at no selection`);
    alternative.selectedProductKey = selection.productKey;
  }

  // ------------------------------------------------- global gates
  const globalGates = [
    ...workbook.checklist
      .filter((row) => !/^R\d+-\d{3}$/.test(String(row.values.id)))
      .map((row) => ({
        id: row.values.id,
        state: row.values.state,
        scope: row.values.country,
        area: row.values.role,
        subject: row.values.product,
        remaining: row.values.remaining,
        sourceRef: row.ref,
      })),
    ...workbook.blockers.map((row) => ({
      id: row.values.id,
      state: row.values.status,
      scope: row.values.scope,
      area: row.values.area,
      subject: row.values.blocker,
      remaining: row.values.closeCondition,
      sourceRef: row.ref,
    })),
  ];

  // ----------------------------------------------- workbook checks
  const countedByRole = Object.fromEntries(
    GAP_ROLE_ORDER.map((role) => [role, openGaps.filter((gap) => gap.workbookRole === role).length]),
  );
  const remainingHeader = profile.trail.remainingHeader(workbook);
  const headerCounts = remainingHeader.byRole;
  // Trail checks first (v12: 27 ↔ 40 ↔ 39; v23: 27 ↔ 84 ↔ 83, the 83 cases,
  // 88 controls, 86 sources, 85 US values, alternative leads, 04 statuses).
  profile.trail.checks({
    workbook,
    openGaps,
    countedByRole,
    remainingHeader,
    check,
    rows,
    selections,
    products,
    alternatives,
    globalGates,
  });
  const currentArticleKeys = new Set(
    workbook.articles
      .filter((row) => !/HISTORIA|ZASTĄPION/.test(String(row.values.status)))
      .map((row) => row.values.proposalKey),
  );
  const selectionWorkbookKeys = new Set(rows.map((row) => row.workbookKey));
  const unusedArticleKeys = [...currentArticleKeys]
    .filter((key) => !selectionWorkbookKeys.has(key) && key !== 'GENERIC-SUCROSE')
    .sort(compareText);
  const missingArticleKeys = [...selectionWorkbookKeys].filter((key) => !currentArticleKeys.has(key)).sort(compareText);
  check(
    'ARTICLES_05_CURRENT_EQUALS_SELECTION_KEYS',
    unusedArticleKeys.length === 0 && missingArticleKeys.length === 0,
    `05_PR_ING_ARTYKULY current rows (${currentArticleKeys.size}, incl. GENERIC-SUCROSE) vs distinct selection keys (${selectionWorkbookKeys.size})` +
      (unusedArticleKeys.length > 0 ? `; current but used by no selection: ${unusedArticleKeys.join(', ')}` : '') +
      (missingArticleKeys.length > 0 ? `; used by a selection but not current: ${missingArticleKeys.join(', ')}` : ''),
  );
  for (const product of products) {
    const completenessFlags = uniqueSorted(product._rows.map((row) => row.nutrition.workbookCompleteness));
    const estimated7 = product.nutrition.estimatedFieldsAcrossMarkets.filter((field) =>
      product.slot === 'STABILIZER' ? PROFILE_FIELDS.includes(field) : NUTRIENT_FIELDS.includes(field),
    );
    const saysEstimated = completenessFlags.includes('ESTIMATED');
    if (saysEstimated !== estimated7.length > 0) {
      check(
        `COMPLETENESS_FLAG:${product.productKey}`,
        false,
        `workbook completeness ${completenessFlags.join('/')} but parsed estimated fields [${estimated7.join(',')}]`,
      );
    }
  }
  const reuseWorkbookCodes = products
    .filter((product) => product.catalog.decision === 'REUSE_EXISTING_PR')
    .map((product) => ({ product, codes: product.workbook.finalPrIngColumn.filter((code) => /^PR-ING-/.test(code)) }));
  check(
    'REUSE_MATCHES_WORKBOOK_PR_CODE',
    reuseWorkbookCodes.every(({ product, codes }) => codes.length === 1 && codes[0] === product.catalog.existingPrIng),
    reuseWorkbookCodes.map(({ product, codes }) => `${product.productKey}: catalog ${product.catalog.existingPrIng}, workbook ${codes.join('/') || '—'}`).join('; '),
  );
  const workbookExistingPrReferences = workbook.articles
    .filter((row) => /^PR-ING-/.test(String(row.values.finalPrIng)))
    .map((row) => ({
      prIng: row.values.finalPrIng,
      workbookProposalKey: row.values.proposalKey,
      product: row.values.product,
      ean: textOrNull(row.values.ean),
      workbookStatus: row.values.status,
      inCatalogSnapshot: productByCode.has(row.values.finalPrIng),
      sourceRef: row.ref,
    }))
    .sort((a, b) => compareText(a.prIng, b.prIng));

  // ------------------------------------------------------ finalise
  for (const product of products) {
    delete product._rows;
    delete product._ident;
    product.technicalSpec = internDeep(product.technicalSpec);
    product.crossRowDifferences = internDeep(product.crossRowDifferences);
  }
  for (const selection of selections) {
    for (const key of ['notes', 'availabilityEvidence', 'evidenceV11', 'changeV11', 'syncV12', 'syncV23', 'closedCases']) {
      if (selection[key] !== undefined) selection[key] = internDeep(selection[key]);
    }
  }
  // Version trail facts for registry.source — computed before the source table
  // is frozen, because v23 records the 86_DOWODY_V23 URLs as sourceIds.
  const sourceFields = profile.trail.sourceFields(workbook, { sourceIdFor });
  const sources = Object.fromEntries([...sourceTable.entries()].sort((a, b) => compareText(a[0], b[0])));
  const texts = Object.fromEntries([...textTable.entries()].sort((a, b) => compareText(a[0], b[0])));
  products.sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || compareText(a.productKey, b.productKey));
  selections.sort((a, b) => compareText(a.country, b.country) || slotRank(a.slot) - slotRank(b.slot));

  const exactSelections = selections.filter((selection) => selection.selectionKind === 'EXACT_PRODUCT');
  const countBy = (list, keyOf) => {
    const out = {};
    for (const item of list) {
      const key = keyOf(item);
      out[key] = (out[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).sort((a, b) => compareText(a[0], b[0])));
  };
  const bySlot = (list) =>
    Object.fromEntries(EXACT_PRODUCT_SLOTS.map((slot) => [slot, list.filter((item) => item.slot === slot).length]));
  const duplicateSelections = exactSelections.filter(
    (selection) => selection.dedupeDecision === `DUPLICATE_WITHIN_${namespace}`,
  );
  const routeBlockers = (selection, prefix) => selection.route.blockers.some((blocker) => blocker.startsWith(prefix));
  const counts = {
    countries: countries.length,
    baseSlots: base.length,
    selections: selections.length,
    exactProductSelections: exactSelections.length,
    globalPiSelections: selections.length - exactSelections.length,
    products: products.length,
    productsBySlot: bySlot(products),
    newPiCreated: 0,
    prIngNumbersAssigned: 0,
    proposalDecisions: countBy(exactSelections, (selection) => selection.dedupeDecision),
    productCatalogDecisions: countBy(products, (product) => product.catalog.decision),
    duplicatesPrevented: {
      total: duplicateSelections.length,
      alreadyGroupedByWorkbookProposalKey: duplicateSelections.filter((selection) =>
        ['SAME_GTIN_AND_WORKBOOK_PROPOSAL_KEY', 'SAME_WORKBOOK_PROPOSAL_KEY'].includes(selection.duplicateBasis),
      ).length,
      additionalMergesBySameGtin: duplicateSelections.filter((selection) => selection.duplicateBasis === 'SAME_GTIN').length,
      additionalMergesBySameBrandArticlePack: duplicateSelections.filter(
        (selection) => selection.duplicateBasis === 'SAME_BRAND_ARTICLE_PACK',
      ).length,
    },
    possibleDuplicatesNotMerged: possibleDuplicates.length,
    identityBasis: countBy(products, (product) => product.identity.basis),
    selectionStates: Object.fromEntries(
      EXACT_PRODUCT_SLOTS.map((slot) => [
        slot,
        countBy(
          exactSelections.filter((selection) => selection.slot === slot),
          (selection) => selection.selectionState,
        ),
      ]),
    ),
    openGaps: {
      total: openGaps.length,
      byWorkbookRole: countedByRole,
      workbookHeader: { total: remainingHeader.total, ...headerCounts },
      matchesWorkbookHeader:
        remainingHeader.total === openGaps.length &&
        GAP_ROLE_ORDER.every((role) => headerCounts[role] === countedByRole[role]),
      stabilizerResearchEntries: countedByRole.TARA,
      stabilizerResearchIsNotMissingMandatoryTara: true,
    },
    routes: {
      byDecision: countBy(exactSelections, (selection) => selection.route.decision),
      marketRowPresent: exactSelections.filter((selection) => selection.route.marketRowPresent).length,
      blockedByMarketForeignKey: exactSelections.filter((selection) =>
        routeBlockers(selection, 'MARKET_NOT_IN_CATALOG_MARKET_COUNTRIES'),
      ).length,
      blockedWithMarketRowPresent: exactSelections.filter(
        (selection) => selection.route.decision === 'ROUTE_BLOCKED' && selection.route.marketRowPresent,
      ).length,
      existingPrimaryConflicts: exactSelections.filter((selection) =>
        routeBlockers(selection, 'EXISTING_PRIMARY_FOR_OTHER_PRODUCT'),
      ).length,
    },
    engineProfileExpectation: countBy(products, (product) => product.readiness.engineProfileExpectation),
    alternativesRecorded: alternatives.length,
    consistencyChecksFailed: consistencyChecks.filter((entry) => !entry.passed).length,
    sources: sourceTable.size,
    texts: textTable.size,
    // Version-specific counts (v23: workbook status by slot, routes held); none in v12.
    ...profile.extraCounts({ selections, exactSelections, countBy }),
  };

  return {
    schema: REGISTRY_SCHEMA,
    registryId: profile.registryId,
    proposalNamespace: namespace,
    keyFormats: keyFormatsFor(namespace),
    source: {
      workbook: profile.workbook.basename,
      sha256: workbookSha256,
      workbookState: workbook.dashboard.state,
      workbookStateRef: workbook.dashboard.ref,
      ...sourceFields,
      authority: [...profile.authority],
      sheetsUsed: profile.sheetsUsed(workbook.sheetNames),
      sheetsInWorkbook: workbook.sheetNames.length,
    },
    catalogSnapshot: {
      path: snapshotPath,
      sha256: snapshotSha256,
      capturedAt: snapshot.capturedAt,
      projectRef: snapshot.projectRef,
      sharedWithProduction: snapshot.sharedWithProduction,
      catalogMarketCountries: [...catalogMarkets].sort(compareText),
      marketCountryForeignKeys: results.marketCountryForeignKeys,
      activePrimaryAssignments: activeAssignments,
      ...(snapshotNotes ?? {}),
    },
    invariants: {
      newPiCreated: 0,
      mapperModified: false,
      prIngNumbersAssigned: false,
      forcedTo75: false,
      silentSubstitutes: 0,
      stabilizerTaraMandatory: false,
    },
    notes: profile.notes({ workbook }),
    universalReviewRequired: profile.universalReviewRequired(),
    base,
    countries,
    regions,
    products,
    selections,
    openGaps,
    alternatives,
    globalGates,
    dedupe: {
      rule: 'Same GTIN = one product with several market routes. Different GTIN, SKU/article, pack or formulation = never merged. No GTIN: merged only with the same brand, the same article code and the same pack. Name similarity alone never merges.',
      possibleDuplicatesNotMerged: possibleDuplicates,
      workbookExistingPrReferences,
    },
    consistencyChecks,
    counts,
    sources,
    texts,
  };
}

// ------------------------------------------------------------- profiles
// A registry profile names one owner-workbook version: registry id, key
// namespace, pinned workbook, the sheets its parser reads, and its trail — the
// sheets that carry the current sync and the open-case ledger, what each
// selection records from them, and the workbook checks that prove them
// consistent. Identity, dedupe, readiness and routes are shared; a version
// changes them only through the explicit readiness/route hooks.

const keyFormatsFor = (ns) => ({
  proposalKey: `${ns}:<ISO2>:<SLOT>:<GTIN-gtin14 | SKU-… | NAME-hash10> — one per country × slot selection`,
  productKeyGtin: `${ns}:<SLOT>:GTIN-<gtin14> — market-independent`,
  productKeyBrandArticle: `${ns}:<SLOT>:SKU-<BRAND>-<ARTICLE>-<PACK> — market-independent`,
  productKeyListingCode: `${ns}:<ISO2>:<SLOT>:SKU-<CODE> — single market, brand not disclosed`,
  productKeyNameHash: `${ns}:<ISO2>:<SLOT>:NAME-<hash10> — single market, no code`,
  prIng: 'Never assigned here. PR-ING codes are issued by the database at ingest; existing codes are reused.',
});

const ENGINE_ROUTABILITY_NOTE =
  'resolve_country_product_slots_v1 only returns a product whose current version passes private.exact_product_has_picker_profile_v1 (numeric water, totalSolids, fat, protein, carbohydrate, sugars, salt; engineUsable; BASE_RECIPE; active slot review). Identity-only or ESTIMATED products do not route.';
const MANUFACTURER_REVIEW_REASON =
  'The workbook keeps manufacturer and supplier/retailer in one column; it is preserved verbatim, not split.';
const SOURCE_TABLE_NOTE =
  '`sources` holds every source URL once, keyed SRC-<first 10 hex of sha256(url)>; products and selections list sourceIds.';

const countryRoleKey = (country, role) => `${country}|${SLOT_BY_WORKBOOK_ROLE[role]}`;

export const V12_REGISTRY_PROFILE = Object.freeze({
  label: 'v12',
  registryId: REGISTRY_ID,
  namespace: PROPOSAL_NAMESPACE,
  workbook: V12_WORKBOOK,
  sheetsUsed: sheetsUsedByParser,
  authority: Object.freeze([
    '39_SYNC_V12 and 40_POZOSTALE_V12 applied on top of 11_MLEKO_75, 14_SMIETANKA_75, 17_PROSZEK_75, 20_DEKSTROZA_75, 23_TARA_75',
    '13/15/18/21/24 *_PRZELICZENIA: label basis, portions, estimated-field lists',
    '04_POKRYCIE_PR, 05_PR_ING_ARTYKULY: coverage matrix and article records (cross-checked)',
    '27/36/37: case ledger and v11 evidence; 34: DE/AT audit candidates; 06: source audit dates',
  ]),
  trail: Object.freeze({
    gapRows: (workbook) => workbook.remainingV12,
    prepare: (workbook) => ({
      syncByKey: indexBy(workbook.syncV12, (row) => {
        const target = parseCountryRole(row.values.countryRole);
        return target ? countryRoleKey(target.country, target.role) : null;
      }),
      changeByKey: indexBy(workbook.changesV11, (row) => countryRoleKey(row.values.country, row.values.role)),
      evidenceByKey: groupBy(workbook.evidenceV11, (row) => countryRoleKey(row.values.country, row.values.role)),
    }),
    closedCase: (entry) => ({
      caseId: entry.values.id,
      state: entry.values.state,
      decisionV11: entry.values.decisionV11,
      decisionV12: entry.values.decisionV12,
      syncV12: entry.values.syncV12,
      remainingOutsideSelection: entry.values.remainingOutsideSelection,
      sourceDate: entry.values.sourceDate,
      sourceRef: entry.ref,
    }),
    selectionFields: (prepared, { key, workbook }) => {
      const sync = prepared.syncByKey.get(key) ?? null;
      const change = prepared.changeByKey.get(key) ?? null;
      const evidence = prepared.evidenceByKey.get(key) ?? [];
      return {
        evidenceV11: evidence.map((entry) => ({
          id: entry.values.id,
          date: entry.values.date,
          resolution: entry.values.resolution,
          scope: entry.values.scope,
          sourceRef: entry.ref,
        })),
        changeV11: change
          ? {
              caseId: change.values.caseId,
              productBefore: change.values.productBefore,
              productAfter: change.values.productAfter,
              decision: change.values.decision,
              evidenceId: change.values.evidence,
              sourceRef: change.ref,
            }
          : null,
        syncV12: sync
          ? {
              caseId: sync.values.id,
              v11: sync.values.v11,
              v12: sync.values.v12,
              decision: sync.values.decision,
              basis: sync.values.basis,
              date: workbook.syncMeta.date,
              sourceRef: sync.ref,
            }
          : null,
      };
    },
    evidenceDates: (selection) => [
      ...selection.evidenceV11.map((entry) => entry.date),
      ...(selection.syncV12 ? [selection.syncV12.date] : []),
      ...selection.closedCases.map((entry) => entry.sourceDate),
    ],
    remainingHeader: (workbook) => ({ total: workbook.remainingMeta.total, byRole: workbook.remainingMeta.byRole }),
    checks: ({ workbook, openGaps, countedByRole, check }) => {
      const open27 = new Set(
        workbook.checklist
          .filter((row) => /OTWARTE|ZABLOKOWANE/.test(String(row.values.state)))
          .map((row) => row.values.id),
      );
      const open40 = new Set(openGaps.map((gap) => gap.id));
      check(
        'CHECKLIST_27_OPEN_EQUALS_40',
        open27.size === open40.size && [...open27].every((id) => open40.has(id)),
        `27_CHECKLIST_AKTYWNA open/blocked ids (${open27.size}) equal 40_POZOSTALE_V12 ids (${open40.size})`,
      );
      const headerCounts = workbook.remainingMeta.byRole;
      check(
        'REMAINING_40_HEADER_EQUALS_ROWS',
        workbook.remainingMeta.total === openGaps.length &&
          GAP_ROLE_ORDER.every((role) => headerCounts[role] === countedByRole[role]),
        `40_POZOSTALE_V12 header ${JSON.stringify({ total: workbook.remainingMeta.total, ...headerCounts })} vs rows ${JSON.stringify({ total: openGaps.length, ...countedByRole })}`,
      );
      check(
        'SYNC_39_OPEN_COUNT_EQUALS_40',
        workbook.syncMeta.openV12 === openGaps.length,
        `39_SYNC_V12 "Stan v12" ${workbook.syncMeta.openV12} vs 40_POZOSTALE_V12 rows ${openGaps.length}`,
      );
    },
    sourceFields: (workbook) => ({
      v12SyncDate: workbook.syncMeta.date,
      openCasesV11: workbook.syncMeta.openV11,
      openCasesV12: workbook.syncMeta.openV12,
      gtinRule: workbook.syncMeta.rule,
      identityRule: workbook.syncMeta.identityRule,
      remainingNote: workbook.remainingMeta.note,
    }),
  }),
  notes: () => ({
    sourceTable: SOURCE_TABLE_NOTE,
    textTable: `\`texts\` holds workbook notes longer than ${TEXT_INLINE_LIMIT} characters once, keyed TXT-<first 10 hex of sha256(text)>; such values appear as the id in selections.notes / availabilityEvidence / evidenceV11 / changeV11 / syncV12 / closedCases and in products.technicalSpec / crossRowDifferences.`,
    coverageMatrixStatus:
      'selections[].workbook.coverageMatrixStatus is the 04_POKRYCIE_PR label, which predates the v12 sync; the v12 state is selectionState (40_POZOSTALE_V12 + 39_SYNC_V12).',
    engineRoutability: ENGINE_ROUTABILITY_NOTE,
    globalGatesOpenForEverySelection: ['R8-G01', 'R8-G02', 'R9-G03'],
  }),
  universalReviewRequired: () => [
    {
      field: 'labelLanguage',
      reason: 'The v12 workbook records no label language / locale for any product; left null.',
    },
    { field: 'manufacturerOrSupplier', reason: MANUFACTURER_REVIEW_REASON },
    {
      field: 'lot / CoA',
      reason: 'Global gate R8-G02: product and lot documentation remain open for every product.',
    },
  ],
  readinessBlockers: () => [],
  routeBlockers: () => [],
  extraCounts: () => ({}),
});

// v23 (FINAL for the six base roles): the current trail is 83_SYNC_V23 (the
// cases v23 closed) and 84_POZOSTALE_V23 (open/blocked count + the global
// dependencies). Every selection stays as the workbook selects it; the v23
// 04_POKRYCIE_PR status decides whether a DB route may be created.

/** 04_POKRYCIE_PR statuses v23 uses; READY_PI is the global sucrose PI. */
const V23_KNOWN_STATUSES = Object.freeze(['KANDYDAT_PR', 'READY_PR', 'READY_PI', 'WYMAGA_GTIN', 'KANDYDAT_WARUNKOWY']);
/** Statuses under which the owner-approved DB package may create or reuse a PR route. */
const V23_ACTIVATABLE_STATUSES = new Set(['KANDYDAT_PR', 'READY_PR']);
const AVAILABLE_CARBOHYDRATE = 'AVAILABLE_EXCLUDING_FIBER';

/** "2026-09-12" or "12.09.2026" → "2026-09-12"; anything else → null. */
function isoDate(value) {
  const text = cleanText(value === null || value === undefined ? null : String(value));
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
  return dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : null;
}

/** Newest per-version decision of a 27_CHECKLIST_AKTYWNA case (v11 … v23). */
function latestChecklistDecision(entry) {
  const group = [...CHECKLIST_DECISION_GROUPS]
    .reverse()
    .find((candidate) => entry.values[candidate.decision] !== null && entry.values[candidate.decision] !== undefined);
  if (!group) return null;
  const [first, last] = group.columns.split(':');
  return {
    version: group.version,
    date: group.date ? entry.values[group.date] : null,
    decision: entry.values[group.decision],
    sources: entry.values[group.sources],
    remaining: entry.values[group.remaining],
    sourceRef: `${entry.sheet}!${first}${entry.rowNumber}:${last}${entry.rowNumber}`,
  };
}

/** A STABILIZER carbohydrate value outside the available-carbohydrate convention is never sent as label data. */
const carbohydrateConventionBlockers = (product) =>
  product.slot === 'STABILIZER' && product.nutrition.carbohydrateConvention !== AVAILABLE_CARBOHYDRATE
    ? [`CARBOHYDRATE_CONVENTION:${product.nutrition.carbohydrateConvention ?? 'UNSTATED'}`]
    : [];

const v23CasesRow = (workbook) => workbook.syncV23.summary.find((row) => row.values.scope === 'Przypadki');

function v23TrailChecks({ workbook, openGaps, countedByRole, remainingHeader, check, rows, selections, products, alternatives, globalGates }) {
  const sync = workbook.syncV23;
  const casesRow = v23CasesRow(workbook);

  const open27 = workbook.checklist
    .filter((row) => /OTWARTE|ZABLOKOWANE/.test(String(row.values.state)))
    .map((row) => row.values.id);
  const openIds = new Set(openGaps.map((gap) => gap.id));
  check(
    'CHECKLIST_27_OPEN_EQUALS_84',
    open27.length === openIds.size && open27.every((id) => openIds.has(id)),
    `27_CHECKLIST_AKTYWNA open/blocked ids (${open27.length}) equal 84_POZOSTALE_V23 open cases (${openIds.size})`,
  );
  check(
    'REMAINING_84_EQUALS_ROWS',
    remainingHeader.total === openGaps.length,
    `84_POZOSTALE_V23 “Otwarte / zablokowane” ${remainingHeader.total} vs open-gap rows ${openGaps.length}`,
  );
  check(
    'SYNC_83_REMAINING_EQUALS_84',
    casesRow.values.remaining === remainingHeader.total &&
      GAP_ROLE_ORDER.every((role) => remainingHeader.byRole[role] === countedByRole[role]),
    `83_SYNC_V23 “Pozostało” ${JSON.stringify({ total: casesRow.values.remaining, ...remainingHeader.byRole })} vs 84_POZOSTALE_V23 ${remainingHeader.total} and rows ${JSON.stringify({ total: openGaps.length, ...countedByRole })}`,
  );

  const casesByRole = {};
  for (const row of sync.cases) casesByRole[row.values.role] = (casesByRole[row.values.role] ?? 0) + 1;
  const roleRows = sync.summary.filter((row) => row !== casesRow);
  const arithmetic = sync.summary.every((row) => row.values.before - row.values.closed === row.values.remaining);
  const rolesMatch =
    roleRows.every((row) => row.values.closed === (casesByRole[row.values.scope] ?? 0)) &&
    Object.keys(casesByRole).every((role) => roleRows.some((row) => row.values.scope === role));
  check(
    'SYNC_83_SUMMARY_EQUALS_CASES',
    casesRow.values.closed === sync.cases.length && arithmetic && rolesMatch,
    `83_SYNC_V23 Przypadki ${casesRow.values.before} − ${casesRow.values.closed} = ${casesRow.values.remaining}; ${sync.cases.length} case rows by role ${JSON.stringify(casesByRole)} vs summary ${JSON.stringify(Object.fromEntries(roleRows.map((row) => [row.values.scope, row.values.closed])))}`,
  );

  const rowByKey = new Map(rows.map((row) => [`${row.country}|${row.slot}`, row]));
  const checklistById = new Map(workbook.checklist.map((row) => [row.values.id, row]));
  const caseProblems = [];
  for (const entry of sync.cases) {
    const row = rowByKey.get(countryRoleKey(entry.values.country, entry.values.role));
    if (
      !row ||
      cleanText(row.selection.values.product) !== cleanText(entry.values.selectedProduct) ||
      row.workbookKey !== entry.values.productKey
    ) {
      caseProblems.push(`${entry.values.id}: the active sheet names ${row ? `"${row.selection.values.product}" / ${row.workbookKey}` : 'no row'}`);
    }
    const ledger = checklistById.get(entry.values.id);
    if (
      !ledger ||
      !/ZAMKNI/.test(String(ledger.values.state)) ||
      iso2FromCountryCell(ledger.values.country) !== entry.values.country ||
      ledger.values.role !== entry.values.role ||
      cleanText(ledger.values.product) !== cleanText(entry.values.selectedProduct)
    ) {
      caseProblems.push(`${entry.values.id}: 27_CHECKLIST_AKTYWNA ${ledger ? `${ledger.values.state} / ${ledger.values.country} / ${ledger.values.product}` : 'has no row'}`);
    }
  }
  check(
    'SYNC_83_CASES_MATCH_ACTIVE_SHEETS',
    caseProblems.length === 0,
    caseProblems.length === 0
      ? `${sync.cases.length} cases: selected product and workbook key equal the per-ingredient sheet; the 27_CHECKLIST_AKTYWNA row is closed for the same country, role and product`
      : caseProblems.join('; '),
  );

  const gateIds = new Set(globalGates.map((gate) => gate.id));
  const dependencies = workbook.remainingV23.dependencies.map((row) => row.values.id);
  check(
    'REMAINING_84_DEPENDENCIES_ARE_GLOBAL_GATES',
    dependencies.length > 0 && dependencies.every((id) => gateIds.has(id)),
    `84_POZOSTALE_V23 dependencies ${dependencies.join(', ')} ⊆ global gates ${[...gateIds].join(', ')}`,
  );

  const controls = workbook.controlsV23.rows;
  const notPass = controls.filter((row) => row.values.result !== 'PASS');
  const numbered = controls.every((row, index) => row.values.number === index + 1);
  check(
    'CONTROLS_88_ALL_PASS',
    controls.length > 0 && notPass.length === 0 && numbered,
    `88_KONTROLA_V23: ${controls.length} controls, ${controls.length - notPass.length} PASS${notPass.length > 0 ? `; not PASS: ${notPass.map((row) => row.values.number).join(', ')}` : ''}${numbered ? '' : '; numbering is not 1…n'}`,
  );

  const sourceById = new Map(workbook.sources.map((row) => [row.values.id, row]));
  const evidenceProblems = workbook.evidenceV23.rows
    .filter((row) => cleanText(sourceById.get(row.values.id)?.values.url) !== cleanText(row.values.url))
    .map((row) => row.values.id);
  check(
    'EVIDENCE_86_IN_06_ZRODLA',
    evidenceProblems.length === 0,
    `${workbook.evidenceV23.rows.length} rows of 86_DOWODY_V23 appear in 06_ZRODLA with the same reference${evidenceProblems.length > 0 ? `; missing or different: ${evidenceProblems.join(', ')}` : ''}`,
  );

  const us = rowByKey.get('US|STABILIZER');
  const usField = (name) => workbook.usTaraV23.fields.find((row) => row.values.field === name)?.values.value ?? null;
  const expected = {
    energyKcal: usField('Energia'),
    fat: usField('Tłuszcz'),
    saturatedFat: usField('Nasycone'),
    carbohydrate: usField('Total carbohydrate'),
    sugars: usField('Total sugars'),
    protein: usField('Białko'),
    salt: usField('Sól'),
    fibre: usField('Dietary Fiber (2016)'),
  };
  const pin = String(usField('PIN / SKU') ?? '');
  const usProblems = [];
  if (!us) usProblems.push('no US STABILIZER row');
  else {
    for (const [field, value] of Object.entries(expected)) {
      if (us.selection.values[field] !== value) usProblems.push(`${field}: 85=${value} 23=${us.selection.values[field]}`);
    }
    if (us.nutrition.carbohydrateConvention !== 'US_TOTAL_CARBOHYDRATE_NDC') usProblems.push(`convention ${us.nutrition.carbohydrateConvention}`);
    if (!pin || !String(us.fields.skuText ?? '').includes(pin)) usProblems.push(`PIN ${pin || '—'} not in the SKU cell`);
  }
  check(
    'USA_TARA_85_EQUALS_23',
    usProblems.length === 0,
    usProblems.length === 0
      ? `85_USA_TARA_V23 ${JSON.stringify(expected)} equal 23_TARA_75 US; convention US_TOTAL_CARBOHYDRATE_NDC; PIN ${pin}`
      : usProblems.join('; '),
  );

  const selectionByKey = new Map(selections.map((selection) => [selection.selectionKey, selection]));
  const productByKey = new Map(products.map((product) => [product.productKey, product]));
  const leadHits = alternatives.filter((alternative) => {
    const selection = selectionByKey.get(alternative.selectedSelectionKey);
    const product = productByKey.get(selection?.productKey);
    const codeKey = /^\d{8,14}$/.test(String(alternative.code ?? '')) ? gtinComparisonKey(alternative.code) : null;
    const sameCode = Boolean(codeKey && product?.identity.gtin && gtinComparisonKey(product.identity.gtin) === codeKey);
    const name = foldForComparison(alternative.name);
    const sameName = name !== '' && (name === foldForComparison(selection?.localName) || name === foldForComparison(product?.exactName));
    return sameCode || sameName;
  });
  check(
    'ALTERNATIVES_ARE_NOT_V23_SELECTIONS',
    leadHits.length === 0,
    `${alternatives.length} alternative leads (39_SYNC_V12, 34_PRODUKTY_DE_AT) vs the v23 selections they point at: ${leadHits.length === 0 ? 'none has the selected GTIN or name' : leadHits.map((entry) => `${entry.country}/${entry.slot} ${entry.name}`).join('; ')}`,
  );

  const statusCounts = {};
  const statusProblems = [];
  for (const row of workbook.coverage) {
    const status = row.values.status;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (!V23_KNOWN_STATUSES.includes(status)) statusProblems.push(`${row.ref}: unknown status ${status}`);
    if ((status === 'READY_PI') !== (row.values.role === 'SUCROSE')) statusProblems.push(`${row.ref}: ${status} for ${row.values.role}`);
  }
  for (const row of rows.filter((entry) => entry.coverage.values.status === 'READY_PR')) {
    const product = products.find((entry) => entry._rows.includes(row));
    if (product?.catalog.decision !== 'REUSE_EXISTING_PR' || product.catalog.existingPrIng !== row.coverage.values.finalPrIng) {
      statusProblems.push(`${row.coverage.ref}: READY_PR ${row.coverage.values.finalPrIng} but catalog ${product?.catalog.decision} ${product?.catalog.existingPrIng}`);
    }
  }
  check(
    'COVERAGE_04_V23_STATUSES',
    statusProblems.length === 0,
    statusProblems.length === 0
      ? `04_POKRYCIE_PR statuses ${JSON.stringify(Object.fromEntries(Object.entries(statusCounts).sort((a, b) => compareText(a[0], b[0]))))}; READY_PI only for SUCROSE; READY_PR only on the reused existing PR-ING`
      : statusProblems.join('; '),
  );
}

export const V23_REGISTRY_PROFILE = Object.freeze({
  label: 'v23',
  registryId: 'GELATO_BASE_V23',
  namespace: 'V23',
  workbook: V23_WORKBOOK,
  sheetsUsed: sheetsUsedByV23,
  authority: Object.freeze([
    '83_SYNC_V23 (cases closed in v23) and 84_POZOSTALE_V23 (open/blocked count, global dependencies) — the current trail — applied on top of 11_MLEKO_75, 14_SMIETANKA_75, 17_PROSZEK_75, 20_DEKSTROZA_75, 23_TARA_75',
    '13/15/18/21/24 *_PRZELICZENIA: label basis, portions, estimated-field lists; TARA carbohydrate per the convention in 23_TARA_75!AD, fibre as declared per market',
    '04_POKRYCIE_PR (v23 status and activation condition per selection), 05_PR_ING_ARTYKULY: coverage matrix and article records (cross-checked)',
    '27: case ledger with the latest per-version decision (v11…v23); 85: US TARA exact values (cross-checked); 86 → 06: sources and audit dates; 88: owner controls (all PASS required)',
    '34_PRODUKTY_DE_AT and 39_SYNC_V12 (history): alternative leads only; 36/37/40 and the v13–v22 trail sheets are history, not re-applied',
  ]),
  trail: Object.freeze({
    gapRows: (workbook) => workbook.remainingV23.rows,
    prepare: (workbook) => ({
      syncDate: v23CasesRow(workbook)?.values.date ?? null,
      caseByKey: indexBy(workbook.syncV23.cases, (row) => {
        if (!SLOT_BY_WORKBOOK_ROLE[row.values.role]) fail(`unknown role ${row.values.role} in ${row.ref}`);
        return countryRoleKey(row.values.country, row.values.role);
      }),
    }),
    closedCase: (entry) => ({
      caseId: entry.values.id,
      state: entry.values.state,
      latestDecision: latestChecklistDecision(entry),
      sourceDate: entry.values.sourceDate,
      sourceRef: entry.ref,
    }),
    selectionFields: (prepared, { key, sourceIdFor }) => {
      const row = prepared.caseByKey.get(key) ?? null;
      return {
        syncV23: row
          ? {
              caseId: row.values.id,
              previousProduct: row.values.previousProduct,
              selectedProduct: row.values.selectedProduct,
              workbookProductKey: row.values.productKey,
              result: row.values.result,
              sourceIds: uniqueSorted(extractUrls(row.values.sources).map(sourceIdFor)),
              date: prepared.syncDate,
              sourceRef: row.ref,
            }
          : null,
      };
    },
    evidenceDates: (selection) =>
      [
        selection.syncV23?.date,
        ...selection.closedCases.flatMap((entry) => [entry.sourceDate, entry.latestDecision?.date]),
      ]
        .map(isoDate)
        .filter(Boolean),
    remainingHeader: (workbook) => {
      const byScope = new Map(workbook.syncV23.summary.map((row) => [row.values.scope, row]));
      const byRole = Object.fromEntries(
        GAP_ROLE_ORDER.map((role) => {
          const row = byScope.get(role);
          if (!row) fail(`83_SYNC_V23 has no summary row for ${role}`);
          return [role, row.values.remaining];
        }),
      );
      return { total: workbook.remainingV23.total, byRole };
    },
    checks: v23TrailChecks,
    sourceFields: (workbook, { sourceIdFor }) => {
      const sync = workbook.syncV23;
      const casesRow = v23CasesRow(workbook);
      const remaining = workbook.remainingV23;
      const controls = workbook.controlsV23.rows;
      return {
        v23SyncDate: casesRow.values.date,
        casesBeforeV23: casesRow.values.before,
        casesClosedInV23: casesRow.values.closed,
        openCasesV23: remaining.total,
        syncPurpose: sync.purpose,
        syncSummary: sync.summary.map((row) => ({ ...row.values, sourceRef: row.ref })),
        syncNotes: sync.notes,
        syncCasesRef: sync.casesRef,
        remainingNote: remaining.note,
        remainingSummary: remaining.summary.map((row) => ({ ...row.values, sourceRef: row.ref })),
        globalDependencies: remaining.dependencies.map((row) => ({ ...row.values, sourceRef: row.ref })),
        ownerControls: {
          ref: workbook.controlsV23.ref,
          total: controls.length,
          pass: controls.filter((row) => row.values.result === 'PASS').length,
          note: workbook.controlsV23.note,
        },
        evidenceV23: workbook.evidenceV23.rows.map((row) => {
          const urls = extractUrls(row.values.url);
          return {
            id: row.values.id,
            area: row.values.area,
            name: row.values.name,
            scope: row.values.scope,
            evidenceType: row.values.evidenceType,
            sourceIds: uniqueSorted(urls.map(sourceIdFor)),
            reference: urls.length === 0 ? row.values.url : null,
            auditDate: row.values.auditDate,
            limitation: row.values.limitation,
            sourceRef: row.ref,
          };
        }),
        usTaraExactValues: {
          ref: workbook.usTaraV23.ref,
          title: workbook.usTaraV23.title,
          note: workbook.usTaraV23.note,
        },
        scopeRules: workbook.rules.map((row) => ({
          number: row.values.number,
          rule: row.values.rule,
          meaning: row.values.meaning,
          status: row.values.status,
          sourceRef: row.ref,
        })),
      };
    },
  }),
  notes: ({ workbook }) => ({
    sourceTable: SOURCE_TABLE_NOTE,
    textTable: `\`texts\` holds workbook notes longer than ${TEXT_INLINE_LIMIT} characters once, keyed TXT-<first 10 hex of sha256(text)>; such values appear as the id in selections.notes / availabilityEvidence / syncV23 / closedCases and in products.technicalSpec / crossRowDifferences.`,
    coverageMatrixStatus: `selections[].workbook.coverageMatrixStatus is the current v23 04_POKRYCIE_PR status (${V23_KNOWN_STATUSES.join(', ')}) and selections[].notes.activationCondition its activation condition (workbook.activationCondition for SUCROSE). A status other than ${[...V23_ACTIVATABLE_STATUSES].join(' / ')} adds the route blocker WORKBOOK_STATUS:<status>; the selection itself stays closed (84_POZOSTALE_V23 lists no open case).`,
    selectionTrail:
      'selections[].syncV23 is the 83_SYNC_V23 case that changed the selection in v23 (null where v23 did not change it); selections[].closedCases[].latestDecision is the newest per-version decision of that 27_CHECKLIST_AKTYWNA case (v11…v23).',
    historicalTrail:
      'The v11/v12 trail sheets (36_DOWODY_V11, 37_ZMIANY_V11, 39_SYNC_V12, 40_POZOSTALE_V12) and the v13–v22 sync sheets stay in the workbook as history and are not re-applied to v23 selections (the v12 registry keeps those records). 39_SYNC_V12 and 34_PRODUKTY_DE_AT are read only for alternative leads, each checked not to be the v23 selection.',
    carbohydrateConvention: `products[].nutrition.carbohydrateConvention (STABILIZER) is 23_TARA_75!AD; v23 declares carbohydrate per that convention and fibre as declared per market. A convention other than ${AVAILABLE_CARBOHYDRATE} (US exact TDS: US_TOTAL_CARBOHYDRATE_NDC — total carbohydrate including non-digestible carbohydrate, dietary fibre 0 under the US definition) adds CARBOHYDRATE_CONVENTION:<convention> to readiness and route blockers, so those values are never sent as available carbohydrate.`,
    crossMarketConflict:
      'Where one GTIN is listed in several workbook rows (v23 lists some products once per market) and those rows disagree on identity-relevant facts (nutrient values beyond 1e-6, estimated fields, pack, brand text), every route of that identity carries CROSS_MARKET_CONFLICT:<fields>: the product would otherwise carry one market’s label data on another market’s route. products[].crossRowDifferences shows the values per market.',
    engineRoutability: ENGINE_ROUTABILITY_NOTE,
    globalGatesOpenForEverySelection: workbook.remainingV23.dependencies.map((row) => row.values.id),
  }),
  universalReviewRequired: () => [
    {
      field: 'labelLanguage',
      reason: 'The v23 workbook records no label language / locale for any product; left null.',
    },
    { field: 'manufacturerOrSupplier', reason: MANUFACTURER_REVIEW_REASON },
    {
      field: 'lot / CoA',
      reason: 'Global dependency R8-G02 (84_POZOSTALE_V23): product and lot documentation remain open for every product; a TDS is not a lot CoA.',
    },
    {
      field: 'delivery',
      reason: 'Transport was excluded as a closing condition by the user on 2026-09-12 (08_ZASADY rule 14, 86_DOWODY_V23 V23-S06); delivery is confirmed for no market.',
    },
  ],
  readinessBlockers: (product) => carbohydrateConventionBlockers(product),
  routeBlockers: ({ product, row }) => {
    const status = row.coverage.values.status;
    return [
      ...(V23_ACTIVATABLE_STATUSES.has(status) ? [] : [`WORKBOOK_STATUS:${status}`]),
      ...carbohydrateConventionBlockers(product),
      ...crossMarketConflictBlockers(product),
    ];
  },
  extraCounts: ({ selections, exactSelections, countBy }) => ({
    workbookStatusBySlot: Object.fromEntries(
      SLOT_ORDER.map((slot) => [
        slot,
        countBy(
          selections.filter((selection) => selection.slot === slot),
          (selection) => selection.workbook.coverageMatrixStatus,
        ),
      ]),
    ),
    routesHeldByWorkbookStatus: exactSelections.filter((selection) =>
      selection.route.blockers.some((blocker) => blocker.startsWith('WORKBOOK_STATUS:')),
    ).length,
    routesHeldByCarbohydrateConvention: exactSelections.filter((selection) =>
      selection.route.blockers.some((blocker) => blocker.startsWith('CARBOHYDRATE_CONVENTION:')),
    ).length,
    routesHeldByCrossMarketConflict: exactSelections.filter((selection) =>
      selection.route.blockers.some((blocker) => blocker.startsWith('CROSS_MARKET_CONFLICT:')),
    ).length,
  }),
});

/**
 * One GTIN, several workbook rows (v23 lists some products once per market)
 * that disagree on identity-relevant facts — nutrient values beyond 1e-6,
 * estimated fields, pack or brand text. Writing that product would put one
 * market's label data on another market's route, so the identity gets no DB
 * route until the workbook rows agree. (v12 has no such identity.)
 */
function crossMarketConflictBlockers(product) {
  const fields = [];
  for (const difference of product.crossRowDifferences) {
    if (!IDENTITY_RELEVANT_DIFFERENCES.has(difference.field)) continue;
    if (difference.field !== 'nutrition.workingProfile') {
      fields.push(difference.field);
      continue;
    }
    const keys = uniqueSorted(difference.values.flatMap((entry) => Object.keys(entry.value ?? {})));
    const differing = keys.filter((key) => {
      const values = difference.values.map((entry) => entry.value?.[key] ?? null);
      if (values.every((value) => typeof value === 'number')) return Math.max(...values) - Math.min(...values) > 1e-6;
      return new Set(values.map((value) => JSON.stringify(value))).size > 1;
    });
    fields.push(...differing.map((key) => `nutrition.${key}`));
  }
  return fields.length > 0 ? [`CROSS_MARKET_CONFLICT:${fields.join(',')}`] : [];
}
