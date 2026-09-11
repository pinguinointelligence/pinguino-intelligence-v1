import type {
  EvidenceSource,
  ProductEvidenceField,
  ProductEvidenceInput,
} from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';
import type { WorkingNumericField } from '../../../src/features/product-intelligence/productFieldTruth.ts';
import type {
  ProductSemanticClassification,
  ProductSemanticEvidence,
} from '../../../src/features/product-intelligence/productRecognition.ts';
import type { ProfileMatchInput } from '../../../src/features/product-intelligence/mapperValueInference.ts';

type JsonObject = Record<string, unknown>;

const objectValue = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const evidenceRows = (root: JsonObject): JsonObject[] =>
  Array.isArray(root.evidence) ? root.evidence.map(objectValue) : [];

const externalRows = (root: JsonObject): JsonObject[] =>
  Array.isArray(root.externalSources) ? root.externalSources.map(objectValue) : [];

const unresolvedConflictFields = (root: JsonObject): string[] =>
  Array.isArray(root.conflicts)
    ? root.conflicts.flatMap((value) => {
        const conflict = objectValue(value);
        return conflict.retainedSource === null && typeof conflict.field === 'string'
          ? [conflict.field]
          : [];
      })
    : [];

const SCAN_FIELD_PATHS: Readonly<Partial<Record<ProductEvidenceField, string[]>>> = {
  identity: ['identity.displayName', 'identity.originalName'],
  brand: ['identity.brand'],
  manufacturer: ['manufacturer'],
  variant: ['identity.variant'],
  netQuantity: ['package.netQuantity', 'package.netQuantityText'],
  ingredients: ['ingredientsText'],
  allergens: ['allergensText', 'mayContainAllergens'],
  nutritionBasis: ['nutrition.basis'],
  energyKcal: ['nutrition.energyKcal'],
  fat: ['nutrition.fat'],
  carbohydrate: ['nutrition.carbohydrate'],
  sugars: ['nutrition.sugars'],
  fiber: ['nutrition.fibre'],
  protein: ['nutrition.protein'],
  salt: ['nutrition.salt'],
  barcode: ['barcodes'],
  countryOfOrigin: ['identity.countryOfOrigin'],
  dosage: ['productionDeclarations.dosageText'],
  technicalParameters: ['productionDeclarations.technicalParametersText'],
  technicalSource: ['productionDeclarations.technicalParametersText'],
};

const sourceForExternalType = (value: unknown): EvidenceSource => {
  if (value === 'manufacturer') return 'manufacturer';
  if (value === 'barcode_registry') return 'barcode_registry';
  if (value === 'retailer') return 'retailer';
  return 'web_search';
};

function hasDirectLabelEvidence(root: JsonObject, paths: readonly string[]): boolean {
  return evidenceRows(root).some(
    (row) =>
      row.source === 'label' &&
      row.directVisibility === true &&
      typeof row.field === 'string' &&
      paths.includes(row.field),
  );
}

function externalRowForField(root: JsonObject, paths: readonly string[]): JsonObject | null {
  for (const row of externalRows(root)) {
    const fields = Array.isArray(row.fieldsUsed)
      ? row.fieldsUsed.filter((field): field is string => typeof field === 'string')
      : [];
    if (paths.some((path) => fields.includes(path))) return row;
  }
  return null;
}

function externalEvidenceSource(root: JsonObject, paths: readonly string[]): EvidenceSource | null {
  const row = externalRowForField(root, paths);
  return row ? sourceForExternalType(row.sourceType) : null;
}

/*
  PROVENANCE BRIDGE, consumer side (owner decision 2026-09-07).

  `sourceAuthorityClass` is assigned by classifySourceAuthority inside intimport-enrich and now
  survives into the externalSources row. These two helpers are the only readers, and both refuse
  anything the CLIENT could have written: the class is only ever believed together with a URL
  that carries the scanned GTIN, so a page the customer's device could name cannot promote
  itself.
*/
const SERVER_TRUSTED_AUTHORITY = new Set([
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_BRAND',
  'OFFICIAL_PRIVATE_LABEL',
  'OFFICIAL_TECHNICAL_PDF',
  'STRUCTURED_PRODUCT_DATABASE',
  'AUTHORITATIVE_RETAILER',
]);

const scannedGtins = (root: JsonObject): string[] =>
  (Array.isArray(root.barcodes) ? root.barcodes.map(objectValue) : [])
    .map((entry) => (typeof entry.value === 'string' ? entry.value.replace(/\D/g, '') : ''))
    .filter((value) => value.length >= 8);

/**
 * A source speaks for THIS product only when the page it came from names the code that was
 * scanned. Domain reputation alone is not identity: `AUTHORITATIVE_RETAILER` proves the seller is
 * real, never that the page is the right article.
 */
function exactEanBackedAuthority(
  root: JsonObject,
  paths: readonly string[],
): { authority: string; row: JsonObject } | null {
  const row = externalRowForField(root, paths);
  if (!row) return null;
  const authority = typeof row.sourceAuthorityClass === 'string' ? row.sourceAuthorityClass : '';
  if (!SERVER_TRUSTED_AUTHORITY.has(authority)) return null;
  /*
    Two ways a page can be shown to describe the scanned article, both compared HERE, on the
    server, never asserted by the caller:
      - the GTIN appears in the page's own URL (how a registry record is addressed), or
      - the page printed that GTIN and the enrichment reported it verbatim.
    A retailer page addressed by an internal article number — El Corte Inglés, La Tienda en Casa
    and most grocers — can only ever pass the second way, which is why it exists.
  */
  const gtins = scannedGtins(root);
  if (gtins.length === 0) return null;
  const url = typeof row.url === 'string' ? row.url.replace(/\D/g, '') : '';
  const statedEan =
    typeof row.sourceStatedEan === 'string' ? row.sourceStatedEan.replace(/\D/g, '') : '';
  const namesTheScannedArticle = gtins.some(
    (gtin) => url.includes(gtin) || (statedEan.length >= 8 && statedEan === gtin),
  );
  if (!namesTheScannedArticle) return null;
  return { authority, row };
}

const pathValue = (root: JsonObject, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => objectValue(value)[key], root);

function presentForField(root: JsonObject, field: ProductEvidenceField): boolean {
  const paths = SCAN_FIELD_PATHS[field] ?? [];
  return paths.some((path) => {
    const value = pathValue(root, path);
    return (
      (typeof value === 'string' && value.trim().length > 0) ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (Array.isArray(value) && value.length > 0)
    );
  });
}

function evidenceSource(
  root: JsonObject,
  field: ProductEvidenceField,
  userConfirmed: ReadonlySet<ProductEvidenceField>,
): EvidenceSource | null {
  if (!presentForField(root, field)) return null;
  if (userConfirmed.has(field)) return 'user_confirmed';
  const paths = SCAN_FIELD_PATHS[field] ?? [];
  if (hasDirectLabelEvidence(root, paths)) return 'label';
  return externalEvidenceSource(root, paths) ?? (field === 'barcode' ? 'label' : null);
}

const MACRO_FIELDS: Readonly<Record<string, WorkingNumericField>> = {
  energyKcal: 'kcal_per_100g',
  fat: 'fat_percent',
  protein: 'protein_percent',
  carbohydrate: 'carbohydrate_percent',
  sugars: 'total_sugars_percent',
  fibre: 'fiber_percent',
  salt: 'salt_percent',
};

const DECLARATION_SOURCES = new Set<EvidenceSource>([
  'label',
  'user_confirmed',
  'manufacturer',
  'source_file',
  'mapper_exact',
]);

/*
  SINGLE CALORIC SUGAR SOURCE CLOSURE.

  An exact nutrition table says how much sugar a product contains; the Engine needs to know WHICH
  sugars, because POD and PAC come from the spectrum and an unknown spectrum contributes zero.
  When the table is exact and the ingredient list names exactly ONE caloric sugar, the spectrum is
  not a guess — it is arithmetic: that one sugar accounts for all of it.

  The rule refuses far more often than it fires. Two candidate sugars, an ambiguous word, a
  negation ("sin azúcar"), a source conflict, or provenance that is not declaration-grade for
  BOTH the table and the list — any of these and it declines, leaving the existing unresolved
  path and the rescue that follows it untouched. Declaration-grade means direct label evidence,
  an explicit customer confirmation for this scan, or a server-proven exact-EAN source. It never
  invents a quantity: it only names the sugar the product already declares, and the computed
  spectrum stays `derived`, never `user_confirmed`.
*/
const SUCROSE_TERMS =
  /\b(sugar|sucrose|saccharose|azucar|sacarosa|zucker|saccarosio|zucchero|cukier|sucre|sucr[eo]s)\b/;

/** Any OTHER caloric sugar. One of these present and the closure is not entitled to fire. */
const OTHER_CALORIC_SUGARS =
  /\b(glucose|glukoz\w*|dextrose|dekstroz\w*|fructose|fruktoz\w*|lactose|laktoz\w*|maltose|maltoz\w*|maltodextrin\w*|maltodekstryn\w*|invert\w*|honey|miel|mi[oó]d|molasses|melas\w*|agave|jarabe|syrup|syrop|treacle|corn\s*syrup|juice|zumo|sok\b|concentrate|concentrado|koncentrat)\b/;

/** A sugar-free claim contradicts the whole premise; never read the word inside it as a sugar. */
const SUGAR_NEGATED =
  /\b(sin\s+azucar|sugar[\s-]*free|zero\s+sugar|bez\s+cukru|ohne\s+zucker|senza\s+zuccheri)\b/;

function singleCaloricSugarClosure(
  ingredientsText: string | null,
  totalSugars: number | null,
): number | null {
  if (totalSugars === null || totalSugars <= 0) return null;
  const text = ingredientsText
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!text) return null;
  if (SUGAR_NEGATED.test(text)) return null;
  if (OTHER_CALORIC_SUGARS.test(text)) return null;
  if (!SUCROSE_TERMS.test(text)) return null;
  return totalSugars;
}

export interface CustomerEvidenceProvenance {
  source: EvidenceSource;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceTitle: string | null;
  sourceAuthorityClass: string | null;
  retrievedAt: string | null;
  evidenceReceipt: string | null;
}

export interface CustomerProductProfileProposal {
  matchInput: ProfileMatchInput;
  declared: Partial<Record<WorkingNumericField, number>>;
  declaredBasis: Partial<
    Record<WorkingNumericField, 'product_declared' | 'user_confirmed' | 'derived'>
  >;
  /** The manufacturer's own basis, preserved beside the normalised values. */
  declaredNutritionBasis: 'per_100g' | 'per_100ml' | null;
  /** How `declared` was produced from it. */
  normalizationBasis: 'SOURCE_PER_100G' | 'GELLATTI_1ML_1G_NORMALIZATION' | null;
  evidence: ProductEvidenceInput;
  /** Server-assigned source authority per field, for pages that name the scanned GTIN. */
  evidenceProvenance: Partial<Record<ProductEvidenceField, CustomerEvidenceProvenance>>;
  recognitionEvidence: ProductSemanticEvidence;
  trustedRecognition: ProductSemanticClassification;
}

/**
 * Adapter only: Scanner evidence is translated into the exact proposal consumed
 * by the shared PR/PM PRODUCT_PROFILE_V1 authority. It contains no Mapper
 * calculation, no Product Accuracy weight and no Engine formula.
 */
export function customerProductProfileProposal(input: {
  scanResult: unknown;
  recognitionEvidence: ProductSemanticEvidence;
  recognition: ProductSemanticClassification;
  userConfirmedFields?: readonly ProductEvidenceField[];
}): CustomerProductProfileProposal | null {
  const root = objectValue(input.scanResult);
  const identity = objectValue(root.identity);
  const nutrition = objectValue(root.nutrition);
  const declarations = objectValue(root.productionDeclarations);
  const name = text(identity.displayName) ?? text(identity.originalName);
  const brand = text(identity.brand);
  const explicitlyUnbranded = identity.explicitlyUnbranded === true;
  const gtin = input.recognitionEvidence.gtin?.replace(/\D/g, '') ?? null;
  if (!name || (!brand && !explicitlyUnbranded) || !gtin) return null;

  const userConfirmed = new Set(input.userConfirmedFields ?? []);
  const declared: Partial<Record<WorkingNumericField, number>> = {};
  const declaredBasis: CustomerProductProfileProposal['declaredBasis'] = {};
  /* OWNER RULE (2026-08-25, frozen): Gellatti normalises 1 ml = 1 g, so a
     per-100 ml panel is read into the g-based working fields 1:1. The density
     spread between water, milk and cream is deliberately ignored and there is
     no density input. Restricting this to per_100g excluded every liquid dairy
     product — the dairy and fat carriers of every gelato base — because EU
     liquid dairy is declared per 100 ml. `declaredNutritionBasis` below keeps
     the manufacturer's own basis, so a normalised value stays distinguishable
     from a genuine per-100 g declaration. Any OTHER basis (per portion, per
     serving) is still refused: the rule converts ml to g, it does not license
     reading a panel whose basis was never established. */
  const basis = text(nutrition.basis);
  if (basis === 'per_100g' || basis === 'per_100ml') {
    for (const [key, field] of Object.entries(MACRO_FIELDS)) {
      const value = finiteNumber(nutrition[key]);
      if (value === null || (key !== 'energyKcal' && value > 100)) continue;
      const evidenceField = (key === 'fibre' ? 'fiber' : key) as ProductEvidenceField;
      const source = evidenceSource(root, evidenceField, userConfirmed);
      // A merged Scanner result may contain a lower-authority web fill beside
      // direct label values. Keep it as evidence, but never promote it into a
      // VERIFIED Engine declaration without declaration-grade provenance.
      /*
        DECLARATION_SOURCES used to be the whole test, and it lists none of the web classes. A
        nutrition panel resolved from the barcode's own registry record was therefore never a
        declaration: on Sport 001 the Mapper's similar-profile estimate stood in at credit 0.8,
        and on Sport 002 — sugar-free, so its published macros are legitimately 0 — nothing stood
        in at all and the product scored MISSING_CARBOHYDRATE_PERCENT with the value sitting in
        result_json. A registry or retailer page that names the scanned GTIN is now admitted on
        the same footing, and only then.
      */
      if (
        !source ||
        (!DECLARATION_SOURCES.has(source) &&
          exactEanBackedAuthority(root, SCAN_FIELD_PATHS[evidenceField] ?? []) === null)
      )
        continue;
      declared[field] = value;
      declaredBasis[field] = userConfirmed.has(evidenceField)
        ? 'user_confirmed'
        : 'product_declared';
    }
  }
  /*
    The spectrum closes only when BOTH the table and the ingredient list are declaration-grade
    evidence for this scan. A direct label or explicit customer confirmation is product-owned
    evidence just like a server-matched exact-EAN page; excluding those two paths let a weaker
    Mapper cohort overwrite an already confirmed one-sugar declaration. Anything lower-authority,
    or any genuine unresolved conflict, keeps the unresolved path.
  */
  const sugarsAreExact = declaredBasis.total_sugars_percent !== undefined;
  const declarationGradeForClosure = (field: ProductEvidenceField): boolean => {
    const source = evidenceSource(root, field, userConfirmed);
    return (
      source === 'label' ||
      source === 'user_confirmed' ||
      exactEanBackedAuthority(root, SCAN_FIELD_PATHS[field] ?? []) !== null
    );
  };
  const tableConfirmed = declarationGradeForClosure('sugars');
  const listConfirmed = declarationGradeForClosure('ingredients');
  const unresolvedConflicts = unresolvedConflictFields(root);
  const sugarClosureConflict = unresolvedConflicts.some(
    (field) =>
      field === 'ingredientsText' ||
      field === 'nutrition.sugars' ||
      field === 'nutrition.carbohydrate',
  );
  if (sugarsAreExact && tableConfirmed && listConfirmed && !sugarClosureConflict) {
    const sucrose = singleCaloricSugarClosure(
      text(root.ingredientsText),
      declared.total_sugars_percent ?? null,
    );
    if (sucrose !== null) {
      declared.sucrose_percent = sucrose;
      // Computed from this product's own declaration. Not the customer's word, not a Mapper guess.
      declaredBasis.sucrose_percent = 'derived';
    }
  }

  const abv = finiteNumber(declarations.alcoholAbv);
  if (abv !== null && abv <= 100) {
    declared.alcohol_percent = abv;
    declaredBasis.alcohol_percent = userConfirmed.has('technicalParameters')
      ? 'user_confirmed'
      : 'product_declared';
  }

  const fields: ProductEvidenceInput['fields'] = {};
  /*
    What productProductionAccuracy asks for when a field's source is `web_search` or `retailer`:
    `evidenceProvenance[field].sourceAuthorityClass`. Nothing on the scan path ever filled it, so
    the answer was always undefined and the credit always 0 — the ingredients text read off El
    Corte Inglés scored 0/7 while sitting in result_json. It is filled here from the class the
    server assigned, and only for a page that names the scanned GTIN.
  */
  const evidenceProvenance: Partial<Record<ProductEvidenceField, CustomerEvidenceProvenance>> = {};
  for (const field of Object.keys(SCAN_FIELD_PATHS) as ProductEvidenceField[]) {
    const source = evidenceSource(root, field, userConfirmed);
    if (source) fields[field] = source;
    const backed = exactEanBackedAuthority(root, SCAN_FIELD_PATHS[field] ?? []);
    if (backed && source)
      evidenceProvenance[field] = {
        source,
        sourceUrl: typeof backed.row.url === 'string' ? backed.row.url : null,
        sourceDomain: null,
        sourceTitle: typeof backed.row.title === 'string' ? backed.row.title : null,
        sourceAuthorityClass: backed.authority,
        retrievedAt: null,
        evidenceReceipt: null,
      };
  }
  // A locally checksum-validated GTIN is exact package evidence even when the
  // barcode decoder did not emit a Vision evidence rectangle.
  fields.barcode = fields.barcode ?? 'label';

  const knownMacros: ProfileMatchInput['knownMacros'] = {};
  for (const field of [
    'fat_percent',
    'protein_percent',
    'carbohydrate_percent',
    'total_sugars_percent',
    'fiber_percent',
    'salt_percent',
  ] as const) {
    if (typeof declared[field] === 'number') knownMacros[field] = declared[field];
  }

  return {
    matchInput: {
      name,
      variant: input.recognitionEvidence.variant,
      brand,
      category: input.recognitionEvidence.category,
      subcategory: input.recognitionEvidence.subcategory,
      barcode: gtin,
      knownMacros,
      technical: input.recognition.isTechnicalProduct,
      semantic: input.recognition,
    },
    declared,
    declaredBasis,
    declaredNutritionBasis: basis === 'per_100g' || basis === 'per_100ml' ? basis : null,
    normalizationBasis:
      basis === 'per_100ml'
        ? 'GELLATTI_1ML_1G_NORMALIZATION'
        : basis === 'per_100g'
          ? 'SOURCE_PER_100G'
          : null,
    evidence: {
      kind: input.recognition.isTechnicalProduct ? 'technical' : 'normal_food',
      fields,
      validatedBarcode: true,
      exactCanonicalMatch: false,
      mapperFamilyMatch: input.recognition.ingredientFamily !== 'unknown',
      materialConflicts: unresolvedConflicts,
    },
    evidenceProvenance,
    recognitionEvidence: input.recognitionEvidence,
    trustedRecognition: input.recognition,
  };
}
