/// <reference types="node" />
/**
 * Manual Mapper review actions — security / scope guard.
 *
 * confirmProductMatch / rejectProductMatch record a human decision in the Mapper-result
 * columns ONLY. They must stay narrow: the sole product write is saveProductMapperReview
 * (never updateProduct/insert/upsert/delete, never saveProductMatchResult, never
 * matchAndSaveProduct/import/create — no matching, no batch); no products.status; no
 * pac/pod write; no locked-base read/write; no engine/AI/billing; no raw DB; no auto-run.
 * Static source-text guard (comment-stripped), so the header may document the boundary.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SOURCE = readFileSync(join(SRC, 'services', 'productReview.ts'), 'utf8');
const CODE = stripComments(SOURCE);

describe('productReview — explicit confirm/reject actions', () => {
  it('exports the explicit review actions (confirm / confirm-to-chosen / reject)', () => {
    expect(/export async function confirmProductMatch\(\s*productId: string\s*\)/.test(SOURCE)).toBe(true);
    expect(/export async function confirmProductMatchTo\(\s*productId: string,\s*basementId: string\s*\)/.test(SOURCE)).toBe(true);
    expect(/export async function rejectProductMatch\(\s*productId: string\s*\)/.test(SOURCE)).toBe(true);
  });

  it('confirmProductMatchTo sets matched + the CHOSEN basement id (multi-candidate pick)', () => {
    expect(/matched_basement_id:\s*chosen/.test(CODE)).toBe(true); // the reviewer-picked id, never a guess
  });

  it('writes the product ONLY through the narrow saveProductMapperReview', () => {
    expect(CODE.includes('saveProductMapperReview(')).toBe(true);
    expect(CODE.includes('updateProduct(')).toBe(false);
    expect(CODE.includes('saveProductMatchResult(')).toBe(false);
    expect(CODE.includes('createProduct')).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(CODE.includes(verb), verb).toBe(false);
    }
  });

  it('runs no matching, no batch, no import (it only persists a human decision)', () => {
    expect(/matchAndSaveProduct|matchProduct\(|importProductCatalog|listMyProducts|runMatch/.test(CODE)).toBe(false);
  });

  it('never writes products.status, pac_value, or pod_value', () => {
    expect(/\bstatus\s*:/.test(CODE)).toBe(false); // only mapper_status: appears (no bare status:)
    expect(/pac_value|pod_value/.test(CODE)).toBe(false);
  });

  it('keeps the patch within the Mapper-result domain (typed ProductMapperResultUpdate)', () => {
    expect(CODE.includes('ProductMapperResultUpdate')).toBe(true);
  });

  it('confirm sets matched / manual_mapping / high and clears needs_review_reason', () => {
    expect(/mapper_status:\s*'matched'/.test(CODE)).toBe(true);
    expect(/match_method:\s*'manual_mapping'/.test(CODE)).toBe(true);
    expect(/match_confidence:\s*'high'/.test(CODE)).toBe(true);
    expect(/needs_review_reason:\s*null/.test(CODE)).toBe(true);
  });

  it('reject sets rejected / manual_mapping / rejected and clears matched_basement_id', () => {
    expect(/mapper_status:\s*'rejected'/.test(CODE)).toBe(true);
    expect(/match_confidence:\s*'rejected'/.test(CODE)).toBe(true);
    expect(/matched_basement_id:\s*null/.test(CODE)).toBe(true);
  });

  it('does not touch missing_fields_json or candidate_ids/count (kept as-is)', () => {
    expect(CODE.includes('missing_fields_json')).toBe(false);
    expect(CODE.includes('candidate_ids:')).toBe(false);
    expect(CODE.includes('candidate_count:')).toBe(false);
  });

  it('makes no raw DB / Supabase / privileged access and touches no locked base', () => {
    expect(/supabase/i.test(CODE)).toBe(false);
    expect(/@\/lib\/supabase/.test(CODE)).toBe(false);
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/mapper_basement/i.test(CODE)).toBe(false);
    expect(/npac_value/i.test(CODE)).toBe(false);
  });

  it('imports no engine, AI, or billing, and has no auto-run trigger', () => {
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|background|subscribe)\b/i.test(CODE)).toBe(false);
  });
});
