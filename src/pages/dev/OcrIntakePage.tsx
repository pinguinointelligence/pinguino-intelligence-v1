/**
 * DEV-ONLY label-OCR intake page (route: /dev/ocr-intake).
 *
 * The REAL end-to-end OCR path: choose a label image → the keyless LOCAL engine
 * (tesseract.js WASM, in this browser tab — the image never leaves the machine) →
 * deterministic parser → per-field review with OCR confidence → explicit confirmation
 * → the EXISTING local product-intake draft (ProductIntakeCandidate, source_type
 * 'label_scan'), displayed only.
 *
 * Boundaries (OcrIntakePage.test.tsx): DEV-only; NO service import, NO DB write, NO
 * auto-save — the draft is local. Saving stays with the existing reviewed import path.
 */
import { useEffect, useRef, useState } from 'react';
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
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

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

export function OcrIntakePage() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<OcrRunResult | null>(null);
  const [review, setReview] = useState<OcrReviewState | null>(null);
  const [draft, setDraft] = useState<ProductIntakeCandidate | null>(null);
  const jobRef = useRef<OcrJob | null>(null);

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
    </div>
  );
}
