import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

export const PROCESS_DATASET_VERSION = '2026-08-08-process-v1';
export const PROCESS_DATASET_SHA256 =
  'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4';

export const PROCESS_HEADERS = [
  'ingredient_id',
  'ingredient_name_display',
  'process_status',
  'thermal_state',
  'safety_heat_requirement',
  'functional_heat_requirement',
  'cold_process_eligibility',
  'hydration_mode',
  'hydration_temp_min_c',
  'hydration_temp_target_c',
  'hydration_time_min',
  'process_stage_default',
  'heat_sensitive',
  'heat_sensitivity_notes',
  'process_reason_codes',
  'process_confidence_percent',
  'process_evidence_level',
  'process_rule_id',
  'process_source_1',
  'process_source_2',
  'process_notes',
  'process_last_reviewed_at',
];

export const EXPECTED_PROCESS_COUNTS = Object.freeze({
  COLD_PROCESS_OK: 636,
  HEAT_REQUIRED_FOR_FUNCTION: 56,
  HEAT_REQUIRED_FOR_SAFETY: 7,
  HEAT_REQUIRED_FOR_BOTH: 0,
  UNKNOWN: 1389,
});

const parseCsv = (path) => {
  const source = readFileSync(path, 'utf8');
  const workbook = XLSX.read(source, { type: 'string', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error(`CSV has no worksheet: ${path}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
};

const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').toLowerCase();

const sameOrderedValues = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export function validateProcessMetadataDataset(processPath, mapperPath) {
  const sourceHash = sha256(processPath);
  if (sourceHash !== PROCESS_DATASET_SHA256) {
    throw new Error(`Unexpected process source SHA-256: ${sourceHash}`);
  }

  const rows = parseCsv(processPath);
  if (rows.length !== 2088) throw new Error(`Expected 2088 process rows, got ${rows.length}`);
  const headers = Object.keys(rows[0] ?? {});
  if (!sameOrderedValues(headers, PROCESS_HEADERS)) {
    throw new Error(`Unexpected process columns: ${headers.join(',')}`);
  }

  const ingredientIds = rows.map((row) => String(row.ingredient_id).trim());
  const blankIds = ingredientIds.filter((id) => id.length === 0);
  const uniqueIds = new Set(ingredientIds);
  if (blankIds.length !== 0) throw new Error(`Blank process ingredient IDs: ${blankIds.length}`);
  if (uniqueIds.size !== 2088) throw new Error(`Unique process ingredient IDs: ${uniqueIds.size}`);

  const counts = Object.fromEntries(
    Object.keys(EXPECTED_PROCESS_COUNTS).map((status) => [
      status,
      rows.filter((row) => row.process_status === status).length,
    ]),
  );
  for (const [status, expected] of Object.entries(EXPECTED_PROCESS_COUNTS)) {
    if (counts[status] !== expected) {
      throw new Error(`${status}: expected ${expected}, got ${counts[status]}`);
    }
  }

  const mapperRows = parseCsv(mapperPath);
  const mapperIds = mapperRows.map((row) => String(row.ingredient_id).trim());
  const mapperSet = new Set(mapperIds);
  const processOnly = [...uniqueIds].filter((id) => !mapperSet.has(id));
  const mapperOnly = [...mapperSet].filter((id) => !uniqueIds.has(id));
  if (mapperRows.length !== 2088 || mapperSet.size !== 2088) {
    throw new Error(`Mapper identity shape is not 2088/2088: ${mapperRows.length}/${mapperSet.size}`);
  }
  if (processOnly.length > 0 || mapperOnly.length > 0) {
    throw new Error(
      `Process/Mapper identity mismatch: process-only=${processOnly.length}, mapper-only=${mapperOnly.length}`,
    );
  }

  return {
    rows,
    manifest: {
      sourceHash,
      rowCount: rows.length,
      columnCount: headers.length,
      uniqueIngredientIds: uniqueIds.size,
      blankIngredientIds: blankIds.length,
      statusCounts: counts,
      mapperRowCount: mapperRows.length,
      mapperUniqueIngredientIds: mapperSet.size,
      alignmentDifferences: processOnly.length + mapperOnly.length,
    },
  };
}

const sqlText = (value) => {
  const text = String(value ?? '');
  return text.length === 0 ? 'null' : `'${text.replaceAll("'", "''")}'`;
};

const insertChunks = (rows, chunkSize = 200) => {
  const statements = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const values = rows.slice(index, index + chunkSize).map(
      (row) => `(${PROCESS_HEADERS.map((header) => sqlText(row[header])).join(',')})`,
    );
    statements.push(
      `insert into process_source (${PROCESS_HEADERS.join(',')}) values\n${values.join(',\n')};`,
    );
  }
  return statements.join('\n\n');
};

export function buildProcessMetadataMigration(rows) {
  const statusChecks = Object.entries(EXPECTED_PROCESS_COUNTS)
    .map(
      ([status, count]) =>
        `  if (select count(*) from process_source where process_status = '${status}') <> ${count} then raise exception 'Unexpected ${status} count'; end if;`,
    )
    .join('\n');

  return `-- Generated from Owner-approved mapper_process_metadata.csv.
-- Source SHA-256: ${PROCESS_DATASET_SHA256}
-- Do not hand-edit generated rows. Rebuild with scripts/buildProcessMetadataSeed.mjs.
begin;

create temporary table process_source (
  ${PROCESS_HEADERS.map((header) => `${header} text`).join(',\n  ')}
) on commit drop;

${insertChunks(rows)}

do $$
begin
  if (select count(*) from process_source) <> 2088 then raise exception 'Expected 2088 process rows'; end if;
  if (select count(distinct ingredient_id) from process_source) <> 2088 then raise exception 'Expected 2088 unique process IDs'; end if;
  if (select count(*) from process_source where ingredient_id is null or btrim(ingredient_id) = '') <> 0 then raise exception 'Blank process ingredient ID'; end if;
${statusChecks}
  if exists (
    (select ingredient_id from process_source except select ingredient_id from public.mapper_basement)
    union all
    (select ingredient_id from public.mapper_basement except select ingredient_id from process_source)
  ) then raise exception 'Process IDs do not align 1:1 with Mapper 2088'; end if;
end $$;

alter table public.mapper_process_metadata_imports
  add column if not exists source_columns integer not null default 22 check (source_columns = 22),
  add column if not exists unique_ingredient_ids integer not null default 2088 check (unique_ingredient_ids = 2088),
  add column if not exists blank_ingredient_ids integer not null default 0 check (blank_ingredient_ids = 0);

delete from public.mapper_process_metadata;

insert into public.mapper_process_metadata (
  ingredient_id,
  process_decision,
  reason_type,
  explanation_pl,
  heat_sensitive,
  late_addition_guidance_pl,
  source_label,
  source_reference,
  verification_status,
  dataset_version
)
select
  ingredient_id,
  process_status,
  case
    when process_status = 'HEAT_REQUIRED_FOR_SAFETY' then 'food_safety'
    when process_status = 'HEAT_REQUIRED_FOR_FUNCTION' then 'ingredient_function'
    else 'process_requirement'
  end,
  process_notes,
  lower(coalesce(heat_sensitive, 'false')) = 'true',
  case
    when lower(coalesce(heat_sensitive, 'false')) = 'true'
      then nullif(btrim(heat_sensitivity_notes), '')
    else null
  end,
  'Owner-approved Aug-8 Mapper process workbook',
  coalesce(
    nullif(btrim(process_source_1), ''),
    nullif(btrim(process_source_2), ''),
    'sha256:${PROCESS_DATASET_SHA256}#' || process_rule_id
  ),
  case when process_status = 'UNKNOWN' then 'unknown' else 'verified' end,
  '${PROCESS_DATASET_VERSION}'
from process_source
order by ingredient_id;

insert into public.mapper_process_metadata_imports (
  dataset_version,
  source_sha256,
  source_sheet,
  total_rows,
  cold_process_ok,
  heat_required_for_function,
  heat_required_for_safety,
  heat_required_for_both,
  unknown_count,
  source_columns,
  unique_ingredient_ids,
  blank_ingredient_ids
) values (
  '${PROCESS_DATASET_VERSION}',
  '${PROCESS_DATASET_SHA256}',
  'mapper_process_metadata.csv — approved Aug-8 workbook export',
  2088,
  636,
  56,
  7,
  0,
  1389,
  22,
  2088,
  0
)
on conflict (dataset_version) do update set
  source_sha256 = excluded.source_sha256,
  source_sheet = excluded.source_sheet,
  total_rows = excluded.total_rows,
  cold_process_ok = excluded.cold_process_ok,
  heat_required_for_function = excluded.heat_required_for_function,
  heat_required_for_safety = excluded.heat_required_for_safety,
  heat_required_for_both = excluded.heat_required_for_both,
  unknown_count = excluded.unknown_count,
  source_columns = excluded.source_columns,
  unique_ingredient_ids = excluded.unique_ingredient_ids,
  blank_ingredient_ids = excluded.blank_ingredient_ids,
  imported_at = now();

revoke insert, update, delete, truncate, references, trigger
  on public.mapper_process_metadata from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.mapper_process_metadata_imports from anon, authenticated;

do $$
begin
  if (select count(*) from public.mapper_process_metadata) <> 2088 then raise exception 'Runtime process import is incomplete'; end if;
  if (select count(*) from public.mapper_process_metadata where verification_status = 'unknown') <> 1389 then raise exception 'Runtime UNKNOWN count is incorrect'; end if;
end $$;

comment on table public.mapper_process_metadata is
  'Read-only normalized runtime companion from Owner-approved 22-column Aug-8 process dataset; UNKNOWN remains fail-closed.';

commit;
`;
}

const main = () => {
  const positional = process.argv.slice(2).filter((argument) => argument !== '--check');
  const processPath = resolve(positional[0] ?? 'supabase/seed/mapper_process_metadata.csv');
  const mapperPath = resolve(
    positional[1] ?? 'docs/ingredients/validation/mapper_basement.csv',
  );
  const outputPath = resolve(
    positional[2] ?? 'supabase/migrations/0040_mapper_process_metadata_seed.sql',
  );
  const { rows, manifest } = validateProcessMetadataDataset(processPath, mapperPath);
  if (!process.argv.includes('--check')) {
    writeFileSync(outputPath, buildProcessMetadataMigration(rows), 'utf8');
  }
  console.log(JSON.stringify({ ...manifest, outputPath: process.argv.includes('--check') ? null : outputPath }));
};

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) main();
