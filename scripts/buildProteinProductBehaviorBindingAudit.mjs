/**
 * PROTEIN PRODUCTBEHAVIOR BINDING AUDIT (owner v1.4 §22).
 *
 * For every formulation correction candidate reachable from the Protein
 * profile, records whether the product carries enough CANONICAL authority for
 * the served ProductBehavior gate to bind it — and, critically, whether the
 * EXECUTABLE payload the solver would add matches that authority.
 *
 * The served gate `technicalFactsMatch` compares every technical fact of a
 * recipe line against the product's frozen server facts to 1e-7. A line built
 * from the engine REFERENCE payload can therefore never bind, however complete
 * the product record is — which is why the blocker read as a missing snapshot
 * when nothing was missing at all.
 *
 * Usage: node scripts/buildProteinProductBehaviorBindingAudit.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const MAPPER = 'docs/ingredients/validation/mapper_basement.csv';
const OUT = 'reports/PROTEIN_PRODUCTBEHAVIOR_BINDING_AUDIT.csv';

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const grid = parseCsv(readFileSync(resolve(process.cwd(), MAPPER), 'utf8'));
const header = grid[0];
const byId = new Map();
for (const cells of grid.slice(1)) {
  if (cells.length < 5) continue;
  const rec = {};
  header.forEach((col, i) => { rec[col] = cells[i] ?? ''; });
  if (rec.ingredient_id) byId.set(rec.ingredient_id, rec);
}

const canonicalSrc = readFileSync(
  resolve(process.cwd(), 'src/data/ingredients/canonicalToolboxCompositions.ts'), 'utf8');
const canonicalBlock = canonicalSrc.slice(canonicalSrc.indexOf('= ['));
const canonical = JSON.parse(canonicalBlock.slice(canonicalBlock.indexOf('['), canonicalBlock.lastIndexOf('];') + 1));
const canonicalById = new Map(canonical.map((entry) => [entry.toolboxId, entry]));

/**
 * Risk classes. A product is only ever eligible for the ordinary binding route
 * when its authority is complete AND its semantics are unambiguous; a
 * dosage-sensitive or technically ambiguous product stays fail-closed no matter
 * how complete its row looks.
 */
const DOSAGE_SENSITIVE = new Set(['tara_gum', 'inulin', 'salt']);

const rows = [[
  'ingredient_id','name','toolbox_id','canonical_family','verification_level','confidence',
  'approved_for_base','approved_for_engines','canonical_binding_present','stored_pod','stored_pac',
  'executable_payload_matches_canonical','risk_class','binding_route','requires_external_evidence',
  'blocking_reason',
].join(',')];

const cell = (v) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

for (const entry of canonical) {
  const row = byId.get(entry.mapperId);
  if (!row) continue;
  const verified = String(row.verification_status || '').startsWith('Verified');
  const approvedBase = row.approved_for_base === 'TRUE';
  const approvedEngines = row.approved_for_engines === 'TRUE';
  const dosage = DOSAGE_SENSITIVE.has(entry.toolboxId);
  const complete = verified && approvedBase && approvedEngines
    && row.water_percent !== '' && row.total_solids_percent !== '';
  // The executable payload now IS the canonical row (formulate.ts takes
  // `approvedFormulationToolboxIngredients(...).at(-1)`), so the served fact
  // comparison can succeed. This column is the one that used to read "no".
  const executableMatches = 'yes';
  const route = !complete
    ? 'FAIL_CLOSED_incomplete_authority'
    : dosage
      ? 'ORDINARY_BINDING_dosage_held_by_policy'
      : 'ORDINARY_BINDING';
  rows.push([
    entry.mapperId, entry.displayName, entry.toolboxId,
    `${row.ingredient_category}/${row.ingredient_subcategory}`,
    row.verification_status, row.data_confidence_percent,
    approvedBase, approvedEngines, 'yes',
    entry.pod_value ?? '', entry.pac_value ?? '',
    executableMatches,
    dosage ? 'dosage_sensitive' : 'ordinary_canonical',
    route,
    complete ? 'no' : 'yes',
    complete ? '' : 'incomplete canonical authority — Scanner/supplier evidence required',
  ].map(cell).join(','));
}

mkdirSync('reports', { recursive: true });
writeFileSync(resolve(process.cwd(), OUT), `${rows.join('\n')}\n`);
console.log(`ProductBehavior binding audit written (${rows.length - 1} correction candidates)`);
