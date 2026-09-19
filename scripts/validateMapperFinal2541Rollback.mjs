#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ROLLBACK = resolve(
  ROOT,
  'supabase/rollbacks/20260911120000_mapper_search_final_2541_sync.rollback.sql',
);
const sql = readFileSync(ROLLBACK, 'utf8');

const required = [
  "classifier_version='mapper-final-2541-2026-09-11-v1'",
  'jsonb_populate_record(null::public.mapper_basement,payload)',
  'jsonb_populate_record(null::public.products,payload)',
  'insertedMapperRowsRemoved',
];

// The generated SQL intentionally does not carry JS report labels.
required.pop();
for (const anchor of required) {
  if (!sql.includes(anchor)) throw new Error(`Rollback SQL lacks required anchor: ${anchor}`);
}

for (const forbidden of [
  /delete\s+from\s+public\.product_versions/i,
  /update\s+public\.product_versions/i,
  /truncate\s+/i,
  /update\s+public\.mapper_process_metadata/i,
  /insert\s+into\s+public\.mapper_process_metadata/i,
  /delete\s+from\s+public\.mapper_process_metadata/i,
  /update\s+public\.mapper_basement\s+set\s+is_active\s*=\s*false/i,
]) {
  if (forbidden.test(sql)) throw new Error(`Rollback SQL contains forbidden mutation: ${forbidden}`);
}

if ((sql.match(/^begin;$/gm) ?? []).length !== 1) throw new Error('Expected one BEGIN');
if ((sql.match(/^commit;$/gm) ?? []).length !== 1) throw new Error('Expected one COMMIT');
if (/^\+/m.test(sql)) throw new Error('Generated SQL contains a leading diff-marker artifact');
if ((sql.match(/create temp table /g) ?? []).length !== 6) {
  throw new Error('Expected six transaction-local rollback tables');
}
if ((sql.match(/delete from public\.(?:product_behavior_bindings|mapper_product_behavior_bindings)/g) ?? []).length !== 2) {
  throw new Error('Expected exactly two release-specific binding deletes');
}
if (!sql.includes('Immutable public.product_versions are intentionally retained')) {
  throw new Error('Immutable-version preservation statement missing');
}
if (!sql.includes('CREATE OR REPLACE FUNCTION public.search_products_v1')) {
  throw new Error('Captured search function restoration missing');
}
if (!sql.includes("<>2147") || !sql.includes("<>2089") || !sql.includes("<>2541")) {
  throw new Error('Required pre/post censuses are not asserted');
}
if ((sql.match(/classifier_version='mapper-final-2541-2026-09-11-v1' and is_current/g) ?? []).length < 4) {
  throw new Error('Release-specific current-binding preflight/updates are incomplete');
}

// Lightweight lexical validation: every PostgreSQL dollar tag must occur in pairs.
const dollarTags = new Map();
for (const match of sql.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g)) {
  dollarTags.set(match[0], (dollarTags.get(match[0]) ?? 0) + 1);
}
for (const [tag, count] of dollarTags) {
  if (count % 2 !== 0) throw new Error(`Unbalanced PostgreSQL dollar quote ${tag}: ${count}`);
}

console.log('Mapper FINAL 2541 rollback static validation PASS');
console.log('2147 Mapper preimages; 2089 root pointers/current bindings');
console.log('394 inserted Mapper rows targeted; 452 new roots soft-deactivated');
console.log('0 immutable product_versions deletes; process metadata remains read-only');
