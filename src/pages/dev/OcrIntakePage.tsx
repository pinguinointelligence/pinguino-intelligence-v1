/**
 * DEV-ONLY label-OCR intake page (route: /dev/ocr-intake).
 *
 * TWO surfaces on one page:
 *  1. QUICK PATH (the original single-image flow, unchanged): choose a label
 *     image → the keyless LOCAL engine (tesseract.js WASM, in this browser tab
 *     — the image never leaves the machine) → deterministic parser → per-field
 *     review with OCR confidence → explicit confirmation → the EXISTING local
 *     product-intake draft (ProductIntakeCandidate, source_type 'label_scan'),
 *     displayed only.
 *  2. FULL SESSION (contract panels): multi-image intake with roles, drag &
 *     drop, camera capture, manual EAN, per-field evidence review with
 *     provenance + split confidences, duplicate assessment and a batch link.
 *     The panels are pure presentation over the shared intake contract; real
 *     extraction/session logic injects through IntakeWiring — until then the
 *     section runs on clearly-labelled SAMPLE data (nothing extracted,
 *     nothing uploaded, nothing saved).
 *
 * Boundaries (OcrIntakePage.test.tsx): DEV-only; NO service import, NO DB write, NO
 * auto-save — the draft is local. Saving stays with the existing reviewed import path.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ocrCopy } from '@/features/ocr-intake/ocrCopy';
import {
  downscaleImageIfNeeded,
  startLabelOcr,
  validateLabelImage,
  type OcrJob,
  type OcrProgress,
  type OcrRunResult,
} from '@/features/ocr-intake/ocrEngine';
import { parseLabelText, type NutritionBasis } from '@/features/ocr-intake/labelTextParser';
import {
  buildDraftCandidate,
  buildReviewState,
  canConfirmReview,
  confirmField,
  editField,
  effectiveBasis,
  setBasisOverride,
  unconfirmedRequiredFields,
  type OcrReviewState,
} from '@/features/ocr-intake/reviewState';
import type {
  DuplicateAssessment,
  OcrProvider,
  ProductIntakeSession,
  RawOcrResult,
  ReviewedField,
} from '@/features/ocr-intake/intakeContracts';
import { BarcodeEntry } from '@/features/ocr-intake/ui/BarcodeEntry';
import { DuplicatePanel } from '@/features/ocr-intake/ui/DuplicatePanel';
import { EvidenceReviewPanel } from '@/features/ocr-intake/ui/EvidenceReviewPanel';
import { MultiImagePanel } from '@/features/ocr-intake/ui/MultiImagePanel';
import { describeUnsupportedFile, isAcceptedMime } from '@/features/ocr-intake/ui/intakeUiSupport';
import {
  applyLocalIntakeEvent,
  createDemoIntakeSession,
  type IncomingImageFile,
  type IntakeSessionEvent,
} from '@/features/ocr-intake/ui/demoSession';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

/**
 * The injection seam for the full-session experience — function types built
 * ONLY from the shared contract. The orchestrator wires the real modules at
 * integration; every member is null until then and the section runs on the
 * standalone in-memory fallback.
 */
export interface IntakeWiring {
  /** INTEGRATION POINT (track G): the real OCR provider (tesseract adapter). */
  runOcr: OcrProvider['recognize'] | null;
  /** INTEGRATION POINT (track G): deterministic evidence extraction over raw runs. */
  extractEvidence: ((runs: RawOcrResult[]) => ReviewedField[]) | null;
  /** INTEGRATION POINT (track H): the real session reducer (same event vocabulary). */
  reduceSession:
    | ((session: ProductIntakeSession, event: IntakeSessionEvent) => ProductIntakeSession)
    | null;
  /** INTEGRATION POINT (track H): duplicate assessment against the catalog. */
  assessDuplicate: ((session: ProductIntakeSession) => Promise<DuplicateAssessment>) | null;
}

const UNWIRED: IntakeWiring = {
  runOcr: null,
  extractEvidence: null,
  reduceSession: null,
  assessDuplicate: null,
};

const BASIS_OPTIONS: NutritionBasis[] = ['per_100g', 'per_100ml', 'serving_only', 'unknown'];

function BandBadge({ band, confidence }: { band: 'high' | 'medium' | 'low' | null; confidence: number | null }) {
  const cls =
    band === 'high'
      ? 'bg-emerald-100 text-emerald-700'
      : band === 'medium'
        ? 'bg-amber-100 text-amber-700'
        : band === 'low'
          ? 'bg-red-100 text-red-700'
          : 'bg-stone-100 text-stone-500';
  const label = band ?? ocrCopy.review.bandUnknown;
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${cls}`}>
      {label}
      {confidence !== null ? ` · ${confidence}%` : ''}
    </span>
  );
}

export function OcrIntakePage({ wiring = UNWIRED }: { wiring?: IntakeWiring } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<OcrRunResult | null>(null);
  const [review, setReview] = useState<OcrReviewState | null>(null);
  const [draft, setDraft] = useState<ProductIntakeCandidate | null>(null);
  const jobRef = useRef<OcrJob | null>(null);
  // full-session state (SAMPLE data until the real modules are wired)
  const [session, setSession] = useState<ProductIntakeSession>(createDemoIntakeSession);
  const [rejectionNotice, setRejectionNotice] = useState<string | null>(null);

  // object URL lifecycle for the image preview (local only — never uploaded):
  // the URL is created on file choice; this cleanup revokes the previous one.
  useEffect(() => {
    if (!imageUrl) return undefined;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => () => jobRef.current?.cancel(), []);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const chooseFile = (chosen: File | null) => {
    jobRef.current?.cancel();
    setResult(null);
    setReview(null);
    setDraft(null);
    setProgress(null);
    setRunning(false);
    if (!chosen) {
      setFile(null);
      setImageUrl(null);
      setInputError(null);
      return;
    }
    const validation = validateLabelImage({
      filename: chosen.name,
      mime: chosen.type || null,
      sizeBytes: chosen.size,
    });
    if (!validation.ok) {
      setFile(null);
      setImageUrl(null);
      setInputError(validation.reason);
      return;
    }
    setInputError(null);
    setFile(chosen);
    setImageUrl(URL.createObjectURL(chosen));
  };

  const runOcr = async () => {
    if (!file || running) return;
    setRunning(true);
    setResult(null);
    setReview(null);
    setDraft(null);
    const prepared = await downscaleImageIfNeeded(file);
    const job = startLabelOcr(prepared, { onProgress: setProgress });
    jobRef.current = job;
    const outcome = await job.done;
    jobRef.current = null;
    setRunning(false);
    setResult(outcome);
    if (outcome.status === 'ok') {
      setReview(buildReviewState(parseLabelText(outcome.lines), outcome.text, outcome.overallConfidence));
    }
  };

  const onConfirmReview = () => {
    if (!review) return;
    const built = buildDraftCandidate(review);
    if (built.ok) setDraft(built.candidate);
  };

  const pending = review ? unconfirmedRequiredFields(review) : [];

  /* ── full-session wiring (contract events; in-memory fallback until wired) ── */

  const dispatch = (event: IntakeSessionEvent) =>
    setSession((prev) => (wiring.reduceSession ?? applyLocalIntakeEvent)(prev, event));

  // Honest format gate: HEIC/HEIF and other non-contract formats are rejected
  // with an explicit message; only png/jpeg/webp continue.
  // INTEGRATION POINT (track G): the accepted Files' BYTES feed wiring.runOcr /
  // wiring.extractEvidence and the real SHA-256 checksum at integration — the
  // standalone fallback keeps metadata only and marks checksums as pending.
  const acceptFiles = (files: File[]): IncomingImageFile[] => {
    const notices = files
      .map((f) => describeUnsupportedFile(f.name, f.type || null))
      .filter((notice): notice is string => notice !== null);
    setRejectionNotice(notices[0] ?? null);
    const accepted: IncomingImageFile[] = [];
    for (const f of files) {
      if (describeUnsupportedFile(f.name, f.type || null) === null && isAcceptedMime(f.type)) {
        accepted.push({ fileName: f.name, mime: f.type, byteSize: f.size });
      }
    }
    return accepted;
  };

  const recheckDuplicate = async () => {
    if (!wiring.assessDuplicate) return;
    const duplicate = await wiring.assessDuplicate(session);
    setSession((prev) => ({ ...prev, duplicate }));
  };

  const engineWired = wiring.runOcr !== null && wiring.extractEvidence !== null;

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">{ocrCopy.page.devTag}</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">{ocrCopy.page.title}</h1>
      <p className="mt-2 text-sm text-stone-600">{ocrCopy.page.intro}</p>
      <p className="mt-2 text-xs text-stone-500">{ocrCopy.page.privacyNote}</p>

      {/* image input */}
      <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
        <h2 className="font-medium">{ocrCopy.input.chooseImage}</h2>
        <p className="mt-1 text-xs text-stone-500">{ocrCopy.input.accepted}</p>
        <input
          type="file"
          aria-label={ocrCopy.input.chooseImage}
          accept="image/png,image/jpeg,image/webp"
          className="mt-2 block w-full text-xs"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
        />
        {inputError ? <p className="mt-2 text-xs text-red-700">{inputError}</p> : null}
        {file ? (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className="rounded bg-ink px-3 py-1.5 font-mono text-xs text-paper disabled:opacity-40"
              disabled={running}
              onClick={() => void runOcr()}
            >
              {running ? ocrCopy.input.running : ocrCopy.input.runOcr}
            </button>
            {running ? (
              <button
                type="button"
                className="rounded border border-stone-300 px-3 py-1.5 font-mono text-xs text-stone-600"
                onClick={() => jobRef.current?.cancel()}
              >
                {ocrCopy.input.cancel}
              </button>
            ) : null}
            {progress && running ? (
              <span className="font-mono text-xs text-stone-500">
                {progress.status} · {Math.round(progress.progress * 100)}%
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* failure */}
      {result && result.status === 'failed' ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-mono text-xs uppercase">{result.reason.replace(/_/g, ' ')}</p>
          <p className="mt-1">
            {result.reason === 'unreadable_image'
              ? ocrCopy.failure.unreadable
              : result.reason === 'cancelled'
                ? ocrCopy.failure.cancelled
                : `${ocrCopy.failure.engineError} ${result.message}`}
          </p>
          {result.reason !== 'cancelled' ? (
            <button
              type="button"
              className="mt-2 rounded border border-red-300 px-3 py-1 font-mono text-xs"
              onClick={() => void runOcr()}
            >
              {ocrCopy.input.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* review */}
      {review && result?.status === 'ok' ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-stone-200 bg-white px-4 py-3">
              <h2 className="text-sm font-medium">{ocrCopy.review.imageTitle}</h2>
              {imageUrl ? (
                <img src={imageUrl} alt={file?.name ?? 'label'} className="mt-2 max-h-80 w-full rounded object-contain" />
              ) : null}
            </div>
            <div className="rounded-md border border-stone-200 bg-white px-4 py-3">
              <h2 className="text-sm font-medium">{ocrCopy.review.rawTextTitle}</h2>
              <p className="mt-1 font-mono text-xs text-stone-500">
                {ocrCopy.review.confidence}: {result.overallConfidence}% · {result.durationMs} ms
              </p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 font-mono text-xs text-stone-700">
                {result.text}
              </pre>
            </div>
          </div>

          <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">{ocrCopy.review.title}</h2>
              <span className="font-mono text-xs text-stone-500">
                {ocrCopy.review.languageLabel}: {review.languageHint}
              </span>
            </div>

            <label className="mt-2 block text-xs text-stone-600">
              {ocrCopy.review.basisLabel} ({ocrCopy.basis[review.detectedBasis]} detected)
              <select
                className="ml-2 rounded border border-stone-200 px-2 py-1 font-mono text-xs"
                value={effectiveBasis(review)}
                onChange={(e) => setReview(setBasisOverride(review, e.target.value as NutritionBasis))}
              >
                {BASIS_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {ocrCopy.basis[b]}
                  </option>
                ))}
              </select>
            </label>

            {review.globalWarnings.length > 0 ? (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium">{ocrCopy.review.globalWarningsTitle}</p>
                <ul className="mt-1 list-disc pl-4">
                  {review.globalWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {review.fields.map((f) => (
                <div key={f.key} className="rounded border border-stone-100 bg-stone-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-stone-700">{ocrCopy.fields[f.key]}</span>
                    <span className="flex items-center gap-2">
                      <BandBadge band={f.band} confidence={f.ocrConfidence} />
                      {f.requiresConfirmation ? (
                        f.confirmed ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700">
                            {ocrCopy.review.confirmed}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600"
                            onClick={() => setReview(confirmField(review, f.key))}
                          >
                            {ocrCopy.review.confirm}
                          </button>
                        )
                      ) : null}
                    </span>
                  </div>
                  <input
                    aria-label={ocrCopy.fields[f.key]}
                    className="mt-1.5 w-full rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs"
                    value={f.editedValue}
                    placeholder={ocrCopy.review.notFound}
                    onChange={(e) => setReview(editField(review, f.key, e.target.value))}
                  />
                  {f.warnings.length > 0 ? (
                    <ul className="mt-1 list-disc pl-4 text-xs text-amber-700">
                      {f.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {f.sourceLines.length > 0 ? (
                    <p className="mt-1 font-mono text-xs text-stone-400">OCR: {f.sourceLines.join(' ⏎ ')}</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="rounded bg-ink px-3 py-1.5 font-mono text-xs text-paper disabled:opacity-40"
                disabled={!canConfirmReview(review)}
                onClick={onConfirmReview}
              >
                {ocrCopy.handoff.buildDraft}
              </button>
              {!canConfirmReview(review) ? (
                <span className="text-xs text-stone-500">
                  {ocrCopy.handoff.blocked} ({pending.length}: {pending.map((k) => ocrCopy.fields[k]).join(', ')})
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* local draft — displayed only, never saved */}
      {draft ? (
        <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
          <h2 className="font-medium">{ocrCopy.handoff.draftTitle}</h2>
          <p className="mt-1 text-xs text-stone-500">{ocrCopy.handoff.draftNote}</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 font-mono text-xs text-stone-700">
            {JSON.stringify(draft, null, 2)}
          </pre>
        </div>
      ) : null}

      {/* ── full multi-image session (contract panels over injected wiring) ── */}
      <div className="mt-10 border-t border-stone-300 pt-8">
        <h2 className="text-xl font-light tracking-tight">{ocrCopy.session.title}</h2>
        <p className="mt-1 text-sm text-stone-600">{ocrCopy.session.intro}</p>
        {!engineWired ? (
          <p
            role="status"
            className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {ocrCopy.session.demoNote}
          </p>
        ) : null}
        <p className="mt-2 font-mono text-xs text-stone-500">
          {ocrCopy.session.stateLabel}: {session.state} ·{' '}
          {engineWired ? ocrCopy.session.engineWired : ocrCopy.session.engineNotWired}
        </p>
        {session.warnings.length > 0 ? (
          <ul className="mt-1 list-disc pl-4 text-xs text-amber-700">
            {session.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 space-y-4">
          <MultiImagePanel
            images={session.images}
            rejectionNotice={rejectionNotice}
            onAddFiles={(files) => dispatch({ type: 'add_images', files: acceptFiles(files) })}
            onRoleChange={(imageId, role) => dispatch({ type: 'set_image_role', imageId, role })}
            onMove={(imageId, direction) => dispatch({ type: 'move_image', imageId, direction })}
            onReplace={(imageId, replacement) => {
              const [accepted] = acceptFiles([replacement]);
              if (accepted) dispatch({ type: 'replace_image', imageId, file: accepted });
            }}
            onRemove={(imageId) => dispatch({ type: 'remove_image', imageId })}
            onRetry={(imageId) => dispatch({ type: 'retry_image', imageId })}
          />

          <BarcodeEntry
            value={session.manualEan ?? ''}
            onChange={(ean) => dispatch({ type: 'set_manual_ean', ean })}
          />

          <EvidenceReviewPanel
            fields={session.fields}
            onEdit={(fieldKey, value) => dispatch({ type: 'edit_field', fieldKey, value })}
            onMarkUnknown={(fieldKey) => dispatch({ type: 'mark_unknown', fieldKey })}
            onChooseCandidate={(fieldKey, candidateIndex) =>
              dispatch({ type: 'choose_candidate', fieldKey, candidateIndex })
            }
            onConfirm={(fieldKey) => dispatch({ type: 'confirm_field', fieldKey })}
          />

          {session.duplicate ? (
            <DuplicatePanel
              assessment={session.duplicate}
              onAction={(action) => dispatch({ type: 'duplicate_action', action })}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={ocrCopy.session.recheckDuplicate}
              className="rounded border border-stone-300 px-3 py-1 font-mono text-xs text-stone-700 disabled:opacity-40"
              disabled={wiring.assessDuplicate === null}
              onClick={() => void recheckDuplicate()}
            >
              {ocrCopy.session.recheckDuplicate}
            </button>
            {wiring.assessDuplicate === null ? (
              <span className="font-mono text-xs text-stone-400">
                {ocrCopy.session.recheckDuplicatePending}
              </span>
            ) : null}
            <Link to="/dev/ocr-batch" className="font-mono text-xs text-sky-700 underline">
              {ocrCopy.session.batchLink} →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
