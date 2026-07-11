/**
 * OCR intake EVIDENCE service (migration 0023) — the ONLY access to the write-once
 * evidence layer: `ocr_extraction_runs` (verbatim OCR runs) and `ocr_field_evidence`
 * (per-field candidates with full provenance).
 *
 * IMMUTABLE BY DESIGN (0023): both tables expose SELECT + INSERT only — no update policy,
 * no delete policy, no update/delete grant, no `updated_at`, no touch trigger. This service
 * therefore exposes NO update/delete/upsert: a re-run or a review decision is a NEW row,
 * never an in-place edit — the original OCR text can never be silently rewritten to match a
 * review outcome.
 *
 * Ownership anchor: these child rows carry NO user_id column — RLS scopes them through the
 * parent session (`session.user_id = auth.uid()`), so every insert stamps `session_id` (the
 * ownership anchor) and never a fabricated owner column. Reads degrade to []; writes throw
 * UNAVAILABLE. No service role, no privileged key.
 *
 * Locked evidence rules enforced here:
 *   • provenance ('explicit' | 'calculated' | 'inferred' | 'absent') is first-class, never
 *     collapsed into the confidence numbers;
 *   • "not detected" is NEVER zero — an 'absent' candidate carries NULL extracted_raw AND
 *     NULL normalized_value (forced defensively below);
 *   • only SUCCESSFUL runs (with verbatim full_text) are recorded; lines/words are NOT
 *     persisted here (they live in the in-memory RawOcrResult only).
 */
import { supabase } from '@/lib/supabase/client';
import type {
  EvidenceProvenance,
  FieldReviewStatus,
  IntakeFieldKey,
  RawOcrResult,
  ReviewedField,
} from '@/features/ocr-intake/intakeContracts';

const RUNS_TABLE = 'ocr_extraction_runs';
const EVIDENCE_TABLE = 'ocr_field_evidence';
const UNAVAILABLE = 'OCR intake is not available in this build.';

/* ── row shapes (mirror the migration columns) ───────────────────────────── */

export interface OcrExtractionRunRow {
  id: string;
  session_id: string;
  image_id: string;
  provider_id: string;
  overall_confidence: number;
  duration_ms: number;
  language_hints: string[];
  full_text: string;
  created_at: string;
}

export interface OcrFieldEvidenceRow {
  id: string;
  session_id: string;
  field_key: IntakeFieldKey;
  candidate_index: number;
  extracted_raw: string | null;
  normalized_value: string | null;
  evidence_image_id: string | null;
  evidence_line_index: number | null;
  source_text: string | null;
  extraction_confidence: number | null;
  normalization_confidence: number | null;
  provenance: EvidenceProvenance;
  review_status: FieldReviewStatus;
  warnings: string[];
  created_at: string;
}

/* ── extraction runs (verbatim OCR) ──────────────────────────────────────── */

/**
 * Record one SUCCESSFUL OCR run's verbatim evidence. `lines`/`words` are deliberately NOT
 * persisted (the verbatim `full_text` is the durable evidence). Insert-only.
 */
export async function recordOcrRun(
  sessionId: string,
  imageId: string,
  run: RawOcrResult,
): Promise<OcrExtractionRunRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .insert({
      session_id: sessionId,
      image_id: imageId,
      provider_id: run.providerId,
      overall_confidence: run.overallConfidence,
      duration_ms: run.durationMs,
      language_hints: run.languageHints,
      full_text: run.fullText,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as OcrExtractionRunRow;
}

/** Every recorded OCR run for a session, oldest first. Read-only. */
export async function listOcrRuns(sessionId: string): Promise<OcrExtractionRunRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OcrExtractionRunRow[];
}

/* ── field evidence (per-field candidates) ───────────────────────────────── */

/** The insert shape for one candidate row (mirrors the grantable 0023 columns). */
export interface OcrFieldEvidenceInsert {
  session_id: string;
  field_key: IntakeFieldKey;
  candidate_index: number;
  extracted_raw: string | null;
  normalized_value: string | null;
  evidence_image_id: string | null;
  evidence_line_index: number | null;
  source_text: string | null;
  extraction_confidence: number | null;
  normalization_confidence: number | null;
  provenance: EvidenceProvenance;
  review_status: FieldReviewStatus;
  warnings: string[];
}

/**
 * Flatten reviewed fields to one evidence row per (field_key, candidate_index). PURE — no
 * IO — so the mapping is unit-testable directly. Rules:
 *   • review_status = the field's reviewStatus for the CHOSEN candidate, else
 *     'needs_confirmation';
 *   • an 'absent' candidate is forced to NULL extracted_raw AND NULL normalized_value
 *     (the 0023 absent_shape CHECK — "not detected" is never a fabricated value);
 *   • when the field was manually edited, an EXTRA candidate row is appended at the next
 *     index carrying the edited value (provenance 'inferred', review_status 'edited').
 */
export function buildEvidenceRows(
  sessionId: string,
  fields: readonly ReviewedField[],
): OcrFieldEvidenceInsert[] {
  const rows: OcrFieldEvidenceInsert[] = [];
  for (const field of fields) {
    field.candidates.forEach((candidate, index) => {
      const absent = candidate.provenance === 'absent';
      const normalized =
        candidate.normalized === null || candidate.normalized === undefined
          ? null
          : String(candidate.normalized);
      rows.push({
        session_id: sessionId,
        field_key: field.fieldKey,
        candidate_index: index,
        extracted_raw: absent ? null : candidate.extractedRaw,
        normalized_value: absent ? null : normalized,
        evidence_image_id: candidate.evidence?.imageId ?? null,
        evidence_line_index: candidate.evidence?.lineIndex ?? null,
        source_text: candidate.evidence?.sourceText ?? null,
        extraction_confidence: candidate.extractionConfidence,
        normalization_confidence: candidate.normalizationConfidence,
        provenance: candidate.provenance,
        review_status: field.chosenCandidate === index ? field.reviewStatus : 'needs_confirmation',
        warnings: candidate.warnings,
      });
    });
    if (field.editedValue !== null && field.editedValue !== undefined) {
      rows.push({
        session_id: sessionId,
        field_key: field.fieldKey,
        candidate_index: field.candidates.length,
        extracted_raw: null,
        normalized_value: String(field.editedValue),
        evidence_image_id: null,
        evidence_line_index: null,
        source_text: null,
        extraction_confidence: null,
        normalization_confidence: null,
        provenance: 'inferred',
        review_status: 'edited',
        warnings: [],
      });
    }
  }
  return rows;
}

/**
 * Persist the reviewed fields as write-once candidate rows (via `buildEvidenceRows`). One
 * bulk INSERT; a no-op (returns []) when there is nothing to record. Insert-only — evidence
 * is never updated or deleted.
 */
export async function saveEvidence(
  sessionId: string,
  fields: readonly ReviewedField[],
): Promise<OcrFieldEvidenceRow[]> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const rows = buildEvidenceRows(sessionId, fields);
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from(EVIDENCE_TABLE).insert(rows).select();
  if (error) throw new Error(error.message);
  return (data ?? []) as OcrFieldEvidenceRow[];
}

/** Every candidate evidence row for a session, by field then candidate index. Read-only. */
export async function listEvidence(sessionId: string): Promise<OcrFieldEvidenceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(EVIDENCE_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('field_key', { ascending: true })
    .order('candidate_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OcrFieldEvidenceRow[];
}
