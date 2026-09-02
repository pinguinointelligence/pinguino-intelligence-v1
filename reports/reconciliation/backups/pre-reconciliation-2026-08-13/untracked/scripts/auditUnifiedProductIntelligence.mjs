import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const mapperPath = path.join(root, 'docs/ingredients/validation/mapper_basement.csv');
const processPath = path.join(root, 'supabase/seed/mapper_process_metadata.csv');
const reportCsv = path.join(root, 'reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv');
const reportMd = path.join(root, 'reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.md');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'; index += 1;
      } else quoted = !quoted;
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
  const [header, ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

const escapeCsv = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

const mapperSource = fs.readFileSync(mapperPath, 'utf8');
const processSource = fs.readFileSync(processPath, 'utf8');
const mapper = parseCsv(mapperSource);
const processRows = parseCsv(processSource);
const processById = new Map(processRows.map((row) => [row.ingredient_id, row]));
const exact = new Map([
  ['PI-ING-001553', { family: 'fruit', subfamily: 'berry', form: 'fresh', main: 'MAIN_PROFILE_SPECIFIC', profiles: 'fruit_gelato' }],
  ['PI-ING-000345', { family: 'fruit', subfamily: 'banana', form: 'fresh', main: 'MAIN_PROFILE_SPECIFIC', profiles: 'fruit_gelato' }],
  ['PI-ING-000366', { family: 'fruit', subfamily: 'kiwi', form: 'fresh', main: 'MAIN_PROFILE_SPECIFIC', profiles: 'fruit_gelato' }],
]);
const structural = new Set([
  'sweetener', 'stabilizer', 'fiber', 'emulsifier', 'starch', 'acid', 'colorant',
  'functional_additive', 'additive',
]);
const carrierIds = new Set([
  'PI-ING-000200', 'PI-ING-000201', 'PI-ING-000234', 'PI-ING-000235', 'PI-ING-000236',
]);

const audit = mapper.map((row) => {
  const reviewed = exact.get(row.ingredient_id);
  const notMain = structural.has(row.ingredient_category.toLowerCase()) ||
    row.ingredient_subcategory.toLowerCase() === 'water';
  const processRow = processById.get(row.ingredient_id);
  return {
    ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name_display,
    base_eligible: row.approved_for_base,
    engine_eligible: row.approved_for_engines,
    main_eligibility: reviewed?.main ?? (notMain ? 'NOT_MAIN' : 'UNKNOWN'),
    family: reviewed?.family ?? 'UNKNOWN_REQUIRES_REVIEW',
    subfamily: reviewed?.subfamily ?? 'UNKNOWN_REQUIRES_REVIEW',
    form: reviewed?.form ?? 'UNKNOWN_REQUIRES_REVIEW',
    form_hint: row.ingredient_subcategory || 'other',
    supported_profiles: reviewed?.profiles ?? 'UNKNOWN_REQUIRES_REVIEW',
    policy_coverage: reviewed ? 'OWNER_PROVISIONAL_V1' : 'UNKNOWN_REQUIRES_REVIEW',
    process_mapping: processRow?.process_status ?? 'UNKNOWN',
    process_evidence_level: processRow?.process_evidence_level ?? 'UNKNOWN',
    vegan_status: row.vegan === 'TRUE' ? 'verified' : row.vegan === 'FALSE' ? 'false' : 'unknown',
    protein_behavior: Number(row.aerating_protein_percent || 0) > 0 ? 'contributor_candidate' : 'UNKNOWN_REQUIRES_REVIEW',
    approved_liquid_dairy_carrier: carrierIds.has(row.ingredient_id) ? 'TRUE' : 'FALSE',
  };
});

if (mapper.length !== 2088 || new Set(mapper.map((row) => row.ingredient_id)).size !== 2088) {
  throw new Error(`Mapper exhaustiveness failed: rows=${mapper.length}`);
}
if (processRows.length !== 2088 || processById.size !== 2088) {
  throw new Error(`Process exhaustiveness failed: rows=${processRows.length}`);
}
for (const row of mapper) if (!processById.has(row.ingredient_id)) throw new Error(`Missing process row ${row.ingredient_id}`);

const headers = Object.keys(audit[0]);
const csv = [headers.join(','), ...audit.map((row) => headers.map((key) => escapeCsv(row[key])).join(','))].join('\n') + '\n';
const counts = (field) => audit.reduce((result, row) => {
  result[row[field]] = (result[row[field]] ?? 0) + 1;
  return result;
}, {});
const mainCounts = counts('main_eligibility');
const processCounts = counts('process_mapping');
const md = `# Mapper 2088 Product Behavior Audit

Generated deterministically from the locked Mapper CSV and its immutable process companion. This report does not write to Mapper.

## Reconciliation

- Mapper rows: **${mapper.length}**
- Unique Mapper IDs: **${new Set(mapper.map((row) => row.ingredient_id)).size}**
- Process rows joined: **${processById.size}**
- Mapper SHA-256: \`${sha256(mapperSource)}\`
- Process SHA-256: \`${sha256(processSource)}\`
- Detailed exhaustive output: [MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv](./MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv)

## Main eligibility

${Object.entries(mainCounts).sort().map(([key, value]) => `- ${key}: **${value}**`).join('\n')}

Only three exact owner fixtures have a provisional Main policy binding. Structural categories are deterministically NOT_MAIN. Every other row remains UNKNOWN_REQUIRES_REVIEW; no family, form, concentration or policy is guessed.

## Process evidence

${Object.entries(processCounts).sort().map(([key, value]) => `- ${key}: **${value}**`).join('\n')}

## Coverage limitations

- Governed family/subfamily/form/profile policy coverage: **3 / 2088** exact reviewed bindings.
- All 2088 rows are present; UNKNOWN rows are never removed by an inner join.
- Protein percentages are preserved as evidence. Positive protein is not promoted to a final behavior except as an explicit contributor candidate.
- Runtime active catalog counts require the service-only \`catalog_product_behavior_audit_v1\` view on a migrated database. The linked staging migration ledger is currently unreconciled, so catalog counts are not fabricated here.
`;

fs.mkdirSync(path.dirname(reportCsv), { recursive: true });
fs.writeFileSync(reportCsv, csv);
fs.writeFileSync(reportMd, md);
console.log(JSON.stringify({ mapperRows: mapper.length, mainCounts, processCounts }, null, 2));
