/**
 * Generates `src/data/ingredients/canonicalToolboxCompositions.ts` — the ONE
 * composition authority shared by the offline template/starter path and the
 * served runtime.
 *
 * WHY THIS EXISTS
 * ---------------
 * `DEFAULT_CORRECTION_CANDIDATES` carries engine REFERENCE compositions
 * (literature values, confidence 85, pod/pac null). The served app materializes
 * the canonical Mapper row instead (verified, confidence 98, real stored
 * POD/PAC). All eight toolbox-bound identities diverged, and because
 * `engine/pac.ts` prefers a STORED pac_value the two paths were not even doing
 * the same freezing arithmetic. A recipe therefore scored differently offline
 * and served — measured as Score 10 in tests vs Score 6 on staging.
 *
 * This script reads the immutable Mapper base and emits the canonical
 * compositions for exactly the bound identities. It NEVER writes the Mapper.
 * `--check` fails when the generated file has drifted from the base.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const MAPPER = 'docs/ingredients/validation/mapper_basement.csv';
const OUT = 'src/data/ingredients/canonicalToolboxCompositions.ts';

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

const NUM = new Set(['data_confidence_percent','water_percent','total_solids_percent','fat_percent','saturated_fat_percent','protein_percent','carbohydrate_percent','total_sugars_percent','sucrose_percent','dextrose_percent','glucose_percent','fructose_percent','lactose_percent','polyol_percent','fiber_percent','salt_percent','alcohol_percent','kcal_per_100g','cost_per_kg','pod_value','pac_value','de_value']);

const raw = readFileSync(resolve(process.cwd(), MAPPER));
const grid = parseCsv(raw.toString('utf8'));
const header = grid[0];
const byId = new Map();
for (const cells of grid.slice(1)) {
  if (cells.length < 5) continue;
  const rec = {};
  header.forEach((col, i) => {
    const v = cells[i] ?? '';
    rec[col] = NUM.has(col) ? (v === '' ? null : Number(v)) : v;
  });
  if (rec.ingredient_id) byId.set(rec.ingredient_id, rec);
}

// Normal toolbox bindings remain owned by the canonical identity registry.
// The isolated Starter Pack Rescue owns a second closed registry so adding its
// exact candidates does not alter the Production Rescue source closure.
const identitySource = readFileSync(
  resolve(process.cwd(), 'src/data/ingredients/canonicalIngredientIdentity.ts'),
  'utf8',
);
const rescueSource = readFileSync(
  resolve(process.cwd(), 'src/features/constraint-studio/starterPackRescuePalette.ts'),
  'utf8',
);
const identityBound = [
  ...identitySource.matchAll(/toolboxId:\s*'([^']+)',\s*mapperId:\s*'(PI-ING-\d+)'/g),
].map((match) => ({ toolboxId: match[1], mapperId: match[2] }));
const rescueBound = [
  ...rescueSource.matchAll(/mapperId:\s*'(PI-ING-\d+)',\s*toolboxId:\s*'([^']+)'/g),
].map((match) => ({ toolboxId: match[2], mapperId: match[1] }));
const bound = [
  ...new Map(
    [...identityBound, ...rescueBound].map((entry) => [
      `${entry.toolboxId}:${entry.mapperId}`,
      entry,
    ]),
  ).values(),
];
if (bound.length === 0) throw new Error('No toolbox↔Mapper identities found.');

const n = (v) => (v === null || v === undefined ? 0 : v);
const entries = bound.map(({ toolboxId, mapperId }) => {
  const row = byId.get(mapperId);
  if (!row) throw new Error(`Mapper row missing for ${toolboxId} → ${mapperId}`);
  const comp = {
    water_percent: n(row.water_percent), solids_percent: n(row.total_solids_percent),
    fat_percent: n(row.fat_percent), protein_percent: n(row.protein_percent),
    carbohydrate_percent: n(row.carbohydrate_percent), sugar_percent: n(row.total_sugars_percent),
    sucrose_percent: n(row.sucrose_percent), glucose_percent: n(row.glucose_percent),
    dextrose_percent: n(row.dextrose_percent), fructose_percent: n(row.fructose_percent),
    lactose_percent: n(row.lactose_percent), polyol_percent: n(row.polyol_percent),
    fiber_percent: n(row.fiber_percent), salt_percent: n(row.salt_percent),
    alcohol_percent: n(row.alcohol_percent), kcal_per_100g: n(row.kcal_per_100g),
  };
  if (row.saturated_fat_percent !== null && row.saturated_fat_percent !== undefined) {
    comp.saturated_fat_percent = row.saturated_fat_percent;
  }
  return {
    toolboxId, mapperId,
    displayName: (row.ingredient_name_display || '').trim() || row.ingredient_name_internal,
    composition: comp,
    pod_value: row.pod_value, pac_value: row.pac_value, de_value: row.de_value,
    cost_per_kg: row.cost_per_kg, cost_currency: row.currency || null,
    confidence_score: n(row.data_confidence_percent),
    verified: String(row.verification_status || '').startsWith('Verified'),
  };
});

const mapperSha = createHash('sha256').update(raw).digest('hex');
const body = `/**
 * CANONICAL TOOLBOX COMPOSITIONS — GENERATED, DO NOT EDIT BY HAND.
 *
 * Regenerate with \`npm run toolbox:compositions\`; \`--check\` guards drift.
 *
 * ONE composition authority for every toolbox-bound ingredient. Before this
 * existed the offline template/starter path used the engine REFERENCE payloads
 * in \`DEFAULT_CORRECTION_CANDIDATES\` (literature values, confidence 85,
 * pod/pac null) while the served app materialized the canonical Mapper row
 * (verified, confidence 98, real stored POD/PAC) through
 * \`executableRecipeHandoff.resolveLine\`. All bound identities diverged, and
 * since \`engine/pac.ts\` prefers a STORED pac_value the two paths were not even
 * performing the same freezing arithmetic — a recipe measured Score 10 offline
 * and Score 6 served.
 *
 * Source of truth: docs/ingredients/validation/mapper_basement.csv
 * Mapper SHA-256 at generation: ${mapperSha}
 *
 * The Mapper base is never written by this file or its generator.
 */
import type { IngredientComponentProfile } from '@/engine';

export interface CanonicalToolboxComposition {
  toolboxId: string;
  mapperId: string;
  displayName: string;
  composition: IngredientComponentProfile;
  pod_value: number | null;
  pac_value: number | null;
  de_value: number | null;
  cost_per_kg: number | null;
  cost_currency: string | null;
  confidence_score: number;
  verified: boolean;
}

/** Mapper SHA-256 this file was generated from. */
export const CANONICAL_TOOLBOX_MAPPER_SHA256 =
  '${mapperSha}';

export const CANONICAL_TOOLBOX_COMPOSITIONS: readonly CanonicalToolboxComposition[] = ${JSON.stringify(entries, null, 2)};

const BY_TOOLBOX_ID = new Map(
  CANONICAL_TOOLBOX_COMPOSITIONS.map((entry) => [entry.toolboxId, entry] as const),
);

/** Canonical Mapper-backed composition for a toolbox id, or null when unbound. */
export function canonicalToolboxComposition(
  toolboxId: string,
): CanonicalToolboxComposition | null {
  return BY_TOOLBOX_ID.get(toolboxId) ?? null;
}
`;

const check = process.argv.includes('--check');
const outPath = resolve(process.cwd(), OUT);
if (check) {
  const existing = readFileSync(outPath, 'utf8');
  if (existing !== body) {
    console.error('canonicalToolboxCompositions.ts is STALE — run `npm run toolbox:compositions`.');
    process.exit(1);
  }
  console.log(`Canonical toolbox compositions verified (${entries.length} identities, mapper ${mapperSha.slice(0, 12)}…)`);
} else {
  writeFileSync(outPath, body);
  console.log(`Canonical toolbox compositions written (${entries.length} identities, mapper ${mapperSha.slice(0, 12)}…)`);
}
