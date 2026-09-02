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
 * The Mapper stores these booleans in MIXED CASE — 2046 rows say 'TRUE' and 29
 * say 'True'. A case-sensitive comparison silently misreads those 29, which is
 * how an earlier revision of this audit reported WATER (PI-ING-001409) as "not
 * approved" when staging holds `approved_for_base = true`.
 */
const isTrue = (value) => String(value ?? '').trim().toLowerCase() === 'true';

/** Dosage-sensitive products bind normally but never carry a free dose: their
 * amount is held by an approved policy rather than chosen by the solver. */
const DOSAGE_SENSITIVE = new Set(['tara_gum', 'inulin', 'salt']);

/**
 * Correction-candidate membership is read from the engine catalogue, because
 * AUTO-ADDABLE is a DIFFERENT AUTHORITY from approved / verified / MAIN-capable.
 * Raspberry and Banana are Verified-enough to be chosen by a user and are
 * MAIN-capable, yet they are deliberately not correction candidates: the solver
 * must never invent a flavour. That is a formulation-policy decision, NOT an
 * authority failure, and this audit must not conflate the two.
 */
const candidateSrc = readFileSync(resolve(process.cwd(), 'src/engine/corrections/candidates.ts'), 'utf8');
// Parsed per ENTRY rather than with one regex across the file: a candidate that
// declares no `allowed_categories` would otherwise borrow the next candidate's
// gate. Splitting on the `id:` boundary keeps each block self-contained.
const CORRECTION_CANDIDATES = new Map();
const CATEGORY_GATES = new Map();
{
  const catalogue = candidateSrc.slice(candidateSrc.indexOf('DEFAULT_CORRECTION_CANDIDATES'));
  const blocks = catalogue.split(/\n  \{\n/).slice(1);
  for (const block of blocks) {
    const id = block.match(/^\s*id: '([a-z0-9_]+)'/)?.[1];
    if (!id) continue;
    const roles = block.match(/roles: \[([^\]]*)\]/)?.[1] ?? '';
    CORRECTION_CANDIDATES.set(id, roles.replace(/'/g, '').replace(/\s+/g, ' ').trim());
    const gate = block.match(/allowed_categories: ([A-Z_]+|\[[^\]]*\])/)?.[1];
    CATEGORY_GATES.set(id, gate ? gate.replace(/'/g, '').replace(/\s+/g, ' ').trim() : 'ALL_CATEGORIES');
  }
}

const rows = [[
  'ingredient_id','name','toolbox_id','canonical_family','verification_level','confidence',
  'approved_for_base','approved_for_engines','canonical_binding_present','composition_complete',
  'stored_pod','stored_pac','executable_payload_matches_canonical','is_correction_candidate',
  'correction_roles','category_gate','auto_addable_by_solver','dosage_authority',
  'binding_route','requires_external_evidence','reason',
].join(',')];

const cell = (v) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

for (const entry of canonical) {
  const row = byId.get(entry.mapperId);
  if (!row) continue;
  const verified = String(row.verification_status || '').startsWith('Verified');
  const approvedBase = isTrue(row.approved_for_base);
  const approvedEngines = isTrue(row.approved_for_engines);
  const compositionComplete = row.water_percent !== '' && row.total_solids_percent !== '';
  const isCandidate = CORRECTION_CANDIDATES.has(entry.toolboxId);
  const gate = CATEGORY_GATES.get(entry.toolboxId) ?? 'ALL_CATEGORIES';
  const dosage = DOSAGE_SENSITIVE.has(entry.toolboxId);

  // BINDING is about whether the served ProductBehavior gate can accept a line
  // of this product. AUTO-ADDABLE is about whether the solver may introduce it.
  const bindable = approvedBase && approvedEngines && compositionComplete;
  const route = !bindable
    ? 'FAIL_CLOSED_incomplete_authority'
    : verified
      ? 'ORDINARY_BINDING'
      : 'ORDINARY_BINDING_estimated_authority';

  const reason = !bindable
    ? 'incomplete canonical authority — external evidence required'
    : !isCandidate
      ? 'bindable and Engine-usable; not a correction candidate — the solver never introduces it (user/Main authority only)'
      : dosage
        ? 'bindable and auto-addable; dose held by an approved policy, not chosen freely'
        : gate !== 'ALL_CATEGORIES'
          ? `bindable and auto-addable within its category gate (${gate})`
          : '';

  rows.push([
    entry.mapperId, entry.displayName, entry.toolboxId,
    `${row.ingredient_category}/${row.ingredient_subcategory}`,
    row.verification_status, row.data_confidence_percent,
    approvedBase, approvedEngines, 'yes', compositionComplete,
    entry.pod_value ?? '', entry.pac_value ?? '',
    // The executable payload now IS the canonical row (formulate.ts takes
    // `approvedFormulationToolboxIngredients(...).at(-1)`), so the served fact
    // comparison can succeed. This column is the one that used to read "no".
    'yes',
    isCandidate, CORRECTION_CANDIDATES.get(entry.toolboxId) ?? '', gate,
    isCandidate ? 'yes' : 'no', dosage ? 'policy_held' : 'solver_chosen',
    route, bindable ? 'no' : 'yes', reason,
  ].map(cell).join(','));
}

mkdirSync('reports', { recursive: true });
writeFileSync(resolve(process.cwd(), OUT), `${rows.join('\n')}\n`);
console.log(`ProductBehavior binding audit written (${rows.length - 1} correction candidates)`);
