import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const mapperPath = path.join(root, 'docs/ingredients/validation/mapper_basement.csv');
const processPath = path.join(root, 'supabase/seed/mapper_process_metadata.csv');
const reportCsv = path.join(root, 'reports/MAPPER_2089_PRODUCT_BEHAVIOR_AUDIT.csv');
const reportMd = path.join(root, 'reports/MAPPER_2089_PRODUCT_BEHAVIOR_AUDIT.md');
const EXPECTED_MAPPER_SHA256 = '057375cd60cefe613892ff1d9f8f7eda880ff0eb06732f9229051fc37d8deca7';
const EXPECTED_PROCESS_SHA256 = '44fd5302c7a2372bb69ba5abc592edd27f41e96c5de00ac2ca45ade1903ad6d6';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])),
  );
}

const escapeCsv = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const lower = (value) => String(value ?? '').toLowerCase();

const EXACT_MAIN = new Map([
  [
    'PI-ING-001553',
    {
      family: 'fruit',
      subfamily: 'berry',
      form: 'fresh',
      profiles: 'milk_gelato;sorbet;vegan_gelato;protein_gelato',
      coverage: 'OWNER_PROVISIONAL_V2;PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-000345',
    {
      family: 'fruit',
      subfamily: 'banana',
      form: 'fresh',
      profiles: 'milk_gelato;protein_gelato',
      coverage: 'OWNER_PROVISIONAL_V2;PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-000366',
    {
      family: 'fruit',
      subfamily: 'kiwi',
      form: 'fresh',
      profiles: 'milk_gelato',
      coverage: 'OWNER_PROVISIONAL_V2',
    },
  ],
  [
    'PI-ING-000369',
    {
      family: 'fruit',
      subfamily: 'citrus',
      form: 'fresh',
      profiles: 'sorbet',
      coverage: 'PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-000340',
    {
      family: 'fruit',
      subfamily: 'mango_tropical',
      form: 'puree',
      profiles: 'sorbet',
      coverage: 'PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-001589',
    {
      family: 'fruit',
      subfamily: 'banana',
      form: 'puree',
      profiles: 'vegan_gelato',
      coverage: 'PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-000614',
    {
      family: 'nut',
      subfamily: null,
      form: 'pure_nut_paste',
      profiles: 'milk_gelato;vegan_gelato;protein_gelato',
      coverage: 'OWNER_PROVISIONAL_V2;PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-001578',
    {
      family: 'chocolate_cocoa',
      subfamily: null,
      form: 'cocoa_powder',
      profiles: 'vegan_gelato;protein_gelato',
      coverage: 'PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-000737',
    {
      family: 'fruit',
      subfamily: null,
      form: 'concentrate',
      profiles: 'milk_gelato;sorbet;vegan_gelato',
      coverage: 'SOURCE_REFERENCE_EXACT',
    },
  ],
  [
    'PI-ING-000732',
    {
      family: 'fruit',
      subfamily: null,
      form: 'concentrate',
      profiles: 'milk_gelato;sorbet;vegan_gelato',
      coverage: 'SOURCE_REFERENCE_EXACT',
    },
  ],
  [
    'PI-ING-000757',
    {
      family: 'chocolate_cocoa',
      subfamily: null,
      form: 'flavour_paste',
      profiles: 'chocolate_gelato',
      coverage: 'SOURCE_REFERENCE_EXACT',
    },
  ],
  [
    'PI-ING-000246',
    {
      family: 'vanilla',
      subfamily: null,
      form: 'flavour_paste',
      profiles: 'protein_gelato',
      coverage: 'PINGUINO_CALIBRATED_EXACT',
    },
  ],
  [
    'PI-ING-000038',
    {
      family: 'alcohol',
      subfamily: null,
      form: 'alcoholic_beverage',
      profiles: 'milk_gelato@-11',
      coverage: 'PINGUINO_CALIBRATED_EXACT',
    },
  ],
]);
const FAMILY_POLICIES = [
  { family: 'fruit', subfamily: null, form: 'fresh', profile: 'milk_gelato' },
  { family: 'fruit', subfamily: null, form: 'puree', profile: 'milk_gelato' },
  { family: 'fruit', subfamily: 'berry', form: 'fresh', profile: 'milk_gelato' },
  { family: 'fruit', subfamily: 'berry', form: 'puree', profile: 'milk_gelato' },
  { family: 'fruit', subfamily: 'kiwi', form: 'fresh', profile: 'milk_gelato' },
  { family: 'fruit', subfamily: 'banana', form: 'fresh', profile: 'milk_gelato' },
  { family: 'nut', subfamily: null, form: 'pure_nut_paste', profile: 'milk_gelato' },
];
const LIQUID_DAIRY_CARRIERS = new Set([
  'PI-ING-000200',
  'PI-ING-000201',
  'PI-ING-000234',
  'PI-ING-000235',
  'PI-ING-000236',
]);
const STRUCTURAL_CATEGORIES = new Set([
  'sweetener',
  'stabilizer',
  'fiber',
  'emulsifier',
  'starch',
  'acid',
  'colorant',
  'functional_additive',
  'additive',
]);
const TOPPING_CATEGORIES = new Set([
  'confectionery_inclusion',
  'bakery_inclusion',
  'decorative_inclusion',
  'variegate',
  'coating',
]);
const FLAVOUR_CANDIDATE_CATEGORIES = new Set([
  'fruit',
  'fruit_powder',
  'flavor_paste',
  'flavor_powder',
  'flavor_syrup',
  'flavor_concentrate',
  'chocolate',
  'cocoa',
  'nut',
  'nut_paste',
  'coffee',
  'coffee_tea',
  'alcohol',
  'beverage',
  'confectionery_spread',
]);
const FLAVOUR_FAMILIES = new Set([
  'coconut',
  'bakery_cookie',
  'spice_herb',
  'vanilla',
  'caramel',
  'honey',
  'dairy_flavour',
]);

function familyFor(category, subcategory) {
  const cat = lower(category);
  const sub = lower(subcategory);
  if (sub === 'honey') return 'honey';
  if (sub.includes('caramel') || sub === 'kajmak') return 'caramel';
  if (sub.includes('vanilla')) return 'vanilla';
  if (cat === 'fruit') return 'fruit';
  if (cat === 'nut' || cat === 'nut_paste') return 'nut';
  if (cat === 'chocolate' || cat === 'cocoa') return 'chocolate_cocoa';
  if (
    cat === 'coffee' ||
    cat === 'coffee_tea' ||
    sub.includes('coffee') ||
    sub === 'espresso_coffee'
  )
    return 'coffee';
  if (cat === 'alcohol') return 'alcohol';
  if (cat === 'coconut') return 'coconut';
  if (cat === 'bakery' || cat === 'bakery_inclusion') return 'bakery_cookie';
  if (cat === 'spice' || cat === 'botanical') return 'spice_herb';
  if (
    cat === 'dairy' &&
    new Set([
      'mascarpone_cheese',
      'natural_yogurt',
      'skyr_yoghurt',
      'greek_yogurt',
      'yoghurt_9_percent',
      'fermented_milk_drink',
      'cream_cheese',
      'soft_cheese',
      'blue_cheese',
      'brie_cheese',
      'blue_cheese_roquefort',
      'parmesan_cheese',
      'fatty_cottage_cheese',
      'fatty_cottage_cheese_8_percent',
    ]).has(sub)
  )
    return 'dairy_flavour';
  return null;
}

function subfamilyFor(row) {
  const exact = EXACT_MAIN.get(row.ingredient_id);
  if (exact) return exact.subfamily;
  const cat = lower(row.ingredient_category);
  const sub = lower(row.ingredient_subcategory);
  if (cat === 'fruit' && ['citrus', 'lemon', 'lime', 'orange'].some((token) => sub.includes(token)))
    return 'citrus';
  if (cat === 'fruit' && sub.includes('tropical')) return 'mango_tropical';
  return null;
}

function formFor(category, subcategory) {
  const cat = lower(category);
  const sub = lower(subcategory);
  if (sub.includes('juice_concentrate') || sub.includes('concentrate')) return 'concentrate';
  if (sub.includes('fresh')) return 'fresh';
  if (sub.includes('frozen')) return 'frozen';
  if (sub.includes('puree')) return 'puree';
  if (sub.includes('juice')) return 'juice';
  if (sub.includes('extract')) return 'extract';
  if (sub === 'espresso_coffee') return 'espresso';
  if (sub.includes('dark_chocolate')) return 'dark_chocolate';
  if (sub.includes('milk_chocolate')) return 'milk_chocolate';
  if (sub.includes('cocoa_mass')) return 'cocoa_mass';
  if (sub.includes('cocoa_powder')) return 'cocoa_powder';
  if (sub.includes('powder')) return 'powder';
  if (cat === 'alcohol' && sub.includes('cream_liqueur')) return 'cream_liqueur';
  if (cat === 'alcohol') return 'alcoholic_beverage';
  if (cat === 'flavor_paste' || cat === 'flavour_paste') return 'flavour_paste';
  if (sub.includes('syrup')) return 'syrup';
  if (sub.includes('paste')) return 'paste';
  if (
    (cat === 'nut' || cat === 'nut_paste') &&
    new Set([
      'pistachio',
      'almond',
      'peanut',
      'walnut',
      'cashew',
      'pecan',
      'hazelnut',
      'brazil_nuts',
      'chestnut',
      'macadamia',
    ]).has(sub)
  )
    return 'whole_nut';
  if (sub.includes('dried')) return 'dried';
  if (sub.includes('peel')) return 'peel';
  if (sub.includes('drink') || ['milk', 'fresh_milk', 'water', 'cream'].includes(sub))
    return 'liquid';
  return null;
}

function classify(row, processRow) {
  const category = lower(row.ingredient_category);
  const subcategory = lower(row.ingredient_subcategory);
  const exact = EXACT_MAIN.get(row.ingredient_id);
  const family = exact?.family ?? familyFor(category, subcategory);
  const subfamily = exact?.subfamily ?? subfamilyFor(row);
  const form = exact?.form ?? formFor(category, subcategory);
  const structural = STRUCTURAL_CATEGORIES.has(category) || subcategory === 'water';
  const topping = TOPPING_CATEGORIES.has(category);
  const flavourCandidate =
    FLAVOUR_CANDIDATE_CATEGORIES.has(category) || FLAVOUR_FAMILIES.has(family);
  const potencyEvidenceMissing =
    !exact && ['paste', 'flavour_paste', 'concentrate', 'extract'].includes(form);
  const abvEvidenceMissing = family === 'alcohol' && Number(row.alcohol_percent || 0) <= 0;
  const inheritedProfiles = FAMILY_POLICIES.filter(
    (policy) =>
      policy.family === family &&
      policy.form === form &&
      (policy.subfamily === null || policy.subfamily === subfamily),
  ).map((policy) => policy.profile);
  const policyCovered = Boolean(exact) || inheritedProfiles.length > 0;

  let behaviorRole;
  let mainPolicyStatus;
  let mainEligibility;
  let profileApplicability;
  if (policyCovered) {
    behaviorRole = 'MAIN_PROFILE_SPECIFIC';
    mainPolicyStatus = 'COVERED';
    mainEligibility = 'MAIN_PROFILE_SPECIFIC';
    profileApplicability = exact?.profiles ?? [...new Set(inheritedProfiles)].join(';');
  } else if (category === 'protein') {
    behaviorRole = 'PROTEIN_CONTRIBUTOR_ONLY';
    mainPolicyStatus = 'NOT_APPLICABLE';
    mainEligibility = 'PROTEIN_CONTRIBUTOR_ONLY';
    profileApplicability = 'protein_gelato:contributor_only';
  } else if (topping) {
    behaviorRole = 'TOPPING_ONLY';
    mainPolicyStatus = 'NOT_APPLICABLE';
    mainEligibility = 'TOPPING_ONLY';
    profileApplicability = 'POST_PROCESS_ADDON:where_mapper_approved';
  } else if (structural) {
    behaviorRole = 'STRUCTURAL_ONLY';
    mainPolicyStatus = 'NOT_APPLICABLE';
    mainEligibility = 'NOT_MAIN';
    profileApplicability = 'ALL_EXISTING:structural_where_mapper_approved';
  } else if (flavourCandidate) {
    behaviorRole = family && form ? 'MAIN_ALLOWED' : 'UNKNOWN_REQUIRES_EVIDENCE';
    mainPolicyStatus =
      family === null || form === null || potencyEvidenceMissing || abvEvidenceMissing
        ? 'BLOCKED_DATA'
        : 'BLOCKED_SCIENCE';
    mainEligibility = 'MAIN_BLOCKED_POLICY';
    profileApplicability = 'AUTOMATIC_MAIN:blocked_pending_exact_evidence';
  } else {
    behaviorRole = 'STANDARD_ONLY';
    mainPolicyStatus = 'NOT_APPLICABLE';
    mainEligibility = 'STANDARD_ONLY';
    profileApplicability = 'ALL_EXISTING:standard_where_mapper_approved';
  }

  const reasons = [];
  if (mainPolicyStatus === 'BLOCKED_DATA' || mainPolicyStatus === 'BLOCKED_SCIENCE') {
    if (!family && !form) reasons.push('family_and_form_evidence_missing');
    else if (!family) reasons.push('family_evidence_missing');
    else if (!form) reasons.push('form_or_concentration_evidence_missing');
    else if (potencyEvidenceMissing) reasons.push('form_or_concentration_evidence_missing');
    else if (abvEvidenceMissing) reasons.push('abv_evidence_missing');
    else reasons.push('profile_main_policy_missing');
  }
  if (behaviorRole === 'PROTEIN_CONTRIBUTOR_ONLY')
    reasons.push('protein_contributor_not_flavour_main');
  if (behaviorRole === 'TOPPING_ONLY') reasons.push('post_process_product_not_base_main');
  if (behaviorRole === 'STRUCTURAL_ONLY') reasons.push('structural_product_not_flavour_main');
  if (behaviorRole === 'STANDARD_ONLY') reasons.push('standard_product_not_flavour_main');
  // PROCESS IS INFORMATIONAL ONLY (owner decision, 2026-08-23): an UNKNOWN
  // process is not a classification reason and never withholds anything.

  return {
    ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name_display,
    ingredient_category: row.ingredient_category,
    ingredient_subcategory: row.ingredient_subcategory,
    base_eligible: row.approved_for_base,
    engine_eligible: row.approved_for_engines,
    behavior_role: behaviorRole,
    main_policy_status: mainPolicyStatus,
    main_eligibility_compatibility: mainEligibility,
    family: family ?? 'UNRESOLVED',
    subfamily: subfamily ?? 'UNRESOLVED',
    form: form ?? 'UNRESOLVED',
    form_hint: row.ingredient_subcategory || 'other',
    profile_applicability: profileApplicability,
    base_permission:
      row.approved_for_base === 'TRUE' && row.approved_for_engines === 'TRUE'
        ? 'ELIGIBLE'
        : 'BLOCKED_MAPPER_APPROVAL',
    // Main permission is a Main-policy question. Process is informational and
    // is reported separately in `process_mapping` — it never withholds Main.
    main_permission: mainPolicyStatus === 'COVERED' ? 'ELIGIBLE' : mainPolicyStatus,
    policy_coverage:
      exact?.coverage ?? (policyCovered ? 'INHERITED_PUBLISHED_POLICY' : mainPolicyStatus),
    process_mapping: processRow?.process_status ?? 'UNKNOWN',
    process_evidence_level: processRow?.process_evidence_level ?? 'UNKNOWN',
    process_reason_codes: processRow?.process_reason_codes || 'PROCESS_REASON_MISSING',
    process_rule_id: processRow?.process_rule_id || 'PROCESS_RULE_MISSING',
    process_notes: processRow?.process_notes || '',
    vegan_status: row.vegan === 'TRUE' ? 'verified' : row.vegan === 'FALSE' ? 'false' : 'unknown',
    protein_behavior:
      category === 'protein'
        ? 'PROTEIN_CONTRIBUTOR_ONLY'
        : Number(row.aerating_protein_percent || 0) > 0
          ? 'CONTRIBUTOR_EVIDENCE_ONLY'
          : 'NOT_APPLICABLE',
    approved_liquid_dairy_carrier: LIQUID_DAIRY_CARRIERS.has(row.ingredient_id) ? 'TRUE' : 'FALSE',
    exact_reason_codes: reasons.length > 0 ? reasons.join(';') : 'NONE',
  };
}

const mapperSource = fs.readFileSync(mapperPath, 'utf8');
const processSource = fs.readFileSync(processPath, 'utf8');
const mapperHash = sha256(mapperSource);
const processHash = sha256(processSource);
if (mapperHash !== EXPECTED_MAPPER_SHA256) {
  throw new Error(
    `Mapper source hash changed: expected=${EXPECTED_MAPPER_SHA256} actual=${mapperHash}`,
  );
}
if (processHash !== EXPECTED_PROCESS_SHA256) {
  throw new Error(
    `Process source hash changed: expected=${EXPECTED_PROCESS_SHA256} actual=${processHash}`,
  );
}
const mapper = parseCsv(mapperSource);
const processRows = parseCsv(processSource);
const processById = new Map(processRows.map((row) => [row.ingredient_id, row]));
const audit = mapper.map((row) => classify(row, processById.get(row.ingredient_id)));

if (mapper.length !== 2089 || new Set(mapper.map((row) => row.ingredient_id)).size !== 2089) {
  throw new Error(`Mapper exhaustiveness failed: rows=${mapper.length}`);
}
if (processRows.length !== 2089 || processById.size !== 2089) {
  throw new Error(`Process exhaustiveness failed: rows=${processRows.length}`);
}
for (const row of mapper)
  if (!processById.has(row.ingredient_id))
    throw new Error(`Missing process row ${row.ingredient_id}`);
for (const row of audit) {
  if (!row.behavior_role || !row.main_policy_status || !row.profile_applicability) {
    throw new Error(`Incomplete behavior classification: ${row.ingredient_id}`);
  }
  if (row.behavior_role === 'UNKNOWN_REQUIRES_EVIDENCE' && row.exact_reason_codes === 'NONE') {
    throw new Error(`Unknown classification lacks an exact reason: ${row.ingredient_id}`);
  }
  if (!row.process_reason_codes || !row.process_rule_id) {
    throw new Error(`Process classification lacks source evidence: ${row.ingredient_id}`);
  }
}

const headers = Object.keys(audit[0]);
const csv =
  [
    headers.join(','),
    ...audit.map((row) => headers.map((key) => escapeCsv(row[key])).join(',')),
  ].join('\n') + '\n';
const counts = (field) =>
  audit.reduce((result, row) => {
    result[row[field]] = (result[row[field]] ?? 0) + 1;
    return result;
  }, {});
const behaviorRoleCounts = counts('behavior_role');
const policyStatusCounts = counts('main_policy_status');
const processCounts = counts('process_mapping');
const processReasonCounts = counts('process_reason_codes');
const familyCounts = counts('family');
const exactReasonCounts = audit
  .flatMap((row) => (row.exact_reason_codes === 'NONE' ? [] : row.exact_reason_codes.split(';')))
  .reduce((result, reason) => {
    result[reason] = (result[reason] ?? 0) + 1;
    return result;
  }, {});

const listCounts = (value) =>
  Object.entries(value)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `- ${key}: **${count}**`)
    .join('\n');

const md = `# Mapper 2089 Product Behavior Audit

Generated deterministically from the locked Mapper CSV and its immutable process companion. This report does not write to Mapper and does not create flavour science.

## Reconciliation

- Mapper rows: **${mapper.length}**
- Unique Mapper IDs: **${new Set(mapper.map((row) => row.ingredient_id)).size}**
- Process rows joined: **${processById.size}**
- Mapper SHA-256: \`${mapperHash}\` (pinned)
- Process SHA-256: \`${processHash}\` (pinned)
- Detailed exhaustive output: [MAPPER_2089_PRODUCT_BEHAVIOR_AUDIT.csv](./MAPPER_2089_PRODUCT_BEHAVIOR_AUDIT.csv)

## Behavior role (separate from policy coverage)

${listCounts(behaviorRoleCounts)}

## Main policy status

${listCounts(policyStatusCounts)}

Profile-scoped coverage comes from the published server policy registry. Identity-bound policies and their evidence are listed in the Main Flavour Envelope Registry; the audit never promotes a row from technical feasibility alone. Protein Coffee remains deliberately uncovered because infusion input and retained product mass are not equivalent. Flavor candidates without sufficient family/form/concentration evidence are BLOCKED_DATA. Candidates with an identified family and form but without approved sensory limits are BLOCKED_SCIENCE. Neither status changes existing Base/Engine approvals.

## Stable family classification

${listCounts(familyCounts)}

UNRESOLVED is retained only where the structured Mapper category/subcategory cannot establish a stable family without guessing. Every unresolved automatic-Main candidate has an exact reason in the CSV.

## Exact reason coverage

${listCounts(exactReasonCounts)}

## Process evidence

${listCounts(processCounts)}

UNKNOWN is preserved fail-closed and does not grant an automatic Main policy. The exhaustive CSV carries the exact immutable source \`process_reason_codes\`, \`process_rule_id\` and \`process_notes\` for every row; an UNKNOWN result is therefore an explicit evidence gap, never a silently processed default.

### Process source reason codes

${listCounts(processReasonCounts)}

## Science boundary

- Exact governed Main coverage: **${policyStatusCounts.COVERED ?? 0} / 2089** identity bindings (profile applicability remains explicit per row).
- Runtime role classification is exhaustive: **${audit.length} / 2089**.
- Automatic-Main unknowns without an exact reason: **${audit.filter((row) => row.behavior_role === 'UNKNOWN_REQUIRES_EVIDENCE' && row.exact_reason_codes === 'NONE').length}**.
- The audit does not infer compound concentration, coffee retained mass, alcohol ABV or flavour intensity. Sorbet, Vegan and Protein policies are restricted to exact accepted template/calibration identities; every other form remains blocked with its exact missing-data or missing-science reason.
`;

fs.mkdirSync(path.dirname(reportCsv), { recursive: true });
fs.writeFileSync(reportCsv, csv);
fs.writeFileSync(reportMd, md);
console.log(
  JSON.stringify(
    {
      mapperRows: mapper.length,
      behaviorRoleCounts,
      policyStatusCounts,
      processCounts,
      processReasonCounts,
      familyCounts,
      exactReasonCounts,
      mapperSha256: mapperHash,
      processSha256: processHash,
    },
    null,
    2,
  ),
);
