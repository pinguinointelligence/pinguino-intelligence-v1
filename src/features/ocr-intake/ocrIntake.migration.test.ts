/// <reference types="node" />
/**
 * OCR intake migration guards (Track I — migrations 0022–0024).
 *
 * Locks the file-first intake persistence spine: every table exists with RLS
 * enabled; the CHECK vocabularies are in LOCKSTEP with the shared contract
 * unions in intakeContracts.ts (the vocab objects below are typed
 * Record<Union, true>, so adding/removing a union member without updating the
 * SQL — or vice versa — fails at compile time AND at test time); evidence and
 * run rows are write-once (zero client update/delete grants or policies); the
 * uniqueness spine (checksum, display order, field candidate) holds; and the
 * storage bucket is private, owner-path-scoped, with mime/size caps matching
 * the image table CHECKs exactly.
 *
 * CRLF-safe ON PURPOSE: files are normalized to LF before any regexing so a
 * Windows checkout (core.autocrlf=true) can never make `/--.*$/` miss the
 * `\r` and leak comment text into the executable scan (the 0001–0013 lesson).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  AcceptedMime,
  EvidenceProvenance,
  FieldReviewStatus,
  IntakeFieldKey,
  IntakeImageRole,
  IntakeImageState,
  IntakeSessionState,
} from './intakeContracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');

/** Read a migration and normalize CR/CRLF to LF (CRLF-safe parsing). */
const readSql = (file: string): string =>
  readFileSync(join(REPO, 'supabase', 'migrations', file), 'utf8').replace(/\r\n?/g, '\n');

/** The SQL with every line comment (-- … end of line) removed. */
const executable = (sql: string): string =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

/** Executable SQL flattened to single spaces (multi-line clause matching). */
const flat = (sql: string): string => executable(sql).replace(/\s+/g, ' ');

const FILES = [
  '0022_ocr_intake_sessions.sql',
  '0023_ocr_extraction_evidence.sql',
  '0024_ocr_intake_storage.sql',
] as const;

const SQL = new Map<string, string>(FILES.map((f) => [f, readSql(f)]));
const sqlOf = (file: string): string => {
  const sql = SQL.get(file);
  if (sql === undefined) throw new Error(`unknown migration file: ${file}`);
  return sql;
};
const ALL = FILES.map(sqlOf).join('\n');
const ALL_EXEC = executable(ALL);
const ALL_FLAT = flat(ALL);

/** The flattened executable DDL of one table (up to the next create table). */
const tableBlock = (file: string, table: string): string => {
  const f = flat(sqlOf(file));
  const marker = `create table if not exists public.${table} (`;
  const start = f.indexOf(marker);
  if (start === -1) throw new Error(`table not found in ${file}: ${table}`);
  const rest = f.slice(start + marker.length);
  const next = rest.indexOf('create table if not exists');
  return next === -1 ? rest : rest.slice(0, next);
};

/** Extract the quoted literals of a `check (col in ('a', 'b', …))` clause. */
const checkVocab = (block: string, column: string): string[] => {
  const m = block.match(new RegExp(`check \\(${column} in \\(([^)]*)\\)`));
  if (!m?.[1]) throw new Error(`no check in-list for column: ${column}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]!);
};

/**
 * Contract lockstep: each vocab is typed Record<ContractUnion, true> — a
 * missing member OR an invented member is a TypeScript error, so the arrays
 * below can never drift from intakeContracts.ts silently.
 */
const vocab = <T extends string>(record: Record<T, true>): string[] =>
  Object.keys(record).sort();

const SESSION_STATES = vocab<IntakeSessionState>({
  collecting_images: true,
  extracting: true,
  review: true,
  ready_to_save: true,
  saving: true,
  saved: true,
  duplicate_blocked: true,
  cancelled: true,
  failed: true,
});

const IMAGE_ROLES = vocab<IntakeImageRole>({
  front: true,
  back: true,
  nutrition_table: true,
  ingredients: true,
  barcode: true,
  claims_allergens: true,
  other: true,
});

const IMAGE_STATES = vocab<IntakeImageState>({
  uploaded: true,
  analysing: true,
  needs_review: true,
  ready: true,
  failed: true,
});

const ACCEPTED_MIMES = vocab<AcceptedMime>({
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
});

const PROVENANCES = vocab<EvidenceProvenance>({
  explicit: true,
  calculated: true,
  inferred: true,
  absent: true,
});

const REVIEW_STATUSES = vocab<FieldReviewStatus>({
  auto_accepted: true,
  needs_confirmation: true,
  confirmed: true,
  edited: true,
  marked_unknown: true,
  conflict_unresolved: true,
});

const FIELD_KEYS = vocab<IntakeFieldKey>({
  product_name: true,
  brand: true,
  package_size: true,
  package_unit: true,
  ean_code: true,
  country: true,
  supplier: true,
  category: true,
  subcategory: true,
  nutrition_basis: true,
  energy_kcal: true,
  energy_kj: true,
  fat: true,
  saturated_fat: true,
  carbohydrate: true,
  sugars: true,
  protein: true,
  salt: true,
  sodium: true,
  fibre: true,
  ingredients_text: true,
  allergens_text: true,
  may_contain_text: true,
  claim_vegan: true,
  claim_vegetarian: true,
  claim_gluten_free: true,
  claim_lactose_free: true,
  claims_other: true,
});

const TABLES_BY_FILE: Record<string, string[]> = {
  '0022_ocr_intake_sessions.sql': [
    'ocr_intake_batches',
    'ocr_intake_sessions',
    'ocr_intake_images',
  ],
  '0023_ocr_extraction_evidence.sql': ['ocr_extraction_runs', 'ocr_field_evidence'],
};

describe('CRLF safety of this guard itself', () => {
  it('normalizes CRLF/CR before comment-stripping (no \\r can hide executable text)', () => {
    const crlf = '-- comment\r\ncreate table x;\r-- tail';
    const normalized = crlf.replace(/\r\n?/g, '\n');
    expect(normalized).not.toContain('\r');
    expect(executable(normalized)).toContain('create table x;');
    expect(executable(normalized)).not.toContain('comment');
  });

  it('the loaded migrations contain no carriage returns after normalization', () => {
    expect(ALL.includes('\r')).toBe(false);
  });
});

describe('intake tables exist with RLS enabled', () => {
  for (const [file, tables] of Object.entries(TABLES_BY_FILE)) {
    for (const table of tables) {
      it(`${file} creates public.${table} with RLS enabled`, () => {
        const sql = sqlOf(file);
        expect(sql.includes(`create table if not exists public.${table} (`)).toBe(true);
        expect(sql.includes(`alter table public.${table} enable row level security`)).toBe(true);
      });
    }
  }

  it('creates exactly the 5 intake tables and enables RLS exactly as many times', () => {
    const expected = Object.values(TABLES_BY_FILE).flat().length;
    expect(expected).toBe(5);
    const created = (ALL_EXEC.match(/create table if not exists public\./g) ?? []).length;
    const rlsEnabled = (ALL_EXEC.match(/enable row level security/g) ?? []).length;
    expect(created).toBe(expected);
    expect(rlsEnabled).toBe(expected);
  });
});

describe('contract lockstep — CHECK vocabularies match intakeContracts.ts EXACTLY', () => {
  const sessions = tableBlock('0022_ocr_intake_sessions.sql', 'ocr_intake_sessions');
  const images = tableBlock('0022_ocr_intake_sessions.sql', 'ocr_intake_images');
  const evidence = tableBlock('0023_ocr_extraction_evidence.sql', 'ocr_field_evidence');

  it('ocr_intake_sessions.state = IntakeSessionState (9 states)', () => {
    expect(checkVocab(sessions, 'state').sort()).toEqual(SESSION_STATES);
    expect(SESSION_STATES).toHaveLength(9);
  });

  it('ocr_intake_images.role = IntakeImageRole (7 roles)', () => {
    expect(checkVocab(images, 'role').sort()).toEqual(IMAGE_ROLES);
    expect(IMAGE_ROLES).toHaveLength(7);
  });

  it('ocr_intake_images.state = IntakeImageState (5 states)', () => {
    expect(checkVocab(images, 'state').sort()).toEqual(IMAGE_STATES);
    expect(IMAGE_STATES).toHaveLength(5);
  });

  it('ocr_intake_images.mime = AcceptedMime (png/jpeg/webp — no HEIC in the DB, ever)', () => {
    expect(checkVocab(images, 'mime').sort()).toEqual(ACCEPTED_MIMES);
    expect(ACCEPTED_MIMES).toHaveLength(3);
  });

  it('ocr_field_evidence.field_key = IntakeFieldKey (all 28 contract fields)', () => {
    expect(checkVocab(evidence, 'field_key').sort()).toEqual(FIELD_KEYS);
    expect(FIELD_KEYS).toHaveLength(28);
  });

  it('ocr_field_evidence.provenance = EvidenceProvenance (never collapsed)', () => {
    expect(checkVocab(evidence, 'provenance').sort()).toEqual(PROVENANCES);
    expect(PROVENANCES).toHaveLength(4);
  });

  it('ocr_field_evidence.review_status = FieldReviewStatus (6 statuses)', () => {
    expect(checkVocab(evidence, 'review_status').sort()).toEqual(REVIEW_STATUSES);
    expect(REVIEW_STATUSES).toHaveLength(6);
  });
});

describe('uniqueness spine', () => {
  it('duplicate-upload guard: unique (session_id, checksum_sha256) on images', () => {
    expect(ALL_FLAT).toContain(
      'constraint ocr_intake_images_checksum_uniq unique (session_id, checksum_sha256)',
    );
  });

  it('ordering spine: unique (session_id, display_order), DEFERRABLE for reorders', () => {
    expect(ALL_FLAT).toContain(
      'constraint ocr_intake_images_order_uniq unique (session_id, display_order) deferrable initially immediate',
    );
  });

  it('candidate spine: unique (session_id, field_key, candidate_index) on evidence', () => {
    expect(ALL_FLAT).toContain(
      'constraint ocr_field_evidence_candidate_uniq unique (session_id, field_key, candidate_index)',
    );
  });

  it('checksum is pinned to SHA-256 hex shape', () => {
    expect(ALL_FLAT).toContain("checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$')");
  });
});

describe('evidence integrity — write-once, provenance-honest', () => {
  it('runs + evidence have ZERO client update/delete grants (write-once at the grant layer)', () => {
    expect(
      /grant\s+[^;]*\b(update|delete|all|truncate)\b[^;]*on\s+(table\s+)?public\.(ocr_extraction_runs|ocr_field_evidence)/i.test(
        ALL_EXEC,
      ),
    ).toBe(false);
  });

  it('runs + evidence have ONLY select/insert policies (write-once at the policy layer)', () => {
    const policies = (ALL_EXEC.match(/create policy[^;]+;/g) ?? []).filter((p) =>
      /on public\.(ocr_extraction_runs|ocr_field_evidence)/.test(p),
    );
    expect(policies).toHaveLength(4);
    for (const policy of policies) {
      expect(/for\s+(select|insert)\b/i.test(policy), policy).toBe(true);
      expect(/for\s+(update|delete|all)\b/i.test(policy), policy).toBe(false);
    }
  });

  it('runs + evidence are immutable shapes: no updated_at column, no touch trigger', () => {
    const runs = tableBlock('0023_ocr_extraction_evidence.sql', 'ocr_extraction_runs');
    const runsColumns = runs.slice(0, runs.indexOf('create index'));
    expect(runsColumns.includes('updated_at')).toBe(false);
    const evidence = tableBlock('0023_ocr_extraction_evidence.sql', 'ocr_field_evidence');
    const evidenceColumns = evidence.slice(0, evidence.indexOf('create index'));
    expect(evidenceColumns.includes('updated_at')).toBe(false);
    expect(/create trigger ocr_extraction_runs_touch/i.test(ALL_EXEC)).toBe(false);
    expect(/create trigger ocr_field_evidence_touch/i.test(ALL_EXEC)).toBe(false);
  });

  it('the original OCR text is required evidence (full_text not null) with provider + timing', () => {
    const runs = tableBlock('0023_ocr_extraction_evidence.sql', 'ocr_extraction_runs');
    expect(runs).toContain('full_text text not null');
    expect(runs).toContain('provider_id text not null');
    expect(runs).toContain('duration_ms integer not null check (duration_ms >= 0)');
    expect(runs).toContain(
      'overall_confidence integer not null check (overall_confidence >= 0 and overall_confidence <= 100)',
    );
  });

  it('absent is NEVER a value: absent evidence must carry NULL raw + normalized', () => {
    expect(ALL_FLAT).toContain(
      "constraint ocr_field_evidence_absent_shape check (provenance <> 'absent' or (extracted_raw is null and normalized_value is null))",
    );
  });

  it('confidence is SPLIT (extraction vs normalization), both bounded 0..100, both nullable', () => {
    const evidence = tableBlock('0023_ocr_extraction_evidence.sql', 'ocr_field_evidence');
    expect(evidence).toContain(
      'extraction_confidence integer check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 100))',
    );
    expect(evidence).toContain(
      'normalization_confidence integer check (normalization_confidence is null or (normalization_confidence >= 0 and normalization_confidence <= 100))',
    );
  });
});

describe('session/image writes — owner-scoped rows, column-scoped updates', () => {
  it('sessions: the client update grant covers ONLY state/manual_ean/batch_id/timestamps', () => {
    const m = ALL_FLAT.match(/grant update \(([^)]*)\) on public\.ocr_intake_sessions to authenticated/);
    expect(m?.[1]).toBeDefined();
    const columns = (m?.[1] ?? '').split(',').map((c) => c.trim()).sort();
    expect(columns).toEqual(['batch_id', 'cancelled_at', 'manual_ean', 'saved_at', 'state']);
  });

  it('sessions: saved_product_id and user_id are NEVER client-writable (server-only link)', () => {
    const updateGrants = ALL_FLAT.match(/grant update \([^)]*\)/g) ?? [];
    expect(updateGrants.length).toBeGreaterThan(0);
    for (const grant of updateGrants) {
      expect(grant.includes('saved_product_id'), grant).toBe(false);
      expect(grant.includes('user_id'), grant).toBe(false);
    }
  });

  it('images: the client update grant covers ONLY role/display_order/state/failure — file identity is immutable', () => {
    const m = ALL_FLAT.match(/grant update \(([^)]*)\) on public\.ocr_intake_images to authenticated/);
    expect(m?.[1]).toBeDefined();
    const columns = (m?.[1] ?? '').split(',').map((c) => c.trim()).sort();
    expect(columns).toEqual(['display_order', 'failure', 'role', 'state']);
    for (const frozen of ['file_name', 'mime', 'byte_size', 'checksum_sha256', 'width', 'height']) {
      expect(columns.includes(frozen), frozen).toBe(false);
    }
  });

  it('every intake policy is owner-scoped via auth.uid() (direct or through the session)', () => {
    const policies: string[] = [
      ...(executable(sqlOf('0022_ocr_intake_sessions.sql')).match(/create policy[^;]+;/g) ?? []),
      ...(executable(sqlOf('0023_ocr_extraction_evidence.sql')).match(/create policy[^;]+;/g) ?? []),
    ];
    expect(policies).toHaveLength(15);
    for (const policy of policies) {
      expect(policy.includes('auth.uid()'), policy).toBe(true);
    }
  });

  it('grants nothing to anon at all (demo sessions never touch intake data)', () => {
    expect(/grant[^;]*to\s+anon\b/i.test(ALL_EXEC)).toBe(false);
  });

  it('executable SQL never references a privileged role (no service_role dependency)', () => {
    expect(/service[_-]?role/i.test(ALL_EXEC)).toBe(false);
  });

  it('sessions cascade from the auth user (intake is user working data, not financial history)', () => {
    const sessions = tableBlock('0022_ocr_intake_sessions.sql', 'ocr_intake_sessions');
    expect(sessions).toContain('user_id uuid not null references auth.users (id) on delete cascade');
  });

  it('saved_product_id is a SOFT text link — no FK into public.products anywhere', () => {
    const sessions = tableBlock('0022_ocr_intake_sessions.sql', 'ocr_intake_sessions');
    expect(sessions).toContain('saved_product_id text');
    expect(/saved_product_id[^,]*references/i.test(sessions)).toBe(false);
    expect(/references\s+public\.products\b/i.test(ALL_EXEC)).toBe(false);
  });

  it('manual EAN is digits-only when present (8–14, leading zeros preserved as text)', () => {
    expect(ALL_FLAT).toContain("check (manual_ean is null or manual_ean ~ '^[0-9]{8,14}$')");
  });

  it('terminal session states must carry their timestamps', () => {
    expect(ALL_FLAT).toContain("check (state <> 'saved' or saved_at is not null)");
    expect(ALL_FLAT).toContain("check (state <> 'cancelled' or cancelled_at is not null)");
  });

  it('a failed image must say why', () => {
    expect(ALL_FLAT).toContain("check (state <> 'failed' or failure is not null)");
  });

  it('batches carry NO stored outcome counters — the sessions are the truth', () => {
    const batches = tableBlock('0022_ocr_intake_sessions.sql', 'ocr_intake_batches');
    const columns = batches.slice(0, batches.indexOf('create index'));
    for (const drift of ['saved_count', 'failed_count', 'processed', 'outcome']) {
      expect(columns.includes(drift), drift).toBe(false);
    }
  });
});

describe('storage — private bucket, owner-path policies, honest caps', () => {
  const storage = sqlOf('0024_ocr_intake_storage.sql');
  const storageFlat = flat(storage);

  it('seeds the product-intake-images bucket PRIVATE with exact caps, idempotently', () => {
    expect(storageFlat).toContain('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)');
    expect(storageFlat).toContain(
      "values ( 'product-intake-images', 'product-intake-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'] )",
    );
    expect(storageFlat).toContain('on conflict (id) do nothing');
  });

  it('bucket mime allowlist = the contract AcceptedMime vocabulary exactly', () => {
    const m = storageFlat.match(/array\[([^\]]*)\]/);
    expect(m?.[1]).toBeDefined();
    const mimes = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(mimes).toEqual(ACCEPTED_MIMES);
  });

  it('bucket file_size_limit equals the image-table byte_size cap (single source of truth)', () => {
    const bucketLimit = storageFlat.match(/false, (\d+), array\[/)?.[1];
    const columnCap = flat(sqlOf('0022_ocr_intake_sessions.sql')).match(/byte_size > 0 and byte_size <= (\d+)/)?.[1];
    expect(bucketLimit).toBeDefined();
    expect(bucketLimit).toBe(columnCap);
  });

  it('exactly 3 owner-path policies (insert/select/delete) — and NO update policy', () => {
    const policies = executable(storage).match(/create policy[^;]+;/g) ?? [];
    expect(policies).toHaveLength(3);
    const kinds = policies.map((p) => p.match(/for\s+(\w+)/i)?.[1]?.toLowerCase()).sort();
    expect(kinds).toEqual(['delete', 'insert', 'select']);
  });

  it('every storage policy is authenticated-only and pinned to bucket + owner folder', () => {
    const policies = executable(storage).match(/create policy[^;]+;/g) ?? [];
    for (const policy of policies) {
      const p = policy.replace(/\s+/g, ' ');
      expect(p.includes('on storage.objects'), p).toBe(true);
      expect(p.includes('to authenticated'), p).toBe(true);
      expect(p.includes("bucket_id = 'product-intake-images'"), p).toBe(true);
      expect(p.includes("(storage.foldername(name))[1] = auth.uid()::text"), p).toBe(true);
    }
  });

  it('no public read, no anon policy — access is via owner-created signed URLs only', () => {
    const exec = executable(storage);
    expect(/to\s+anon\b/i.test(exec)).toBe(false);
    expect(/to\s+public\b/i.test(exec)).toBe(false);
    expect(/\bgrant\b/i.test(exec)).toBe(false);
  });
});

describe('additive + in-bounds', () => {
  it('never drops a table, never truncates, never deletes rows', () => {
    expect(/drop\s+table/i.test(ALL_EXEC)).toBe(false);
    expect(/\btruncate\b/i.test(ALL_EXEC)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(ALL_EXEC)).toBe(false);
  });

  it('never alters the locked 0001–0021 tables', () => {
    for (const locked of [
      'public.products',
      'public.mapper_basement',
      'public.ingredients',
      'public.saved_recipes',
      'public.accepted_corrections',
      'public.subscriptions',
      'public.billing_price_catalog',
      'public.customer_subscriptions',
      'public.entitlements',
    ]) {
      expect(
        new RegExp(`alter\\s+table\\s+${locked.replace('.', '\\.')}\\b`, 'i').test(ALL_EXEC),
        locked,
      ).toBe(false);
    }
  });

  it('the ONLY DML is the storage bucket seed (no data invention)', () => {
    const inserts = ALL_EXEC.match(/insert\s+into\s+[\w.]+/gi) ?? [];
    expect(inserts).toEqual(['insert into storage.buckets']);
  });

  it('never touches PAC/POD or engine value columns', () => {
    expect(/pac_value|pod_value|npac/i.test(ALL_EXEC)).toBe(false);
  });
});
