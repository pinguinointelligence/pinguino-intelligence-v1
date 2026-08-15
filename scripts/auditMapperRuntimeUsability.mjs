import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapperPath = path.join(root, 'docs/ingredients/validation/mapper_basement.csv');
const processPath = path.join(root, 'supabase/seed/mapper_process_metadata.csv');
const behaviorPath = path.join(root, 'reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv');
const outputCsv = path.join(root, 'reports/MAPPER_2088_RUNTIME_USABILITY_AUDIT.csv');
const outputMd = path.join(root, 'reports/MAPPER_2088_RUNTIME_USABILITY_AUDIT.md');
const EXPECTED_SHA = 'b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38';
const EXPECTED_PROCESS_SHA = 'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4';
const EXPECTED_BEHAVIOR_SHA = 'a3e937fa12fcb6b2672502b5993e26665f173f795fd18db5d705c2548e40999a';
const authorityArg = process.argv.find((arg) => arg.startsWith('--authority-json='));
const authorityPath = authorityArg ? path.resolve(root, authorityArg.slice('--authority-json='.length)) : null;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ''])));
}

const csv = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const bool = (value) => String(value).toLowerCase() === 'true';
const known = (value) => String(value ?? '').trim() !== '';
const finiteNonNegative = (value) => known(value) && Number.isFinite(Number(value)) && Number(value) >= 0;
const optionalNumber = (value) => known(value) && Number.isFinite(Number(value)) ? Number(value) : null;
const normalizedArray = (value) => Array.isArray(value)
  ? [...value].map(String).sort()
  : [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const md5Uuid = (value) => {
  const hash = crypto.createHash('md5').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const mapperSource = fs.readFileSync(mapperPath, 'utf8');
if (sha256(mapperSource) !== EXPECTED_SHA) throw new Error('Immutable Mapper SHA-256 drifted');
const mapperRows = parseCsv(mapperSource);
const processSource = fs.readFileSync(processPath, 'utf8');
const behaviorSource = fs.readFileSync(behaviorPath, 'utf8');
if (sha256(processSource) !== EXPECTED_PROCESS_SHA) throw new Error('Process evidence SHA-256 drifted');
if (sha256(behaviorSource) !== EXPECTED_BEHAVIOR_SHA) throw new Error('ProductBehavior audit SHA-256 drifted');
const processRows = parseCsv(processSource);
const behaviorRows = parseCsv(behaviorSource);
const processById = new Map(processRows.map((row) => [row.ingredient_id, row]));
const behaviorById = new Map(behaviorRows.map((row) => [row.ingredient_id, row]));
const parsedAuthority = authorityPath ? JSON.parse(fs.readFileSync(authorityPath, 'utf8')) : [];
if (authorityPath && !Array.isArray(parsedAuthority)) {
  throw new Error('Authenticated runtime authority drift: export must be a JSON array');
}
const authorityRows = Array.isArray(parsedAuthority) ? parsedAuthority : [];
const authorityById = new Map(authorityRows.map((row) => [row.ingredient_id, row]));
if (mapperRows.length !== 2088 || new Set(mapperRows.map((row) => row.ingredient_id)).size !== 2088) {
  throw new Error('Mapper row/id baseline is not 2088/2088');
}
const mapperIdSet = new Set(mapperRows.map((row) => row.ingredient_id));
for (const [label, companionRows, companionById] of [
  ['Process evidence', processRows, processById],
  ['ProductBehavior audit', behaviorRows, behaviorById],
]) {
  const extraIds = companionRows.map((row) => row.ingredient_id).filter((id) => !mapperIdSet.has(id));
  const missingIds = mapperRows.map((row) => row.ingredient_id).filter((id) => !companionById.has(id));
  if (companionRows.length !== 2088 || companionById.size !== 2088 || extraIds.length || missingIds.length) {
    throw new Error(`${label} identity set drifted; rows=${companionRows.length} unique=${companionById.size} extra=${extraIds.join('|') || 'NONE'} missing=${missingIds.join('|') || 'NONE'}`);
  }
}
if (authorityPath && authorityRows.length !== 2088) {
  throw new Error(`Authenticated authority export must contain 2088 rows, received ${authorityRows.length}`);
}
if (authorityPath && authorityById.size !== 2088) {
  throw new Error(`Authenticated authority export must contain 2088 unique ingredient IDs, received ${authorityById.size}`);
}
if (authorityPath) {
  const requiredFields = [
    'ingredient_id', 'product_id', 'product_version_id', 'binding_id',
    'verification_status', 'source_confidence', 'verification_source',
    'approved_for_base', 'approved_for_engines', 'missing_technical_fields',
    'process_status', 'behavior_state', 'main_policy_status', 'binding_status',
    'selectable_base', 'pi_calculable',
  ];
  const own = (row, field) => Object.prototype.hasOwnProperty.call(row, field);
  for (const [position, row] of authorityRows.entries()) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Authenticated runtime authority drift: row ${position} is not an object`);
    }
    const missingFields = requiredFields.filter((field) => !own(row, field));
    if (missingFields.length > 0) {
      throw new Error(`Authenticated runtime authority drift: ${row.ingredient_id ?? `row ${position}`} missing required field(s) ${missingFields.join('|')}`);
    }
    for (const field of ['approved_for_base', 'approved_for_engines', 'selectable_base', 'pi_calculable']) {
      if (typeof row[field] !== 'boolean') {
        throw new Error(`Authenticated runtime authority drift: ${row.ingredient_id} ${field} must be boolean`);
      }
    }
    if (!Array.isArray(row.missing_technical_fields) ||
        row.missing_technical_fields.some((value) => typeof value !== 'string')) {
      throw new Error(`Authenticated runtime authority drift: ${row.ingredient_id} missing_technical_fields must be a string array`);
    }
    if (row.source_confidence !== null &&
        (typeof row.source_confidence !== 'number' || !Number.isFinite(row.source_confidence))) {
      throw new Error(`Authenticated runtime authority drift: ${row.ingredient_id} source_confidence must be finite or null`);
    }
  }
  for (const field of ['product_id', 'product_version_id', 'binding_id']) {
    const unique = new Set(authorityRows.map((row) => row[field]));
    if (unique.size !== 2088) {
      throw new Error(`Authenticated runtime authority drift: ${field} must contain 2088 unique values, received ${unique.size}`);
    }
  }
  const unexpected = authorityRows
    .map((row) => row.ingredient_id)
    .filter((ingredientId) => !mapperIdSet.has(ingredientId));
  const missing = mapperRows
    .map((row) => row.ingredient_id)
    .filter((ingredientId) => !authorityById.has(ingredientId));
  if (unexpected.length || missing.length) {
    throw new Error(`Authenticated authority ID set drifted; unexpected=${unexpected.join('|') || 'NONE'} missing=${missing.join('|') || 'NONE'}`);
  }
}

const technicalFields = [
  'water_percent', 'total_solids_percent', 'fat_percent', 'protein_percent',
  'carbohydrate_percent', 'total_sugars_percent', 'salt_percent', 'pod_value', 'pac_value',
];
const headers = [
  'ingredient_id', 'display_name', 'category', 'subcategory', 'product_form', 'active',
  'approved_for_base', 'approved_for_engines', 'technical_composition_complete',
  'missing_technical_fields', 'pod_pac_inputs_complete', 'provenance_status',
  'source_confidence', 'source_type', 'process_status', 'dosage_known', 'price_known',
  'mapper_reference_product_id', 'product_version_id', 'current_binding_id',
  'current_product_behavior_state', 'current_main_policy_status', 'current_binding_status',
  'current_picker_status', 'searchable_before',
  'searchable_after', 'selectable_before', 'selectable_after', 'base_addable_before',
  'base_addable_after', 'pi_calculable_before', 'pi_calculable_after',
  'current_block_reason', 'final_block_reason', 'correction_action',
];

const rows = mapperRows.map((row) => {
  const process = processById.get(row.ingredient_id) ?? {};
  const behavior = behaviorById.get(row.ingredient_id) ?? {};
  const authority = authorityById.get(row.ingredient_id) ?? {};
  const base = bool(row.approved_for_base);
  const engine = bool(row.approved_for_engines);
  const missing = technicalFields.filter((field) => !finiteNonNegative(row[field]));
  const technical = missing.length === 0;
  const verified = row.verification_status.startsWith('Verified');
  const selectableBefore = base && engine && verified;
  const selectableAfter = base;
  const piAfter = engine && technical;
  const processStatus = process.process_status || 'UNKNOWN';
  const dosageKnown = finiteNonNegative(row.recommended_dosage_percent_min)
    || finiteNonNegative(row.recommended_dosage_percent_max);
  const priceKnown = finiteNonNegative(row.cost_per_kg) && known(row.currency);
  const currentReasons = [];
  const finalReasons = [];
  const actions = [];
  if (!base) {
    currentReasons.push('BASE:approved_for_base=false');
    finalReasons.push('BASE:approved_for_base=false');
    actions.push('Base blocked until an owner-approved technical Base decision changes');
  }
  if (!engine) {
    currentReasons.push('BASE_AND_PI:approved_for_engines=false');
    finalReasons.push('PI:approved_for_engines=false');
    actions.push('PI blocked until Engine approval is backed by complete technical facts');
  }
  if (missing.length > 0) {
    currentReasons.push(`PI:missing_technical_fields=${missing.join('|')}`);
    finalReasons.push(`PI:missing_technical_fields=${missing.join('|')}`);
    actions.push(`Supply exact numerical fields: ${missing.join('|')}`);
  }
  if (base && engine && technical && !verified) {
    currentReasons.push(`BASE_SELECTION:provenance_status=${row.verification_status}`);
  }
  if (processStatus === 'UNKNOWN') {
    if (behavior.main_policy_status === 'COVERED') currentReasons.push('MAIN:process_evidence_missing');
    finalReasons.push('PROCESS_PRODUCTION:process_status=UNKNOWN');
    actions.push('Technical PI allowed; add exact process evidence before automatic Process/Production guidance');
  }
  if (!dosageKnown) {
    finalReasons.push('PI_AT_0G:grams_required');
    actions.push('Add at 0 g, then enter at least 1 g from producer guidance or the user recipe');
  }
  if (!priceKnown) {
    finalReasons.push('ECO_COST:price_missing');
    actions.push('Technical PI allowed; add a valid private/reference price for complete ECO cost');
  }
  const statusLower = row.verification_status.toLowerCase();
  const pickerStatus = !base
    ? 'PRODUCT DATA INCOMPLETE'
    : statusLower.startsWith('verified')
      ? 'PINGÜINO — SPRAWDZONY'
      : statusLower.includes('label review')
        ? 'WYMAGA SPRAWDZENIA ETYKIETY'
        : statusLower.startsWith('estimated') || statusLower.startsWith('pi calculated')
          ? 'Dane szacowane'
          : 'SYSTEM — DOPASOWANY';
  const productId = authority.product_id || md5Uuid(`pinguino:mapper-reference:v1.0:${row.ingredient_id}`);
  const expectedProductId = md5Uuid(`pinguino:mapper-reference:v1.0:${row.ingredient_id}`);
  const expectedBindingStatus = base ? 'ready' : 'blocked';
  if (authorityPath) {
    const failures = [];
    const authorityConfidence = optionalNumber(authority.source_confidence);
    const expectedConfidence = optionalNumber(row.data_confidence_percent);
    if (authority.product_id !== expectedProductId) failures.push(`product_id=${authority.product_id}`);
    if (!uuidPattern.test(String(authority.product_version_id ?? ''))) failures.push('product_version_id_invalid');
    if (!uuidPattern.test(String(authority.binding_id ?? ''))) failures.push('binding_id_invalid');
    if (authority.verification_status !== row.verification_status) failures.push(`verification_status=${authority.verification_status}`);
    if (authorityConfidence !== expectedConfidence) failures.push(`source_confidence=${authority.source_confidence}`);
    if (authority.verification_source !== row.verification_source) failures.push(`verification_source=${authority.verification_source}`);
    if (bool(authority.approved_for_base) !== base) failures.push(`approved_for_base=${authority.approved_for_base}`);
    if (bool(authority.approved_for_engines) !== engine) failures.push(`approved_for_engines=${authority.approved_for_engines}`);
    if (JSON.stringify(normalizedArray(authority.missing_technical_fields)) !== JSON.stringify([...missing].sort())) {
      failures.push(`missing_technical_fields=${normalizedArray(authority.missing_technical_fields).join('|') || 'NONE'}`);
    }
    if (authority.process_status !== processStatus) failures.push(`process_status=${authority.process_status}`);
    if (authority.behavior_state !== behavior.behavior_role) failures.push(`behavior_state=${authority.behavior_state}`);
    if (authority.main_policy_status !== behavior.main_policy_status) failures.push(`main_policy_status=${authority.main_policy_status}`);
    if (authority.binding_status !== expectedBindingStatus) failures.push(`binding_status=${authority.binding_status}`);
    if (bool(authority.selectable_base) !== selectableAfter) failures.push(`selectable_base=${authority.selectable_base}`);
    if (bool(authority.pi_calculable) !== piAfter) failures.push(`pi_calculable=${authority.pi_calculable}`);
    if (failures.length) {
      throw new Error(`${row.ingredient_id}: authenticated runtime authority drift: ${failures.join(';')}`);
    }
  }
  const result = {
    ingredient_id: row.ingredient_id,
    display_name: row.ingredient_name_display || row.ingredient_name_internal || 'UNKNOWN',
    category: row.ingredient_category || 'UNKNOWN',
    subcategory: row.ingredient_subcategory || 'UNKNOWN',
    product_form: behavior.form || row.ingredient_subcategory || 'UNKNOWN',
    active: 'TRUE', approved_for_base: base ? 'TRUE' : 'FALSE',
    approved_for_engines: engine ? 'TRUE' : 'FALSE',
    technical_composition_complete: technical ? 'TRUE' : 'FALSE',
    missing_technical_fields: missing.length ? missing.join('|') : 'NONE',
    pod_pac_inputs_complete: finiteNonNegative(row.pod_value) && finiteNonNegative(row.pac_value) ? 'TRUE' : 'FALSE',
    provenance_status: row.verification_status || 'UNKNOWN',
    source_confidence: known(row.data_confidence_percent) ? row.data_confidence_percent : 'UNKNOWN',
    source_type: row.verification_source || 'UNKNOWN', process_status: processStatus,
    dosage_known: dosageKnown ? 'TRUE' : 'FALSE', price_known: priceKnown ? 'TRUE' : 'FALSE',
    mapper_reference_product_id: productId,
    product_version_id: authority.product_version_id || 'PENDING_AUTHENTICATED_STAGING_CAPTURE',
    current_binding_id: authority.binding_id || 'PENDING_AUTHENTICATED_STAGING_CAPTURE',
    current_product_behavior_state: authority.behavior_state
      || `AUDIT:${behavior.behavior_role || 'UNKNOWN_REQUIRES_EVIDENCE'}:${behavior.main_policy_status || 'UNKNOWN'}`,
    current_main_policy_status: authority.main_policy_status || behavior.main_policy_status || 'UNKNOWN',
    current_binding_status: authority.binding_status || expectedBindingStatus,
    current_picker_status: pickerStatus,
    searchable_before: 'TRUE', searchable_after: 'TRUE',
    selectable_before: selectableBefore ? 'TRUE' : 'FALSE', selectable_after: selectableAfter ? 'TRUE' : 'FALSE',
    base_addable_before: selectableBefore ? 'TRUE' : 'FALSE', base_addable_after: selectableAfter ? 'TRUE' : 'FALSE',
    pi_calculable_before: selectableBefore && technical ? 'TRUE' : 'FALSE',
    pi_calculable_after: piAfter ? 'TRUE' : 'FALSE',
    current_block_reason: currentReasons.length ? currentReasons.join(';') : 'NONE',
    final_block_reason: finalReasons.length ? finalReasons.join(';') : 'NONE',
    correction_action: actions.length ? [...new Set(actions)].join(';') : 'NO_ACTION_REQUIRED',
  };
  for (const header of headers) if (!known(result[header])) throw new Error(`${row.ingredient_id}: blank ${header}`);
  return result;
});

const count = (predicate) => rows.filter(predicate).length;
const counts = {
  active: rows.length,
  searchableBefore: count((row) => row.searchable_before === 'TRUE'),
  searchableAfter: count((row) => row.searchable_after === 'TRUE'),
  base: count((row) => row.approved_for_base === 'TRUE'),
  engine: count((row) => row.approved_for_engines === 'TRUE'),
  selectableBefore: count((row) => row.selectable_before === 'TRUE'),
  selectableAfter: count((row) => row.selectable_after === 'TRUE'),
  piBefore: count((row) => row.pi_calculable_before === 'TRUE'),
  piAfter: count((row) => row.pi_calculable_after === 'TRUE'),
  provenanceOnlyBefore: count((row) => /^BASE_SELECTION:provenance_status=[^;]+$/.test(row.current_block_reason)),
  // Before the repair, requestedRole=MAIN coupled technical PI to Main process
  // evidence. Count only rows whose sole current blocker was that coupling;
  // rows that also had provenance or technical blockers are not double-counted.
  processOnlyBefore: count((row) => row.current_block_reason === 'MAIN:process_evidence_missing'),
  technicalIncomplete: count((row) => row.technical_composition_complete === 'FALSE'),
  baseFalse: count((row) => row.approved_for_base === 'FALSE'),
  engineFalse: count((row) => row.approved_for_engines === 'FALSE'),
  processUnknown: count((row) => row.process_status === 'UNKNOWN'),
  dosageUnknown: count((row) => row.dosage_known === 'FALSE'),
  priceMissing: count((row) => row.price_known === 'FALSE'),
  verified: count((row) => row.provenance_status.startsWith('Verified')),
  estimated: count((row) => row.provenance_status.startsWith('Estimated')),
  needsLabel: count((row) => row.provenance_status.toLowerCase().includes('label review')),
  unknownBehavior: count((row) => row.current_product_behavior_state.includes('UNKNOWN')),
  missingVersion: count((row) => row.product_version_id.startsWith('PENDING_')),
  missingBinding: count((row) => row.current_binding_id.startsWith('PENDING_')),
};
if (counts.active !== 2088 || counts.base !== 2075 || counts.engine !== 2074
  || counts.selectableBefore !== 1712 || counts.selectableAfter !== 2075 || counts.piAfter !== 2074) {
  throw new Error(`Runtime census drifted: ${JSON.stringify(counts)}`);
}
if (authorityPath && (counts.missingVersion !== 0 || counts.missingBinding !== 0)) {
  throw new Error('Authenticated authority export contains missing product versions or bindings');
}

fs.writeFileSync(outputCsv, `${headers.join(',')}\n${rows.map((row) => headers.map((key) => csv(row[key])).join(',')).join('\n')}\n`);
const countTable = `| Metric | Before | After | Explanation |\n|---|---:|---:|---|\n`
  + `| Active Mapper rows | ${counts.active} | ${counts.active} | Immutable SHA-256 ${EXPECTED_SHA.toUpperCase()} |\n`
  + `| Searchable rows | ${counts.searchableBefore} | ${counts.searchableAfter} | Every active direct Mapper reference remains visible |\n`
  + `| Selectable Base rows | ${counts.selectableBefore} | ${counts.selectableAfter} | After = active + approved_for_base |\n`
  + `| Engine-calculable rows | ${counts.piBefore} | ${counts.piAfter} | After = Engine approval + 9 required numerical fields + grams > 0 |\n`
  + `| Blocked solely by provenance | ${counts.provenanceOnlyBefore} | 0 | Badge/tooltip only after repair |\n`
  + `| Blocked solely by confidence | 0 | 0 | No direct confidence predicate is authorized |\n`
  + `| Blocked solely by process UNKNOWN for technical PI | ${counts.processOnlyBefore} | 0 | Process remains a Process/Production concern |\n`
  + `| Missing dosage | ${counts.dosageUnknown} | ${counts.dosageUnknown} | Informational; initial dose 0 g |\n`
  + `| Missing price | ${counts.priceMissing} | ${counts.priceMissing} | Cost incomplete only |\n`
  + `| Actual technical-data blockers | ${counts.engineFalse} | ${counts.engineFalse} | Unique Engine-ineligible set; technical missing overlaps it |\n`
  + `| approved_for_base=false | ${counts.baseFalse} | ${counts.baseFalse} | Real Base block |\n`
  + `| approved_for_engines=false | ${counts.engineFalse} | ${counts.engineFalse} | Real PI block |\n`
  + `| Missing bindings | ${counts.missingBinding} | ${counts.missingBinding} | ${authorityPath ? 'Authenticated staging authority export complete' : 'Requires authenticated staging authority export for final zero proof'} |\n`
  + `| Verified status | ${counts.verified} | ${counts.verified} | Informational |\n`
  + `| Estimated status | ${counts.estimated} | ${counts.estimated} | Informational |\n`
  + `| Needs Label Review | ${counts.needsLabel} | ${counts.needsLabel} | Informational for technical use |`;
const md = `# Mapper 2088 runtime usability audit\n\nGenerated deterministically by \`scripts/auditMapperRuntimeUsability.mjs\`. The source Mapper CSV is read-only and its SHA is pinned.\n\n${countTable}\n\n## Additional exact census\n\n- Approved for Base: **${counts.base}**.\n- Approved for Engine: **${counts.engine}**.\n- Technical composition incomplete under the 9-field contract: **${counts.technicalIncomplete}** (PI-ING-002113: POD/PAC).\n- ProductBehavior UNKNOWN_REQUIRES_EVIDENCE: **${counts.unknownBehavior}**.\n- Process UNKNOWN: **${counts.processUnknown}**.\n- Dosage UNKNOWN: **${counts.dosageUnknown}**.\n- Price missing: **${counts.priceMissing}**.\n- Customer-added Mapper references: **0**.\n- System-matched Mapper references: **0**.\n- Product version IDs pending authenticated served capture: **${counts.missingVersion}**.\n- Binding IDs pending authenticated served capture: **${counts.missingBinding}**.\n\n## Real remaining gates\n\n1. \`approved_for_base=false\` blocks Base only.\n2. \`approved_for_engines=false\` or one of the nine missing numerical fields blocks technical PI.\n3. Zero grams blocks the PI click until the user enters at least 1 g; unknown dosage itself does not block selection.\n4. Process UNKNOWN is preserved for Process/Production warnings and does not block technical PI.\n5. Missing price leaves cost incomplete and prevents an honest cheapest-result claim; technical calculation remains available.\n\nThe exhaustive CSV preserves every simultaneous module-scoped reason instead of collapsing it into a single status.\n`;
fs.writeFileSync(outputMd, md);
console.log(JSON.stringify(counts));
