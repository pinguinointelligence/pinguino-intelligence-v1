import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const input = resolve(root, 'docs/ingredients/validation/mapper_basement.csv');
const output = resolve(
  root,
  'docs/ingredients/validation/mapper_saturated_fat_owner_review_manifest.csv',
);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

const [headers, ...rows] = parseCsv(readFileSync(input, 'utf8'));
const index = Object.fromEntries(headers.map((name, position) => [name, position]));
const cell = (row, name) => String(row[index[name]] ?? '').trim();
const sourceLacked = (row) =>
  /Saturated fat, EAN, cost and dosage were not present in the source/i.test(
    cell(row, 'engine_notes'),
  );

const classify = (row) => {
  const current = cell(row, 'saturated_fat_percent');
  const fat = Number(cell(row, 'fat_percent'));
  const status = cell(row, 'verification_status');
  if (cell(row, 'ingredient_id') === 'PI-ING-000180') {
    return {
      category: 'OFFICIAL_EXACT_PRODUCT_VALUE_FOUND_BASIS_REVIEW',
      proposed: '',
      candidate: '20 g/100 ml',
      authority: 'manufacturer label; exact GTIN 5900512904443',
      source: 'https://mlekovita.com.pl/produkt/smietanka-polska-30percent-921',
      reason:
        'Exact product evidence exists in country_local_products; reconcile 100 ml versus Mapper 100 g basis before any update.',
    };
  }
  if (cell(row, 'ingredient_id') === 'PI-ING-000494') {
    return {
      category: 'DOCUMENTED_EXACT_ZERO_CANDIDATE',
      proposed: '0',
      candidate: '0 g/100 g',
      authority: 'exact country-local product label; exact GTIN 5902751322798',
      source:
        'https://swojskapiwniczka.pl/kosmetyki-naturalne/glukoza-krystaliczna-dekstroza-500g-swojska-piwniczka',
      reason:
        'True zero is documented for the exact PL product; keep scoped to that version unless canonical equivalence is Owner-approved.',
    };
  }
  if (current === '0' && sourceLacked(row)) {
    return {
      category: 'DOCUMENTED_PLACEHOLDER_ZERO',
      proposed: 'NULL',
      candidate: '',
      authority: 'source explicitly missing',
      source: cell(row, 'screenshot_reference') || cell(row, 'verification_source'),
      reason: 'Source did not contain saturated fat; zero must not be treated as a measured value.',
    };
  }
  if (!current && sourceLacked(row)) {
    return {
      category: 'DOCUMENTED_UNKNOWN',
      proposed: 'NULL',
      candidate: '',
      authority: 'source explicitly missing',
      source: cell(row, 'screenshot_reference') || cell(row, 'verification_source'),
      reason: 'Correctly remains unknown because the source did not contain saturated fat.',
    };
  }
  if (Number(current) > 0 && status === 'Estimated / Needs Label Review') {
    return {
      category: 'ESTIMATED_POSITIVE',
      proposed: '',
      candidate: current,
      authority: 'estimated; not field-level label evidence',
      source: cell(row, 'source_url') || cell(row, 'verification_source'),
      reason: 'Do not auto-print as verified until the exact field and basis are evidenced.',
    };
  }
  if (Number(current) > 0) {
    return {
      category: 'POSITIVE_WITHOUT_PROVEN_FIELD_EVIDENCE',
      proposed: '',
      candidate: current,
      authority: status || 'unresolved',
      source: cell(row, 'source_url') || cell(row, 'verification_source'),
      reason: 'Product-level verification does not prove field-level saturated-fat provenance.',
    };
  }
  if (current === '0' && fat > 0) {
    return {
      category: 'SUSPICIOUS_ZERO_WITH_POSITIVE_FAT',
      proposed: '',
      candidate: '',
      authority: 'unresolved',
      source: cell(row, 'source_url') || cell(row, 'verification_source'),
      reason: 'Requires exact label/database review; no inference from total fat is permitted.',
    };
  }
  if (current === '0') {
    return {
      category: 'ZERO_REQUIRES_FIELD_EVIDENCE',
      proposed: '',
      candidate: '',
      authority: 'unresolved zero',
      source: cell(row, 'source_url') || cell(row, 'verification_source'),
      reason: 'Likely zero for many fat-free products, but true zero needs field-level evidence.',
    };
  }
  return {
    category: 'UNKNOWN_NOT_EXPLICITLY_DOCUMENTED',
    proposed: 'NULL',
    candidate: '',
    authority: 'missing',
    source: cell(row, 'source_url') || cell(row, 'verification_source'),
    reason: 'No reliable saturated-fat value is available.',
  };
};

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const outputHeaders = [
  'ingredient_id',
  'ingredient_name',
  'current_saturated_fat_percent',
  'proposed_saturated_fat_percent',
  'candidate_source_value',
  'category',
  'authority',
  'source',
  'reason',
  'owner_decision',
];
const outputRows = rows.map((row) => {
  const finding = classify(row);
  return [
    cell(row, 'ingredient_id'),
    cell(row, 'ingredient_name_display'),
    cell(row, 'saturated_fat_percent'),
    finding.proposed,
    finding.candidate,
    finding.category,
    finding.authority,
    finding.source,
    finding.reason,
    'PENDING_OWNER_REVIEW',
  ];
});
writeFileSync(
  output,
  [outputHeaders, ...outputRows].map((row) => row.map(quote).join(',')).join('\n') + '\n',
);
console.log(`Wrote ${outputRows.length} review rows to ${output}`);
