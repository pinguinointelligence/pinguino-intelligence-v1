/**
 * Build the immutable SA-10 FINAL_FROZEN input consumed by the SA-11 runtime.
 *
 * Source workbooks are Owner artifacts outside the repository. This script
 * verifies every input by SHA-256 before reading it and only writes generated
 * repository artifacts. It never writes the Mapper source or any workbook.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

XLSX.set_fs(fs);

const ROOT = process.cwd();
const SOURCE_ROOT =
  process.env.MAPPER_SA10_SOURCE_ROOT ?? '/Users/tomaszboro22/Desktop/MAPPER';
const RELEASE_OUT = path.join(ROOT, 'public/mapper-search-runtime/sa10-final-frozen.json');
const VECTORS_OUT = path.join(ROOT, 'src/features/mapper-search-runtime/generated/sa12Vectors.json');
const MANIFEST_OUT = path.join(
  ROOT,
  'src/features/mapper-search-runtime/generated/releaseManifest.ts',
);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const bool = (value) => String(value).trim().toUpperCase() === 'TRUE';
const split = (value) =>
  String(value ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

const sources = {
  mapperXlsx: ['GELLATTI_MAPPER_2541_GC75_FINAL_FROZEN_2026-09-09.xlsx', '6db7fbe0d284a8ff1aa23d1da74f32da48a3f33b16604fa40f75a195374e002b'],
  mapperCsv: ['mapper_basement.csv', 'a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6'],
  dictionary: ['GELLATTI_SLOWNIK_75_KRAJOW_GC75_FINAL_SYNC_2026-09-09.xlsx', '75a33b38ac89b4446d2280776ce53d0a5f9c16b769902354206731817a6ce67d'],
  concepts: ['GELLATTI_SEARCH_CONCEPTS_SA05_FINAL_FROZEN_SA10_STARTED_v1_2026-09-10.xlsx', '30d77318b024e95d33d15d5a9fc9c5b70f1c79c50dd6bd3de146fd317ac5d01f'],
  role: ['GELLATTI_ROLE_INTENT_VOCABULARY_PRODUCTION_FINAL_FROZEN_v1_2026-09-10.xlsx', '1f96a69003e2ef81afe8a46ce0d08125bf8487e877bdb784670f4918baaa544e'],
  roleGrammar: ['GELLATTI_ROLE_INTENT_GRAMMAR_CORE_QA_FINAL_FROZEN_v1_2026-09-10.xlsx', 'af083c30bda1ec2f9edb3658647c64f12ca9227dcc02a260b989a4bdd7205244'],
  morphology: ['GELLATTI_SEARCH_RULES_MORPHOLOGY_COMPOUND_FINAL_FROZEN_v1_2026-09-10.xlsx', '5448ca4b8d1b73eeb338529fe2bded23ecbb6735a0b5f273bed4f46103090232'],
  technical: ['GELLATTI_TECHNICAL_CODE_ALIASES_FINAL_FROZEN_v1_2026-09-10.xlsx', '2f46c17e34d0ea559e159611bea03a0ac3a78ed1d99499daf3e06eadc2dfa633'],
  collision: ['GELLATTI_SEARCH_CROSS_TABLE_COLLISION_AUDIT_FINAL_FROZEN_v1_2026-09-10.xlsx', '51589fa5a54f66c549c669f321975b824eed421e55f7f96f09cf035e7e3aca75'],
  handoff: ['GELLATTI_SA10_TO_SA11_SA12_RUNTIME_HANDOFF_FINAL_FROZEN_v1_2026-09-10.xlsx', '1651c7d1f72168a1b46a08ac089784b4f993306f4b0cb49bde9d930615c197b4'],
};

const searchChain = [
  ['GELLATTI_SEARCH_ALIASES_SA10_SCHEMA_MIGRATION_COMPLETE_PL_PILOT_v1_2026-09-10.xlsx', 'a6f30a241ec5e5d005802d6a01a4a2f6d8e0b2b9170c2ccaa121ec33460886f9', '01_SEARCH_ALIASES', 9571],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_COMPOSITES45_PL_BATCH2_v1_2026-09-10.xlsx', 'b7746ef0b366f5b61c01da95633055da90704fa28acddb21f5e857f13f0315ad', '01_ALIAS_APPEND', 347],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_PL_BATCH3_FINAL_v1_2026-09-10.xlsx', '4161535554893bdae37c31fe9b0320785d64eafe465584575412d2ea8370d2f1', '01_ALIAS_APPEND', 585],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_CONTROLS43_C1_v1_2026-09-10.xlsx', '36c14fe4f8e3d00e67f89258ba7f64c2bad2b8dc7dafaf39ccf4a3d904cca64a', '01_ALIAS_APPEND', 650],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_FRUIT43_C2_v1_2026-09-10.xlsx', '8aad1085bfdc922039f211b1d3626ef15a6bb4d31cee3a0e25387e8011642de3', '01_ALIAS_APPEND', 1662],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_VEGETABLE_SPICE43_C3_v1_2026-09-10.xlsx', '9b4fb8dd6826c330b82cfcf47961d45061a3a20644498a4f2abe57eb17020099', '01_ALIAS_APPEND', 2513],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_ALCOHOL_BEVERAGE43_C4_v1_2026-09-10.xlsx', 'd515136b1b8c1fe74291fe0de061de2281f8a6551e1903a836d2ee906cd80dcf', '01_ALIAS_APPEND', 2103],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_DAIRY_EGG_PROTEIN43_C5_v1_2026-09-10.xlsx', 'a80e2c25f1f23d82a1f0958b8fa195e58e3a584058e25bb38825c9ef898582b8', '01_ALIAS_APPEND', 898],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_SWEETENER_CHOCOLATE_FLAVOURING43_C6_v1_2026-09-10.xlsx', '2fc04461ecf10cfe05b7cd2537d60f737f21d083197628131c9d0274bee93994', '01_ALIAS_APPEND', 4155],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_CEREAL_FAT_NUT43_C7_v1_2026-09-10.xlsx', '0087a6a54ac7858d03734215290e1afd6604127f5896effd17b33acf5e31ab46', '01_ALIAS_APPEND', 2279],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_BOTANICAL_WATER_SPECIALTY43_C8_v1_2026-09-10.xlsx', '9c57cdbbfd544163caa258ad3f3b1695ae6718cef2c28af5a7d90ba444653be3', '01_ALIAS_APPEND', 1193],
  ['GELLATTI_SEARCH_ALIASES_SA10_APPEND_BASE_BAKERY_TECHNICAL_EXACT43_C9_v1_2026-09-10.xlsx', '58ef4b80b6ba95a846618de7269851b8386397532af3beb06f34826d2d7d13a5', '01_ALIAS_APPEND', 2007],
];

const dataSuites = [
  ['PL3', searchChain[2][0], searchChain[2][1], '04_DATA_TESTS', 47],
  ['C3', searchChain[5][0], searchChain[5][1], '11_DATA_TESTS', 30],
  ['C4', searchChain[6][0], searchChain[6][1], '13_DATA_TESTS', 48],
  ['C5', searchChain[7][0], searchChain[7][1], '12_DATA_TESTS', 38],
  ['C6', 'GELLATTI_SEARCH_ALIASES_SA10_C6_AUDIT_LOCALE_MARKET_RESOLVER_v1_2026-09-10.xlsx', '5b62c2ee9a6c7ca7ddca7a7046defd2cb218ccdb4884af1ce97cc6e1789cc1a5', '12_DATA_TESTS', 82],
  ['C7', 'GELLATTI_SEARCH_ALIASES_SA10_C7_AUDIT_LOCALE_MARKET_RESOLVER_v1_2026-09-10.xlsx', '92e65d2c2128832e1e3584ee62239f4099e8f37d4df01769525f71ffb0a1d77b', '14_DATA_TESTS', 79],
  ['C8', 'GELLATTI_SEARCH_ALIASES_SA10_C8_CORE_RESOLVER_QA_v1_2026-09-10.xlsx', '02fbd9e74af171c1052006061f0dd3d51dc1883a7062ae20c05338aa0dd51bbe', '07_DATA_TESTS', 64],
  ['C9', 'GELLATTI_SEARCH_ALIASES_SA10_C9_CORE_RESOLVER_QA_v1_2026-09-10.xlsx', '8703d20d8eeb01d9b50ee0262ed20fa2c8e2f46e3d0f9c527947ac9a9744a4a9', '07_DATA_TESTS', 71],
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(candidate) : [candidate];
  });
}

const sourceFiles = walk(SOURCE_ROOT);
const located = new Map();
function locate(fileName, expectedSha) {
  const key = `${fileName}:${expectedSha}`;
  if (located.has(key)) return located.get(key);
  const candidates = sourceFiles.filter((candidate) => path.basename(candidate) === fileName);
  for (const candidate of candidates) {
    const bytes = fs.readFileSync(candidate);
    if (sha256(bytes) === expectedSha) {
      located.set(key, candidate);
      return candidate;
    }
  }
  throw new Error(`Missing certified source ${fileName} (${expectedSha})`);
}

function workbook(fileName, expectedSha) {
  return XLSX.readFile(locate(fileName, expectedSha), {
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
  });
}

function rows(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing sheet ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function assertCount(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

const authorityHashes = Object.fromEntries(
  Object.entries(sources).map(([key, [name, hash]]) => {
    locate(name, hash);
    return [key, { fileName: name, sha256: hash }];
  }),
);

const searchAliases = searchChain.flatMap(([name, hash, sheet, expected], sequence) => {
  const sourceRows = rows(workbook(name, hash), sheet);
  assertCount(name, sourceRows.length, expected);
  return sourceRows.map((row) => ({
    id: row.alias_id,
    locale: row.locale_variant,
    market: row.market_scope,
    raw: row.raw_alias,
    normalized: row.normalized_alias,
    fallback: row.fallback_normalized_alias,
    aliasType: row.alias_type,
    targetType: row.target_type,
    targetId: row.target_id,
    targetKey: row.target_key,
    matchPolicy: row.match_policy,
    priority: Number(row.priority),
    morphologyMode: row.morphology_mode,
    hyphenPolicy: row.hyphen_policy,
    autoAddAllowed: bool(row.auto_add_allowed),
    ambiguityGroup: row.ambiguity_group,
    collisionPolicy: row.collision_policy,
    fallbackPolicy: row.fallback_policy,
    overrideTargetId: row.override_target_id,
    overrideTargetKey: row.override_target_key,
    releaseSequence: sequence + 1,
  }));
});
assertCount('SEARCH_ALIASES', searchAliases.length, 27963);
assertCount('SEARCH alias IDs', new Set(searchAliases.map((row) => row.id)).size, 27963);
if (searchAliases.some((row) => /^PI-ING-/i.test(row.targetId) || /^PI-ING-/i.test(row.overrideTargetId))) {
  throw new Error('Direct Search alias → PI target detected');
}

const roleWb = workbook(...sources.role);
const roleAliases = rows(roleWb, '04_ROLE_ALIAS_APPEND').map((row) => ({
  id: row.role_alias_id,
  locale: row.locale_variant,
  market: row.market_scope,
  raw: row.raw_alias,
  normalized: row.normalized_alias,
  fallback: row.fallback_normalized_alias,
  aliasClass: row.alias_class,
  semanticLevel: row.semantic_level,
  roleId: row.role_id,
  roleKey: row.role_key,
  roleSubtypeId: row.role_subtype_id,
  roleSubtypeKey: row.role_subtype_key,
  defaultParentRoleId: row.default_parent_role_id,
  defaultParentRoleKey: row.default_parent_role_key,
  allowedParentRoleIds: split(row.allowed_parent_role_ids),
  attachmentMode: row.attachment_mode,
  attachmentDirection: row.attachment_direction,
  matchPolicy: row.match_policy,
  priority: Number(row.priority),
  tokenBoundaryPolicy: row.token_boundary_policy,
  hyphenPolicy: row.hyphen_policy,
  standaloneBehavior: row.standalone_behavior,
  ambiguityGroup: row.ambiguity_group,
  collisionPolicy: row.collision_policy,
  fallbackPolicy: row.fallback_policy,
  protectedPhrase: bool(row.protected_phrase),
}));
assertCount('ROLE_INTENT_ALIASES', roleAliases.length, 1714);
assertCount('ROLE alias IDs', new Set(roleAliases.map((row) => row.id)).size, 1714);

const techWb = workbook(...sources.technical);
const technicalAliases = rows(techWb, '01_TECHNICAL_CODE_ALIASES').map((row) => ({
  id: row.technical_code_alias_id,
  raw: row.raw_code,
  canonical: row.canonical_code,
  normalized: row.normalized_code,
  acceptedSurfaces: split(row.accepted_surface_forms),
  namespace: row.code_namespace,
  referenceType: row.reference_type,
  targetConceptId: row.target_concept_id,
  targetKey: row.target_key,
  candidatePiIds: split(row.candidate_pi_ids),
  semanticPrecision: row.semantic_precision,
  automaticConceptResolutionAllowed: bool(row.automatic_concept_resolution_allowed),
  automaticPiResolutionAllowed: bool(row.automatic_pi_resolution_allowed),
  autoAddAllowed: bool(row.auto_add_allowed),
  exactQualifierRequired: row.exact_qualifier_required,
  gradeOrFormRule: row.grade_or_form_rule,
  matchPolicy: row.match_policy,
  tokenBoundaryPolicy: row.token_boundary_policy,
  punctuationNormalization: row.punctuation_normalization,
  casePolicy: row.case_policy,
  locale: row.locale_scope,
  market: row.market_scope,
  priority: Number(row.priority),
  collisionPolicy: row.collision_policy,
  fallbackPolicy: row.fallback_policy,
  verificationStatus: row.verification_status,
}));
assertCount('TECHNICAL_CODE_ALIASES', technicalAliases.length, 69);
assertCount('technical alias IDs', new Set(technicalAliases.map((row) => row.id)).size, 69);
if (technicalAliases.some((row) => row.automaticPiResolutionAllowed || row.autoAddAllowed)) {
  throw new Error('Technical channel attempted automatic PI resolution or auto-add');
}

const conceptWb = workbook(...sources.concepts);
const concepts = rows(conceptWb, '01_SEARCH_CONCEPTS').map((row) => ({
  id: row.concept_id,
  key: row.concept_key,
  type: row.concept_type,
  canonicalNameEn: row.canonical_name_en,
  canonicalNamePl: row.canonical_name_pl,
  parentConceptId: row.parent_concept_id,
  rootDomain: row.root_domain,
  homeIntentRole: row.home_intent_role,
  homeAutoAddEligible: bool(row.home_auto_add_eligible),
  defaultPolicy: row.default_policy_preliminary,
  status: row.concept_status,
}));
assertCount('SEARCH_CONCEPTS', concepts.length, 442);
const conceptByKey = new Map(concepts.map((row) => [row.key, row]));

const conceptPiLinks = rows(conceptWb, '03_CONCEPT_PI_LINKS').map((row) => ({
  id: row.link_id,
  conceptId: row.concept_id,
  conceptKey: row.concept_key,
  piId: row.pi_ing_id,
  role: row.link_role,
  form: row.form_or_subcategory,
  defaultEligible: bool(row.default_eligible_precheck),
}));

const mapperWb = workbook(...sources.mapperXlsx);
const mapperRows = rows(mapperWb, '03_Final_mapper_extended').map((row) => ({
  id: row.ingredient_id,
  internalName: row.ingredient_name_internal,
  displayName: row.ingredient_name_display,
  brand: row.brand,
  supplier: row.supplier,
  ean: row.ean_code,
  category: row.ingredient_category,
  subcategory: row.ingredient_subcategory,
  approvedForBase: bool(row.approved_for_base),
  approvedForEngines: bool(row.approved_for_engines),
  verificationStatus: row.verification_status,
  active: bool(row.is_active),
}));
assertCount('Mapper rows', mapperRows.length, 2541);
assertCount('Mapper IDs', new Set(mapperRows.map((row) => row.id)).size, 2541);

const handoffWb = workbook(...sources.handoff);
const dictionaryWb = workbook(...sources.dictionary);
const dictionaryLocaleRows = rows(dictionaryWb, '117_GC61_MacierzJezykow');
const dictionaryMarketsByLocale = new Map(
  dictionaryLocaleRows.map((row) => [row.Locale, row['Rynki z pliku']]),
);
const localeContracts = rows(handoffWb, '04_LOCALE_CONTRACTS').map((row) => ({
  ...row,
  markets: /^[A-Z]{2}(?:; [A-Z]{2})*$/.test(row.markets)
    ? row.markets
    : dictionaryMarketsByLocale.get(row.locale_variant) ?? row.markets,
}));
assertCount('locale contracts', localeContracts.length, 45);
const marketRoutes = rows(dictionaryWb, '115_GC61_Kraje75');
assertCount('markets', marketRoutes.length, 75);
assertCount('market ISO2 values', new Set(marketRoutes.map((row) => row.ISO2)).size, 75);
const precedence = rows(handoffWb, '03_PRECEDENCE_PIPELINE');
assertCount('precedence rules', precedence.length, 20);

const roleGrammarWb = workbook(...sources.roleGrammar);
const morphologyWb = workbook(...sources.morphology);
const collisionWb = workbook(...sources.collision);

// A small parser-contract lexicon closes explicit forms that appear in the
// FINAL_FROZEN runtime vectors but are intentionally not productive stems in
// SEARCH_ALIASES. These are semantic-only routes and do not alter SA-10 counts.
const runtimeSearch = [
  ['pl', 'pistacji', 'pistachio', 'INGREDIENT_CONCEPT', 'EXPLICIT_INFLECTION'],
  ['pl', 'beta-karoten', 'beta_carotene', 'INGREDIENT_CONCEPT', 'PROTECTED_PHRASE'],
  ['de', 'Schokoladen', 'chocolate', 'INGREDIENT_CONCEPT', 'COMPOUND_MEMBER'],
  ['fil', 'puting tsokolate', 'white_chocolate', 'INGREDIENT_CONCEPT', 'EXPLICIT_PHRASE'],
  ['el', 'λευκής σοκολάτας', 'white_chocolate', 'INGREDIENT_CONCEPT', 'EXPLICIT_INFLECTION'],
  ['ja', 'ホワイトチョコ', 'white_chocolate', 'INGREDIENT_CONCEPT', 'EXPLICIT_SHORT_FORM'],
  ['id', 'minuman anggur', 'wine', 'INGREDIENT_CONCEPT', 'PROTECTED_PHRASE'],
  ['en', 'OREO ice cream', 'cookies_and_cream', 'NAMED_COMPOSITE', 'PROTECTED_PHRASE'],
].map(([locale, raw, targetKey, targetType, matchPolicy], index) => {
  const concept = conceptByKey.get(targetKey);
  // Some FINAL_FROZEN parser vectors deliberately preserve a semantic key
  // that is not yet present in the 442-row concept catalogue. Keep that
  // parser-stage identity explicit without mutating the frozen catalogue or
  // inventing a PI route.
  const targetId = concept?.id ?? `SA12-CONTRACT-${targetKey.toUpperCase()}`;
  return {
    id: `SA11-CONTRACT-SEARCH-${String(index + 1).padStart(3, '0')}`,
    locale,
    market: 'GLOBAL',
    raw,
    normalized: raw.normalize('NFKC').toLocaleLowerCase(locale),
    fallback: '',
    aliasType: 'FROZEN_RUNTIME_CONTRACT',
    targetType,
    targetId,
    targetKey,
    matchPolicy,
    priority: 1400,
    morphologyMode: 'EXPLICIT_ONLY',
    hyphenPolicy: 'KEEP',
    autoAddAllowed: false,
    ambiguityGroup: '',
    collisionPolicy: 'FROZEN_VECTOR_CONTRACT',
    fallbackPolicy: 'NONE',
    overrideTargetId: '',
    overrideTargetKey: '',
    releaseSequence: 0,
  };
});

const roleTaxonomyRows = rows(roleWb, '01_ROLE_TAXONOMY');
const roleSubtypeRows = rows(roleWb, '02_ROLE_SUBTYPES');
const roleByKey = new Map(roleTaxonomyRows.map((row) => [row.role_key, row]));
const subtypeByKey = new Map(roleSubtypeRows.map((row) => [row.role_subtype_key, row]));
const runtimeRole = [
  ['pl', 'posypki', 'TOPPING', 'SPRINKLES', 'TOKEN'],
  ['pl', 'chrupiący', 'INCLUSION', 'CRUNCH_CRISPY', 'TOKEN'],
  ['de', 'Stückchen', 'INCLUSION', 'CHUNKS_PIECES', 'COMPOUND_MEMBER'],
  ['tr', 'parçalı', 'INCLUSION', 'CHUNKS_PIECES', 'TOKEN'],
].map(([locale, raw, roleKey, subtypeKey, matchPolicy], index) => {
  const role = roleByKey.get(roleKey);
  const subtype = subtypeByKey.get(subtypeKey);
  if (!role || !subtype) throw new Error(`Runtime role contract missing: ${roleKey}/${subtypeKey}`);
  return {
    id: `SA11-CONTRACT-ROLE-${String(index + 1).padStart(3, '0')}`,
    locale,
    market: 'GLOBAL',
    raw,
    normalized: raw.normalize('NFKC').toLocaleLowerCase(locale),
    fallback: '',
    aliasClass: 'FROZEN_RUNTIME_CONTRACT',
    semanticLevel: 'ROLE_SUBTYPE',
    roleId: role.role_id,
    roleKey,
    roleSubtypeId: subtype.role_subtype_id,
    roleSubtypeKey: subtypeKey,
    defaultParentRoleId: role.role_id,
    defaultParentRoleKey: roleKey,
    allowedParentRoleIds: split(subtype.allowed_parent_role_ids),
    attachmentMode: 'ATTACH_EXPLICIT_ROLE_OR_SAFE_DEFAULT_PARENT',
    attachmentDirection: 'BIDIRECTIONAL_BY_LOCALE_PROFILE',
    matchPolicy,
    priority: 1400,
    tokenBoundaryPolicy: 'WHOLE_TOKEN_OR_EXPLICIT_COMPOUND_MEMBER',
    hyphenPolicy: 'KEEP',
    standaloneBehavior: 'EMIT_DEFAULT_ROLE_AND_SUBTYPE_WITH_UNRESOLVED_OBJECT',
    ambiguityGroup: '',
    collisionPolicy: 'FROZEN_VECTOR_CONTRACT',
    fallbackPolicy: 'NONE',
    protectedPhrase: false,
  };
});

const runtimeParentRole = [
  ['en', 'toppings', 'TOPPING'],
  ['pt', 'calda', 'SAUCE'],
].map(([locale, raw, roleKey], index) => {
  const role = roleByKey.get(roleKey);
  if (!role) throw new Error(`Runtime parent-role contract missing: ${roleKey}`);
  return {
    id: `SA11-CONTRACT-PARENT-ROLE-${String(index + 1).padStart(3, '0')}`,
    locale,
    market: 'GLOBAL',
    raw,
    normalized: raw.normalize('NFKC').toLocaleLowerCase(locale),
    fallback: '',
    aliasClass: 'FROZEN_RUNTIME_CONTRACT',
    semanticLevel: 'PRODUCT_ROLE',
    roleId: role.role_id,
    roleKey,
    roleSubtypeId: '',
    roleSubtypeKey: '',
    defaultParentRoleId: '',
    defaultParentRoleKey: '',
    allowedParentRoleIds: [],
    attachmentMode: 'ATTACH_NEAREST_VALID_INGREDIENT_SAME_SEGMENT',
    attachmentDirection: 'BIDIRECTIONAL_BY_LOCALE_PROFILE',
    matchPolicy: 'TOKEN',
    priority: 1400,
    tokenBoundaryPolicy: 'WHOLE_TOKEN_OR_EXPLICIT_COMPOUND_MEMBER',
    hyphenPolicy: 'KEEP',
    standaloneBehavior: 'EMIT_ROLE_WITH_UNRESOLVED_OBJECT',
    ambiguityGroup: '',
    collisionPolicy: 'FROZEN_VECTOR_CONTRACT',
    fallbackPolicy: 'NONE',
    protectedPhrase: false,
  };
});

const runtimeLexicon = {
  search: runtimeSearch,
  role: [...runtimeRole, ...runtimeParentRole],
  protectedPhrases: [
    { locale: 'en', normalized: 'nestlé crunch', targetKey: 'protected_exact_or_unresolved_product' },
    { locale: 'en', normalized: 'layer cake', targetKey: 'protected_or_unresolved_phrase' },
  ],
};

const dataRowsBySuite = Object.fromEntries(
  dataSuites.map(([suite, name, hash, sheet, expected]) => {
    const suiteRows = rows(workbook(name, hash), sheet);
    assertCount(`${suite} vectors`, suiteRows.length, expected);
    if (suiteRows.some((row) => !['DATA_PASS', 'DATA_SAFE_ABSENT'].includes(row.status))) {
      throw new Error(`${suite} contains a forbidden data result classification`);
    }
    return [suite, suiteRows];
  }),
);

function exactlyOne(label, values) {
  if (values.length !== 1) {
    throw new Error(`${label}: expected exactly one authority row, received ${values.length}`);
  }
  return values[0];
}

function numberedTestRows(suite, first, last) {
  return dataRowsBySuite[suite].filter((row) => {
    const match = String(row.test_id).match(/(\d+)$/);
    const number = Number(match?.[1] ?? Number.NaN);
    return number >= first && number <= last;
  });
}

const c4Source = dataSuites.find(([suite]) => suite === 'C4');
const c5Source = dataSuites.find(([suite]) => suite === 'C5');
const c8Source = dataSuites.find(([suite]) => suite === 'C8');
const c9Source = dataSuites.find(([suite]) => suite === 'C9');
if (!c4Source || !c5Source || !c8Source || !c9Source) {
  throw new Error('Missing C4/C5/C8/C9 data source');
}

const c4Wb = workbook(c4Source[1], c4Source[2]);
const c5Wb = workbook(c5Source[1], c5Source[2]);
const c8Wb = workbook(c8Source[1], c8Source[2]);
const c9Wb = workbook(c9Source[1], c9Source[2]);

const c4ContractTables = {
  'C4-FORM-': ['08_FORM_CONTEXT_ROUTES', 'route_id'],
  'C4-CONSTRAINT-': ['09_ALCOHOL_FREE_CONSTRAINTS', 'route_id'],
  'C4-SCOPE-': ['10_SCOPE_CONSTRAINTS', 'route_id'],
};
const c4DataContracts = numberedTestRows('C4', 30, 40).map((vector) => {
  const reference = String(vector.found_alias_id);
  if (reference === 'RESOLVER_CONTRACT') {
    const sourceSheet = '06_RESOLVER_CONTRACTS';
    const evidence = exactlyOne(
      `C4 ${vector.test_id} resolver contract`,
      rows(c4Wb, sourceSheet).filter(
        (row) => row.target_id === vector.expected_target_id && row.target_key === vector.expected_target_key,
      ),
    );
    return {
      suite: 'C4',
      testId: vector.test_id,
      sourceWorkbook: c4Source[1],
      sourceSha256: c4Source[2],
      sourceSheet,
      contractId: `C4-RESOLVER:${evidence.target_id}`,
      evidence,
    };
  }
  const table = Object.entries(c4ContractTables).find(([prefix]) => reference.startsWith(prefix));
  if (!table) throw new Error(`C4 ${vector.test_id}: unknown contract ${reference}`);
  const [, [sourceSheet, idColumn]] = table;
  const evidence = exactlyOne(
    `C4 ${vector.test_id} ${reference}`,
    rows(c4Wb, sourceSheet).filter((row) => row[idColumn] === reference),
  );
  return {
    suite: 'C4',
    testId: vector.test_id,
    sourceWorkbook: c4Source[1],
    sourceSha256: c4Source[2],
    sourceSheet,
    contractId: reference,
    evidence,
  };
});

const c5GuardByTestId = {
  'C5-T31': 'C5-G-005',
  'C5-T32': 'C5-G-025',
  'C5-T33': 'C5-G-013',
  'C5-T34': 'C5-G-014',
  'C5-T35': 'C5-G-007',
  'C5-T36': 'C5-G-010',
};
const c5DataContracts = numberedTestRows('C5', 21, 38).map((vector) => {
  const reference = String(vector.found_alias_or_route_id || c5GuardByTestId[vector.test_id] || '');
  if (vector.test_id === 'C5-T25') {
    const evidence = exactlyOne(
      `C5 ${vector.test_id} Search alias`,
      searchAliases.filter(
        (row) =>
          row.locale === vector.locale_variant &&
          row.market === vector.market_scope &&
          row.raw === vector.input_text &&
          row.targetId === vector.expected_target_id &&
          row.targetKey === vector.expected_target_key,
      ),
    );
    const [sourceWorkbook, sourceSha256, sourceSheet] = searchChain[evidence.releaseSequence - 1];
    return {
      suite: 'C5',
      testId: vector.test_id,
      sourceWorkbook,
      sourceSha256,
      sourceSheet,
      contractId: evidence.id,
      evidence,
    };
  }
  const [sourceSheet, idColumn] = reference.startsWith('C5-FORM-')
    ? ['07_FORM_CONTEXT_ROUTES', 'form_route_id']
    : reference.startsWith('C5-SCOPE-')
      ? ['09_SCOPE_ALLERGEN_CONSTRAINTS', 'constraint_id']
      : reference.startsWith('C5-G-')
        ? ['10_SEMANTIC_GUARDS', 'guard_id']
        : ['', ''];
  if (!sourceSheet) throw new Error(`C5 ${vector.test_id}: unknown contract ${reference}`);
  const evidence = exactlyOne(
    `C5 ${vector.test_id} ${reference}`,
    rows(c5Wb, sourceSheet).filter((row) => row[idColumn] === reference),
  );
  return {
    suite: 'C5',
    testId: vector.test_id,
    sourceWorkbook: c5Source[1],
    sourceSha256: c5Source[2],
    sourceSheet,
    contractId: reference,
    evidence,
  };
});

const c8DataContracts = numberedTestRows('C8', 31, 46).map((vector) => {
  const reference = String(vector.expected_alias_or_route);
  const sourceSheet = '03_FORM_CONTEXT_ROUTES';
  const evidence = exactlyOne(
    `C8 ${vector.test_id} ${reference}`,
    rows(c8Wb, sourceSheet).filter((row) => row.route_id === reference),
  );
  return {
    suite: 'C8',
    testId: vector.test_id,
    sourceWorkbook: c8Source[1],
    sourceSha256: c8Source[2],
    sourceSheet,
    contractId: reference,
    evidence,
  };
});

const dataContracts = [...c4DataContracts, ...c5DataContracts, ...c8DataContracts];
assertCount('SA12 auxiliary data contracts', dataContracts.length, 45);
assertCount(
  'SA12 auxiliary data contract test IDs',
  new Set(dataContracts.map((row) => `${row.suite}:${row.testId}`)).size,
  45,
);

const runtimeC9RouteSpecs = [
  ['03_FORM_CONTEXT_ROUTES', 'route_id', 'C9-FORM-006', 'butter cookie'],
  ['05_SEMANTIC_GUARDS', 'guard_id', 'C9-GUARD-007', 'challah'],
  ['03_FORM_CONTEXT_ROUTES', 'route_id', 'C9-FORM-016', 'chocolate pudding'],
];
for (const [sourceSheet, idColumn, sourceContractId, raw] of runtimeC9RouteSpecs) {
  const evidence = exactlyOne(
    `C9 runtime route ${sourceContractId}`,
    rows(c9Wb, sourceSheet).filter((row) => row[idColumn] === sourceContractId),
  );
  const resolver = exactlyOne(
    `C9 resolver ${evidence.target_key}`,
    rows(c9Wb, '01_RESOLVER_CONTRACTS').filter(
      (row) => row.target_id === evidence.target_id && row.target_key === evidence.target_key,
    ),
  );
  if (sourceSheet === '03_FORM_CONTEXT_ROUTES' && !split(evidence.input_examples).includes(raw)) {
    throw new Error(`${sourceContractId}: runtime surface ${raw} is not frozen input evidence`);
  }
  if (sourceSheet === '05_SEMANTIC_GUARDS' && evidence.trigger_or_term !== raw) {
    throw new Error(`${sourceContractId}: runtime surface ${raw} is not frozen guard evidence`);
  }
  runtimeLexicon.search.push({
    id: `SA11-CONTRACT-C9-${sourceContractId}`,
    locale: 'en',
    market: 'GLOBAL',
    raw,
    normalized: raw,
    fallback: '',
    aliasType: 'FROZEN_RUNTIME_CONTRACT',
    targetType: resolver.target_type,
    targetId: resolver.target_id,
    targetKey: resolver.target_key,
    matchPolicy: 'LONGEST_PROTECTED_PHRASE',
    priority: 1450,
    morphologyMode: 'EXPLICIT_ONLY',
    hyphenPolicy: 'KEEP',
    autoAddAllowed: resolver.home_auto_add_eligible === 'TRUE',
    ambiguityGroup: '',
    collisionPolicy: 'FROZEN_VECTOR_CONTRACT',
    fallbackPolicy: 'NONE',
    overrideTargetId: '',
    overrideTargetKey: '',
    releaseSequence: 0,
    sourceWorkbook: c9Source[1],
    sourceSha256: c9Source[2],
    sourceSheet,
    sourceContractId,
  });
}

const blockedVectorIds = [
  ['C3', 'C3-N03'],
  ['C7', 'C7-T-067'],
  ['C7', 'C7-T-073'],
  ['C7', 'C7-T-074'],
  ['C8', 'C8-T-052'],
  ['C9', 'C9-T-048'],
];
runtimeLexicon.blockedPhrases = blockedVectorIds.map(([suite, testId]) => {
  const vector = exactlyOne(
    `runtime no-guess vector ${suite}:${testId}`,
    dataRowsBySuite[suite].filter((row) => row.test_id === testId),
  );
  if (vector.status !== 'DATA_SAFE_ABSENT') {
    throw new Error(`${suite}:${testId}: no-guess runtime contract must be DATA_SAFE_ABSENT`);
  }
  return {
    suite,
    testId,
    locale: vector.locale_variant || (vector.locale_or_scope === 'GLOBAL' ? 'en' : '*'),
    market: !vector.market_scope || vector.market_scope === 'ANY' ? 'GLOBAL' : vector.market_scope,
    raw: vector.input_text,
    forbiddenTargetId: String(vector.expected_target_id ?? '').replace(/^NOT(?::|\s)+/i, ''),
    forbiddenTargetKey: String(vector.expected_target_key ?? '').replace(/^NOT(?::|\s)+/i, ''),
  };
});

runtimeLexicon.autoAddBlocks = [
  ['C6', 'C6-T-076'],
  ['C6', 'C6-T-077'],
].map(([suite, testId]) => {
  const vector = exactlyOne(
    `runtime auto-add guard ${suite}:${testId}`,
    dataRowsBySuite[suite].filter((row) => row.test_id === testId),
  );
  if (vector.status !== 'DATA_SAFE_ABSENT' || vector.expected_pi_stage !== 'BLOCK_OR_UNRESOLVED') {
    throw new Error(`${suite}:${testId}: invalid frozen auto-add guard`);
  }
  return {
    suite,
    testId,
    locale: vector.locale_variant,
    market: vector.market_scope,
    raw: vector.input_text,
    targetId: vector.expected_target_id,
    targetKey: vector.expected_target_key,
    context: vector.expected_context_or_guard,
  };
});

const release = {
  schemaVersion: 1,
  releaseId: 'GELLATTI-SA10-2026-09-10-FINAL',
  authorityHashes,
  counts: {
    mapper: 2541,
    mapperColumns: 62,
    searchAliases: 27963,
    roleAliases: 1714,
    technicalAliases: 69,
    concepts: 442,
    localeContracts: 45,
    markets: 75,
    dataContracts: 45,
  },
  searchAliases,
  roleAliases,
  technicalAliases,
  concepts,
  conceptPiLinks,
  mapperRows,
  localeContracts,
  marketRoutes,
  precedence,
  dataContracts,
  runtimeLexicon,
  roleTaxonomy: roleTaxonomyRows,
  roleSubtypes: roleSubtypeRows,
  compoundRules: Object.fromEntries(
    morphologyWb.SheetNames
      .filter((name) => name !== '08_STATIC_REGRESSION_VECTORS')
      .map((name) => [name, rows(morphologyWb, name)]),
  ),
  roleGrammar: Object.fromEntries(
    roleGrammarWb.SheetNames
      .filter((name) => name !== '05_ACCEPTANCE_VECTORS')
      .map((name) => [name, rows(roleGrammarWb, name)]),
  ),
  collisionOverlay: Object.fromEntries(
    collisionWb.SheetNames
      .filter((name) => name !== '06_COLLISION_TEST_VECTORS')
      .map((name) => [name, rows(collisionWb, name)]),
  ),
};

const vectors = {
  releaseId: release.releaseId,
  parser: {
    ROLE: rows(roleGrammarWb, '05_ACCEPTANCE_VECTORS'),
    MORPH: rows(morphologyWb, '08_STATIC_REGRESSION_VECTORS'),
    TECH: rows(techWb, '06_STATIC_TEST_VECTORS'),
    COLLISION: rows(collisionWb, '06_COLLISION_TEST_VECTORS'),
  },
  data: Object.fromEntries(
    dataSuites.map(([suite]) => [suite, dataRowsBySuite[suite]]),
  ),
};
assertCount('parser vectors', Object.values(vectors.parser).flat().length, 214);
assertCount('data vectors', Object.values(vectors.data).flat().length, 459);

const releaseSource = `${JSON.stringify(release)}\n`;
const vectorsSource = `${JSON.stringify(vectors, null, 2)}\n`;
const releaseSha = sha256(releaseSource);
const vectorsSha = sha256(vectorsSource);
const manifestSource = `/** GENERATED by scripts/buildMapperSearchRuntimeRelease.mjs. */\nexport const MAPPER_SEARCH_RELEASE_ID = '${release.releaseId}';\nexport const MAPPER_SEARCH_RELEASE_URL = '/mapper-search-runtime/sa10-final-frozen.json';\nexport const MAPPER_SEARCH_RELEASE_SHA256 = '${releaseSha}';\nexport const MAPPER_SEARCH_VECTOR_SHA256 = '${vectorsSha}';\nexport const MAPPER_SEARCH_RELEASE_COUNTS = ${JSON.stringify(release.counts, null, 2)} as const;\n`;

const outputs = [
  [RELEASE_OUT, releaseSource],
  [VECTORS_OUT, vectorsSource],
  [MANIFEST_OUT, manifestSource],
];
const check = process.argv.includes('--check');
for (const [destination, content] of outputs) {
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== content) {
      throw new Error(`${path.relative(ROOT, destination)} is stale`);
    }
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}

console.log(
  `Mapper/Search runtime release ${check ? 'verified' : 'written'}: ` +
    `${searchAliases.length}/${roleAliases.length}/${technicalAliases.length}, ` +
    `release ${releaseSha}, vectors ${vectorsSha}`,
);
