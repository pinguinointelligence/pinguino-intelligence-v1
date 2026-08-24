import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PRODUCT_SCAN_ACCEPT,
  prepareProductScanImage,
} from '@/features/product-scanner/imagePreparation';
import { scoreRgbaFrame } from '@/features/product-scanner/frameQuality';
import { browserPerceptualHash } from '@/features/ocr-intake/imagePerceptualHash';
import type { ValidBarcode } from '@/features/product-scanner/barcode';
import {
  getSharedBarcodeDecoder,
  type BarcodeDecoder,
  type BarcodeDecoderKind,
} from '@/features/product-scanner/barcodeDecoder';
import {
  createLiveFrameSource,
  type LiveFrameSource,
  type LiveFrameSourceKind,
} from '@/features/product-scanner/liveFrameSource';
import { RollingBestFrameWindow } from '@/features/product-scanner/rollingBestFrame';
import {
  DUPLICATE_HAMMING_DISTANCE,
  frameHash,
  hammingDistance,
  liveCaptureDecision,
  textDensity,
  type CapturedFrame,
  type CaptureView,
} from '@/features/product-scanner/liveCapture';
import {
  EVIDENCE_LABEL,
  SCAN_EVIDENCE_KINDS,
  evidenceKindForMissingField,
  scanEvidenceState,
  type ScanEvidenceKind,
} from '@/features/product-scanner/evidenceState';
import {
  LIVE_FIELD_LABEL,
  LIVE_FIELD_ORDER,
  applyExactProduct,
  applyLocalBarcode,
  applyProductScanResult,
  clearNotOnLabel,
  confirmNotOnLabel,
  createLiveFieldState,
  liveScanCompletion,
  markLiveFieldsSearching,
  missingFieldsForAnalysis,
  nextLiveHint,
  type LiveFieldState,
  type LiveScanFieldKey,
} from '@/features/product-scanner/liveFieldState';
import { routeScan, scanShowsResult } from '@/features/product-scanner/scanRouting';
import {
  analyzeProductImages,
  finalizeProductScan,
  lookupExactBarcode,
  lookupExactBarcodeFacts,
  ProductScannerServiceError,
  type ScanAnalysisResponse,
  type ScanExactProduct,
} from '@/services/productScanner';
import { SCANNER_ERROR_COPY, type ScannerStage } from '@/features/product-scanner/scannerErrors';
import { assertUserSafeScannerMessage } from '@/services/scannerErrorGuard';
import {
  packageDisplay,
  productCompletionFields,
  productCompletionPayload,
  productCompletionReady,
  scanBlockerExplanation,
  scanCompletenessLabel,
} from '@/features/product-scanner/resultPresentation';
import type { PreparedProductScanAsset } from '@/features/product-scanner/contracts';

export const MAX_IMAGES = 4;
const CAMERA_SCAN_INTERVAL_MS = 180;
/** Enough pixels for small retail bars while bounding work to roughly 5–6 attempts/s. */
const ANALYSIS_WIDTH = 960;
const FULL_FRAME_BARCODE_EVERY = 4;
const BEST_FRAME_WINDOW_MS = 700;

interface BestFrameCandidate {
  canvas: HTMLCanvasElement;
  hash: bigint;
  qualityScore: number;
  quality: ReturnType<typeof scoreRgbaFrame>;
  textDensity: number;
}

const card = 'rounded-xl border border-stone-200 bg-white shadow-[0_12px_32px_rgba(28,25,23,0.06)]';
const quietButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-ink transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-45';
const primaryButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

function snapshotVideoFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  if (video.videoWidth < 1 || video.videoHeight < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function centralBarcodeRoi(source: HTMLCanvasElement): HTMLCanvasElement {
  const roi = document.createElement('canvas');
  roi.width = Math.max(1, Math.round(source.width * 0.88));
  roi.height = Math.max(1, Math.round(source.height * 0.62));
  const context = roi.getContext('2d');
  if (context) {
    context.drawImage(
      source,
      Math.round(source.width * 0.06),
      Math.round(source.height * 0.19),
      roi.width,
      roi.height,
      0,
      0,
      roi.width,
      roi.height,
    );
  }
  return roi;
}

/**
 * Read a GTIN out of a still image the owner supplied.
 *
 * An uploaded label is evidence exactly like a camera frame (§11, §12), so it gets the
 * same free routing: a code found here reaches the catalogue and the exact source before
 * any model is asked to read anything.
 */
async function decodeBarcodeFromFile(
  file: File,
  decoder: BarcodeDecoder,
): Promise<ValidBarcode | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const width = Math.min(1280, bitmap.width);
    const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return await decoder.decode(canvas);
  } catch {
    return null;
  }
}

function productStatus(product: ScanExactProduct): string {
  if (product.entityKind === 'pi_base') return 'Mapper Base';
  if (product.status === 'verified') return 'Produkt zweryfikowany';
  return 'Produkt istnieje w katalogu';
}

/** Kinds the session can consider answered, given the server's own missing list. */
function resolvedKinds(missing: readonly string[]): ScanEvidenceKind[] {
  const missingKinds = new Set(
    missing
      .map(evidenceKindForMissingField)
      .filter((kind): kind is ScanEvidenceKind => kind !== null),
  );
  return SCAN_EVIDENCE_KINDS.filter((kind) => !missingKinds.has(kind));
}

/**
 * Everything one scan knows. Held in a ref because the camera loop reads it sixty
 * times a second and a stale closure there would silently re-capture, re-ask or
 * re-analyse — the exact class of defect this rewrite exists to remove.
 */
interface ScanSession {
  sessionId: string;
  assets: PreparedProductScanAsset[];
  assetHashes: Array<bigint | null>;
  captured: CapturedFrame[];
  barcode: ValidBarcode | null;
  exactProduct: ScanExactProduct | null;
  analysis: ScanAnalysisResponse | null;
  missingCriticalFields: string[];
  resolvedByLookup: ScanEvidenceKind[];
  resolvedByCamera: ScanEvidenceKind[];
  shownViews: ScanEvidenceKind[];
  fields: LiveFieldState;
  notOnLabelFields: LiveScanFieldKey[];
  eanLookupDone: boolean;
  lookupUnavailable: boolean;
  visionCalls: number;
  sourceLookupCount: number;
  analyzedAssetIds: string[];
  cameraOpen: boolean;
  cameraFacing: 'environment' | 'user';
  cameraCapabilities: {
    torch: boolean;
    zoom: { min: number; max: number; step: number; value: number } | null;
    continuousFocus: boolean;
  };
  torchOn: boolean;
  decoderKind: BarcodeDecoderKind | null;
  decoderWarmupMs: number | null;
  frameSourceKind: LiveFrameSourceKind | null;
  cameraStartupMs: number | null;
  barcodeAttempts: number;
  timeToFirstBarcodeMs: number | null;
  duplicateFramesSkipped: number;
  autoCapturedViews: CaptureView[];
  guidance: string;
  busy: string | null;
  error: string | null;
  errorStage: ScannerStage;
  saved: Record<string, unknown> | null;
  privacyAccepted: boolean;
  allergenConfirmed: boolean;
  completionValues: Record<string, string>;
  finished: boolean;
}

const freshSession = (): ScanSession => ({
  sessionId: crypto.randomUUID(),
  assets: [],
  assetHashes: [],
  captured: [],
  barcode: null,
  exactProduct: null,
  analysis: null,
  missingCriticalFields: [],
  resolvedByLookup: [],
  resolvedByCamera: [],
  shownViews: [],
  fields: createLiveFieldState(),
  notOnLabelFields: [],
  eanLookupDone: false,
  lookupUnavailable: false,
  visionCalls: 0,
  sourceLookupCount: 0,
  analyzedAssetIds: [],
  cameraOpen: false,
  cameraFacing: 'environment',
  cameraCapabilities: { torch: false, zoom: null, continuousFocus: false },
  torchOn: false,
  decoderKind: null,
  decoderWarmupMs: null,
  frameSourceKind: null,
  cameraStartupMs: null,
  barcodeAttempts: 0,
  timeToFirstBarcodeMs: null,
  duplicateFramesSkipped: 0,
  autoCapturedViews: [],
  guidance: 'Obracaj produkt powoli',
  busy: null,
  error: null,
  errorStage: 'analysis',
  saved: null,
  privacyAccepted: false,
  allergenConfirmed: false,
  completionValues: {},
  finished: false,
});

/** The merged evidence picture for a session snapshot. */
function evidenceOf(current: ScanSession) {
  return scanEvidenceState({
    localBarcode: current.barcode?.lookupValue ?? null,
    catalogMatch: current.exactProduct !== null,
    resolvedByLookup: current.resolvedByLookup,
    resolvedByCamera: current.resolvedByCamera,
    missingCriticalFields: current.missingCriticalFields,
    shownViews: current.shownViews,
    analysisExhausted: current.visionCalls >= 2,
  });
}

/** What the scanner hands back: the canonical product, and the code it was found by. */
export type ResolvedScanProduct = ScanExactProduct & { barcode: string | null };

export interface LiveProductScannerProps {
  /**
   * Where the scan is meant to end. In the recipe flow the answer is a product the
   * owner can put in the recipe, so the scanner hands it back instead of ending on
   * a card and sending them to search for it again (§37).
   */
  onResolved?: (product: ResolvedScanProduct) => void;
  /** The label of the terminal action when a product has been resolved. */
  resolveLabel?: string;
  /** Rendered under the header — the caller says why the scan was opened. */
  intro?: string;
}

export function LiveProductScanner({ onResolved, resolveLabel, intro }: LiveProductScannerProps) {
  // Rendered state and loop state are the same object, held twice on purpose: the
  // camera loop runs between renders and must never read a stale snapshot, while the
  // view must never read a ref during render.
  const [state, setState] = useState<ScanSession>(freshSession);
  const exposeStagingQaDiagnostics =
    typeof window !== 'undefined' &&
    (import.meta.env.DEV || window.location.hostname === 'staging.pinguinoai.com') &&
    new URLSearchParams(window.location.search).has('qa');
  const session = useRef<ScanSession>(state);
  const patch = useCallback((changes: Partial<ScanSession>) => {
    const next = { ...session.current, ...changes };
    session.current = next;
    setState(next);
  }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<BarcodeDecoder | null>(null);
  const frameSourceRef = useRef<LiveFrameSource | null>(null);
  const scanFramesRef = useRef<() => void>(() => undefined);
  const lastFrameAtRef = useRef(0);
  const cameraStartedAtRef = useRef<number | null>(null);
  const barcodeAttemptRef = useRef(0);
  const processingFrameRef = useRef(false);
  const bestFrameRef = useRef(new RollingBestFrameWindow<BestFrameCandidate>(BEST_FRAME_WINDOW_MS));
  const bestFrameViewRef = useRef<CaptureView | null>(null);
  const advancingRef = useRef(false);
  const capturingRef = useRef(false);
  /** Set once `resolveDetectedBarcode` exists; uploads and frames share one route. */
  const resolveBarcodeRef = useRef<(barcode: ValidBarcode) => Promise<void>>(async () => undefined);

  const evidence = evidenceOf(state);
  const route = routeScan({
    catalogMatch: state.exactProduct !== null,
    barcode: state.barcode?.lookupValue ?? null,
    eanLookupDone: state.eanLookupDone,
    frameCount: state.assets.length,
    analyzedFrameCount: state.analyzedAssetIds.length,
    liveBarcodeSearchActive: state.cameraOpen,
    visionCalls: state.visionCalls,
    maxVisionCalls: 2,
    evidence,
  });

  const stopCamera = useCallback(() => {
    frameSourceRef.current?.stop();
    frameSourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    processingFrameRef.current = false;
    bestFrameRef.current.reset();
    bestFrameViewRef.current = null;
    patch({
      cameraOpen: false,
      torchOn: false,
      cameraCapabilities: { torch: false, zoom: null, continuousFocus: false },
    });
  }, [patch]);

  useEffect(
    () => () => {
      stopCamera();
      for (const asset of session.current.assets) URL.revokeObjectURL(asset.previewUrl);
    },
    [stopCamera],
  );

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return undefined;
    let active = true;
    void getSharedBarcodeDecoder()
      .then((decoder) => {
        if (!active) return;
        decoderRef.current = decoder;
        patch({ decoderKind: decoder.kind, decoderWarmupMs: Math.round(decoder.warmupMs) });
      })
      .catch(() => {
        if (active) patch({ guidance: 'Obracaj produkt powoli — czytnik kodu uruchamia się.' });
      });
    return () => {
      active = false;
    };
  }, [patch]);

  const addFiles = useCallback(
    async (
      files: readonly File[],
      source: PreparedProductScanAsset['source'],
      qualityScore: number | null = null,
      view: CaptureView | null = null,
      hash: bigint | null = null,
    ) => {
      const remaining = Math.max(0, MAX_IMAGES - session.current.assets.length);
      if (remaining === 0) return;
      patch({ error: null, busy: 'Przygotowuję zdjęcia lokalnie…' });
      let uploadedBarcode: ValidBarcode | null = null;
      for (const file of files.slice(0, remaining)) {
        const result = await prepareProductScanImage(file);
        if (!result.ok) {
          patch({ error: result.reason });
          continue;
        }
        const previewHash =
          hash ??
          (await browserPerceptualHash(result.value.file).then((value) =>
            value ? BigInt(`0x${value}`) : null,
          ));
        if (
          previewHash !== null &&
          session.current.assetHashes.some(
            (existingHash) =>
              existingHash !== null &&
              hammingDistance(existingHash, previewHash) <= DUPLICATE_HAMMING_DISTANCE,
          )
        ) {
          patch({ duplicateFramesSkipped: session.current.duplicateFramesSkipped + 1 });
          continue;
        }
        // A code found in an uploaded label routes exactly like one read live: catalogue
        // and exact source first, before any model call.
        if (!session.current.barcode && !session.current.exactProduct) {
          const decoder = decoderRef.current ?? (await getSharedBarcodeDecoder());
          decoderRef.current = decoder;
          const decoded = await decodeBarcodeFromFile(result.value.file, decoder);
          if (decoded) uploadedBarcode = decoded;
        }
        const current = session.current;
        patch({
          assets: [
            ...current.assets,
            {
              id: crypto.randomUUID(),
              file: result.value.file,
              previewUrl: URL.createObjectURL(result.value.file),
              source,
              originalMime: result.value.originalMime,
              transformations: result.value.transformations,
              qualityScore,
            },
          ].slice(0, MAX_IMAGES),
          assetHashes: [...current.assetHashes, previewHash].slice(0, MAX_IMAGES),
          captured: view
            ? [...current.captured, { view, hash: previewHash ?? 0n, score: qualityScore ?? 0 }]
            : current.captured,
          shownViews:
            view && !current.shownViews.includes(view)
              ? [...current.shownViews, view]
              : current.shownViews,
          autoCapturedViews:
            view && source === 'camera_auto'
              ? [...current.autoCapturedViews, view]
              : current.autoCapturedViews,
        });
      }
      patch({ busy: null });
      if (uploadedBarcode) await resolveBarcodeRef.current(uploadedBarcode);
    },
    [patch],
  );

  /** Views still worth a frame: what is missing, minus what the camera already holds. */
  const wantedViews = useCallback((): CaptureView[] => {
    const current = session.current;
    if (current.exactProduct) return [];
    const held = new Set(current.captured.map((frame) => frame.view));
    const viewForField: Readonly<Record<LiveScanFieldKey, CaptureView>> = {
      barcode: 'barcode',
      product_name: 'identity',
      brand: 'identity',
      net_quantity: 'identity',
      nutrition: 'nutrition',
      ingredients: 'ingredients',
      allergens: 'ingredients',
    };
    const wanted = LIVE_FIELD_ORDER.filter((key) =>
      ['MISSING', 'SEARCHING', 'CONFLICT'].includes(current.fields[key].status),
    ).map((key) => viewForField[key]);
    return [...new Set(wanted)].filter((view) => !held.has(view));
  }, []);

  const runEanLookup = useCallback(async () => {
    const barcode = session.current.barcode;
    if (!barcode) return;
    patch({ busy: 'Sprawdzam kod produktu…' });
    try {
      const response = await lookupExactBarcodeFacts({
        sessionId: session.current.sessionId,
        barcode,
      });
      if (response.kind === 'existing_product') {
        patch({
          exactProduct: response.product,
          fields: applyExactProduct(session.current.fields, {
            displayName: response.product.displayName,
            brand: response.product.brand,
            barcode: session.current.barcode?.lookupValue ?? null,
          }),
        });
      } else {
        patch({
          ...(response.result
            ? {
                analysis: {
                  sessionId: response.sessionId,
                  result: response.result,
                  overlayState: response.overlayState ?? 'SCAN_DRAFT',
                  missingCriticalFields: response.missingCriticalFields,
                  usage: response.usage,
                },
                missingCriticalFields: response.missingCriticalFields,
                resolvedByLookup: resolvedKinds(response.missingCriticalFields),
                fields: applyProductScanResult(
                  session.current.fields,
                  response.result,
                  response.missingCriticalFields,
                  'ean_lookup',
                ),
              }
            : {}),
          lookupUnavailable: response.providerUnavailable === true,
          sourceLookupCount: session.current.sourceLookupCount + 1,
        });
      }
    } catch {
      // §24 — an unreachable source degrades the scan, it never stops it.
      patch({ lookupUnavailable: true });
    } finally {
      patch({ eanLookupDone: true, busy: null });
    }
  }, [patch]);

  const runAnalysis = useCallback(
    async (accurateRetry: boolean) => {
      const current = session.current;
      if (!current.privacyAccepted) {
        patch({ error: 'Potwierdź informację o prywatności przed analizą.' });
        return;
      }
      patch({ busy: accurateRetry ? 'Czytam uzupełnione ujęcie…' : 'Czytam etykietę…' });
      const newAssets = current.assets.filter(
        (asset) => !current.analyzedAssetIds.includes(asset.id),
      );
      if (newAssets.length === 0) {
        patch({ busy: null });
        return;
      }
      const analyzedNow = [...current.analyzedAssetIds, ...newAssets.map((asset) => asset.id)];
      try {
        const images = await Promise.all(
          newAssets.map(async (asset) => ({
            assetId: asset.id,
            mime: asset.file.type,
            base64: await fileToBase64(asset.file),
            source: asset.source,
            originalMime: asset.originalMime,
            transformations: asset.transformations,
            qualityScore: asset.qualityScore,
          })),
        );
        const response = await analyzeProductImages({
          sessionId: current.sessionId,
          images,
          barcode: current.barcode,
          accurateRetry,
          missingFields: missingFieldsForAnalysis(current.fields),
        });
        if (!('result' in response)) {
          patch({
            analyzedAssetIds: analyzedNow,
            exactProduct: response.product,
            analysis: null,
            fields: applyExactProduct(session.current.fields, {
              displayName: response.product.displayName,
              brand: response.product.brand,
              barcode: current.barcode?.lookupValue ?? null,
            }),
          });
          return;
        }
        patch({
          analyzedAssetIds: analyzedNow,
          analysis: response,
          missingCriticalFields: response.missingCriticalFields,
          resolvedByCamera: resolvedKinds(response.missingCriticalFields),
          fields: applyProductScanResult(
            session.current.fields,
            response.result,
            response.missingCriticalFields,
          ),
          visionCalls: response.usage.visionCalls,
          allergenConfirmed: false,
          completionValues: {},
        });
      } catch (caught) {
        // A failed analysis costs the session nothing and leaves the frames in place;
        // the owner is not sent back to the beginning (§14, §15).
        patch({
          visionCalls:
            caught instanceof ProductScannerServiceError && caught.visionCalls > 0
              ? caught.visionCalls
              : session.current.visionCalls,
          errorStage: 'analysis',
          error: caught instanceof Error ? caught.message : SCANNER_ERROR_COPY.analysis_failed,
        });
      } finally {
        patch({ busy: null });
      }
    },
    [patch],
  );

  /**
   * Walk the scan forward as far as it can go on its own. Every step is either free,
   * cheap-and-exact, or the one paid call the evidence actually justifies.
   */
  const advance = useCallback(async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      for (let step = 0; step < 6; step += 1) {
        const current = session.current;
        if (current.error) break;
        const next = routeScan({
          catalogMatch: current.exactProduct !== null,
          barcode: current.barcode?.lookupValue ?? null,
          eanLookupDone: current.eanLookupDone,
          frameCount: current.assets.length,
          analyzedFrameCount: current.analyzedAssetIds.length,
          liveBarcodeSearchActive: current.cameraOpen,
          visionCalls: current.visionCalls,
          maxVisionCalls: 2,
          evidence: evidenceOf(current),
        });
        if (next.kind === 'ean_lookup') {
          await runEanLookup();
          continue;
        }
        if (next.kind === 'analyze_label') {
          if (!current.privacyAccepted) break;
          await runAnalysis(next.accurateRetry);
          continue;
        }
        if (next.kind === 'existing_product' || next.kind === 'ready' || next.kind === 'estimate') {
          patch({ finished: true });
          if (current.cameraOpen) stopCamera();
        }
        break;
      }
    } finally {
      advancingRef.current = false;
    }
  }, [patch, runAnalysis, runEanLookup, stopCamera]);

  const resolveDetectedBarcode = useCallback(
    async (detected: ValidBarcode) => {
      if (session.current.barcode) return;
      const detectedAt =
        session.current.timeToFirstBarcodeMs ??
        (cameraStartedAtRef.current === null
          ? null
          : Math.max(0, performance.now() - cameraStartedAtRef.current));
      patch({
        barcode: detected,
        fields: applyLocalBarcode(session.current.fields, detected.lookupValue),
        guidance: 'Kod znaleziony. Sprawdzam katalog…',
        timeToFirstBarcodeMs: detectedAt === null ? null : Math.round(detectedAt),
      });
      try {
        const existing = await lookupExactBarcode(detected);
        if (existing) {
          // The catalogue answered: no analysis, no source call, no allowance (§4).
          patch({
            exactProduct: {
              id: existing.id,
              displayName: existing.displayName,
              brand: existing.brand,
              entityKind: existing.entityKind,
              status: existing.status,
            },
            fields: applyExactProduct(session.current.fields, {
              displayName: existing.displayName,
              brand: existing.brand,
              barcode: detected.lookupValue,
            }),
            finished: true,
          });
          stopCamera();
          return;
        }
      } catch {
        // A catalogue that cannot be reached is not a "no". The server repeats the
        // exact lookup before anything is charged.
      }
      await advance();
    },
    [advance, patch, stopCamera],
  );

  useEffect(() => {
    resolveBarcodeRef.current = resolveDetectedBarcode;
  }, [resolveDetectedBarcode]);

  const captureCanvasFrame = useCallback(
    async (
      view: CaptureView,
      source: 'camera_auto' | 'camera_manual',
      hash: bigint | null,
      full: HTMLCanvasElement,
      qualityScore: number | null,
    ) => {
      if (capturingRef.current) return;
      capturingRef.current = true;
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          full.toBlob(resolve, 'image/jpeg', 0.92),
        );
        if (!blob) return;
        const file = new File([blob], `produkt-${Date.now()}.jpg`, { type: 'image/jpeg' });
        await addFiles([file], source, qualityScore, view, hash);
        patch({
          guidance: `Odczytuję: ${EVIDENCE_LABEL[view].toLowerCase()}.`,
        });
      } finally {
        capturingRef.current = false;
      }
    },
    [addFiles, patch],
  );

  const captureFullFrame = useCallback(
    async (view: CaptureView, source: 'camera_auto' | 'camera_manual', hash: bigint | null) => {
      const video = videoRef.current;
      if (!video) return;
      const full = snapshotVideoFrame(video);
      if (!full) return;
      await captureCanvasFrame(view, source, hash, full, null);
    },
    [captureCanvasFrame],
  );

  const scanFrames = useCallback(async () => {
    if (processingFrameRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || video.readyState < 2) return;
    const now = performance.now();
    if (now - lastFrameAtRef.current < CAMERA_SCAN_INTERVAL_MS) return;
    processingFrameRef.current = true;
    lastFrameAtRef.current = now;
    try {
      const width = Math.min(ANALYSIS_WIDTH, video.videoWidth || ANALYSIS_WIDTH);
      const height = Math.max(
        2,
        Math.round(((video.videoHeight || 240) / (video.videoWidth || 320)) * width),
      );
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);

      if (!session.current.barcode && decoderRef.current) {
        barcodeAttemptRef.current += 1;
        const decodeSource =
          barcodeAttemptRef.current % FULL_FRAME_BARCODE_EVERY === 0
            ? canvas
            : centralBarcodeRoi(canvas);
        const decodeStartedAt = performance.now();
        const detected = await decoderRef.current.decode(decodeSource);
        patch({
          barcodeAttempts: barcodeAttemptRef.current,
          decoderKind: decoderRef.current.kind,
          decoderWarmupMs: Math.round(decoderRef.current.warmupMs),
        });
        if (detected && !session.current.barcode) {
          patch({ timeToFirstBarcodeMs: Math.round(performance.now() - decodeStartedAt) });
          await resolveDetectedBarcode(detected);
        }
      }

      const current = session.current;
      if (current.exactProduct || current.busy || capturingRef.current) return;
      const pixels = context.getImageData(0, 0, width, height).data;
      const quality = scoreRgbaFrame(pixels, width, height);
      const luminance = new Uint8Array(width * height);
      for (let index = 0; index < luminance.length; index += 1) {
        const offset = index * 4;
        luminance[index] = Math.round(
          (pixels[offset] ?? 0) * 0.2126 +
            (pixels[offset + 1] ?? 0) * 0.7152 +
            (pixels[offset + 2] ?? 0) * 0.0722,
        );
      }
      const hash = frameHash(luminance, width, height);
      const density = textDensity(luminance, width, height);
      const wanted = wantedViews();
      // Prefer human-readable label surfaces while the local decoder keeps running,
      // but never dead-end when barcode is the final unresolved field. In that case
      // one selected barcode view can still enter the existing evidence pipeline.
      const view = wanted.find((candidate) => candidate !== 'barcode') ?? wanted[0] ?? null;
      if (view === null) {
        bestFrameRef.current.reset();
        bestFrameViewRef.current = null;
        if (!current.barcode && current.guidance !== 'Obracaj produkt powoli') {
          patch({ guidance: 'Obracaj produkt powoli' });
        }
        return;
      }
      if (bestFrameViewRef.current !== view) {
        bestFrameRef.current.reset();
        bestFrameViewRef.current = view;
      }

      const duplicate = current.assetHashes.some(
        (existingHash) =>
          existingHash !== null &&
          hammingDistance(existingHash, hash) <= DUPLICATE_HAMMING_DISTANCE,
      );
      const isTextView = view === 'nutrition' || view === 'ingredients';
      const readable =
        !duplicate &&
        quality.score >= 32 &&
        quality.exposure >= 0.2 &&
        quality.sharpness >= 0.12 &&
        quality.glare <= 0.55 &&
        (!isTextView || density >= 0.035);
      if (readable) {
        const full = snapshotVideoFrame(video);
        if (full) {
          bestFrameRef.current.offer({
            value: {
              canvas: full,
              hash,
              qualityScore: quality.score,
              quality,
              textDensity: density,
            },
            score: quality.score,
            readable: true,
            capturedAt: now,
          });
        }
      }
      const selected = bestFrameRef.current.takeReady(now)?.value ?? null;
      const decision = liveCaptureDecision({
        wanted,
        captured: current.captured,
        bestFrameReady: selected !== null,
        signals: {
          quality: selected?.quality ?? quality,
          barcode: null,
          hash: selected?.hash ?? hash,
          textDensity: selected?.textDensity ?? density,
        },
        maxFrames: MAX_IMAGES,
      });
      if (decision.kind === 'hold') {
        if (current.guidance !== decision.guidance) patch({ guidance: decision.guidance });
      } else if (decision.kind === 'duplicate') {
        patch({ duplicateFramesSkipped: current.duplicateFramesSkipped + 1 });
      } else if (decision.kind === 'capture' && selected) {
        await captureCanvasFrame(
          decision.view,
          'camera_auto',
          selected.hash,
          selected.canvas,
          selected.qualityScore,
        );
        await advance();
      } else if (decision.kind === 'enough') {
        await advance();
      }
    } finally {
      processingFrameRef.current = false;
    }
  }, [advance, captureCanvasFrame, patch, resolveDetectedBarcode, wantedViews]);

  useEffect(() => {
    scanFramesRef.current = () => void scanFrames();
  }, [scanFrames]);

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user' = session.current.cameraFacing) => {
      patch({ error: null });
      if (!session.current.privacyAccepted) {
        patch({ error: 'Potwierdź informację o prywatności przed analizą.' });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        patch({
          error: 'Kamera nie jest dostępna w tej przeglądarce. Dodaj zdjęcia z urządzenia.',
        });
        inputRef.current?.click();
        return;
      }
      stopCamera();
      try {
        const cameraRequestStartedAt = performance.now();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 4 / 3 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (import.meta.env.MODE !== 'test') {
          void getSharedBarcodeDecoder().then((decoder) => {
            decoderRef.current = decoder;
            patch({ decoderKind: decoder.kind, decoderWarmupMs: Math.round(decoder.warmupMs) });
          });
        }
        const track = stream.getVideoTracks?.()[0] ?? stream.getTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          | {
              focusMode?: string[];
              torch?: boolean;
              zoom?: { min?: number; max?: number; step?: number };
            }
          | undefined;
        const continuousFocus = capabilities?.focusMode?.includes('continuous') === true;
        if (continuousFocus && track?.applyConstraints) {
          void track
            .applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
            .catch(() => undefined);
        }
        const zoom = capabilities?.zoom;
        const zoomState =
          typeof zoom?.min === 'number' && typeof zoom.max === 'number'
            ? {
                min: zoom.min,
                max: zoom.max,
                step: typeof zoom.step === 'number' && zoom.step > 0 ? zoom.step : 0.1,
                value: zoom.min,
              }
            : null;
        cameraStartedAtRef.current ??= cameraRequestStartedAt;
        bestFrameRef.current.reset();
        bestFrameViewRef.current = null;
        patch({
          cameraFacing: requestedFacing,
          cameraOpen: true,
          cameraStartupMs: Math.round(performance.now() - cameraRequestStartedAt),
          finished: false,
          fields: markLiveFieldsSearching(session.current.fields),
          cameraCapabilities: {
            torch: capabilities?.torch === true,
            zoom: zoomState,
            continuousFocus,
          },
          guidance: 'Obracaj produkt powoli',
        });
      } catch {
        patch({
          error: 'Nie udało się uruchomić kamery. Sprawdź uprawnienia lub dodaj zdjęcia.',
          cameraOpen: false,
        });
      }
    },
    [patch, stopCamera],
  );

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!state.cameraOpen || !video || !stream) return;
    video.srcObject = stream;
    void video
      .play()
      .then(() => {
        frameSourceRef.current?.stop();
        const source = createLiveFrameSource(video, () => scanFramesRef.current());
        frameSourceRef.current = source;
        patch({ frameSourceKind: source.kind });
        source.start();
      })
      .catch(() => patch({ error: 'Podgląd kamery nie mógł zostać uruchomiony.' }));
  }, [patch, state.cameraOpen]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') frameSourceRef.current?.pause();
      else if (session.current.cameraOpen) frameSourceRef.current?.resume();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  /**
   * Dropping a frame also releases the view it was evidence for, so a bad capture can
   * simply be shown again instead of dead-ending the session.
   */
  const discardAsset = useCallback(
    (assetId: string) => {
      const current = session.current;
      const index = current.assets.findIndex((asset) => asset.id === assetId);
      if (index < 0) return;
      const discarded = current.assets[index]!;
      URL.revokeObjectURL(discarded.previewUrl);
      const view = current.captured[index]?.view ?? null;
      patch({
        assets: current.assets.filter((asset) => asset.id !== assetId),
        assetHashes: current.assetHashes.filter((_, position) => position !== index),
        captured: current.captured.filter((_, position) => position !== index),
        shownViews: view ? current.shownViews.filter((kind) => kind !== view) : current.shownViews,
        analyzedAssetIds: current.analyzedAssetIds.filter((id) => id !== assetId),
      });
    },
    [patch],
  );

  const save = useCallback(async () => {
    const current = session.current;
    if (!current.analysis || current.busy) return;
    patch({ busy: 'Zapisuję produkt…' });
    try {
      const result = await finalizeProductScan({
        sessionId: current.sessionId,
        idempotencyKey: `${current.sessionId}:create-v1`,
        confirmations: {
          noAdditionalAllergenStatementVisible: current.allergenConfirmed,
          notOnLabelFields: current.notOnLabelFields,
          productFields: productCompletionPayload(current.completionValues),
        },
        privateOverlay: {},
      });
      patch({ saved: result });
      const identity = current.analysis.result.identity;
      const articleId = typeof result.productCode === 'string' ? result.productCode : null;
      if (articleId && result.engineUsable === true && onResolved) {
        onResolved({
          id: articleId,
          displayName: identity.displayName ?? identity.originalName ?? 'Nowy produkt',
          brand: identity.brand ?? null,
          entityKind: 'commercial_product',
          status: 'manual_unverified',
          carbonationStatus:
            result.carbonationStatus === 'CARBONATED' ||
            result.carbonationStatus === 'NON_CARBONATED'
              ? result.carbonationStatus
              : 'UNKNOWN',
          barcode: current.barcode?.lookupValue ?? null,
        });
      }
    } catch (caught) {
      patch({
        errorStage: 'save',
        error: caught instanceof Error ? caught.message : SCANNER_ERROR_COPY.save_failed,
      });
    } finally {
      patch({ busy: null });
    }
  }, [onResolved, patch]);

  const setTorch = useCallback(
    async (enabled: boolean) => {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (!track?.applyConstraints) return;
      try {
        await track.applyConstraints({
          advanced: [{ torch: enabled } as MediaTrackConstraintSet],
        });
        patch({ torchOn: enabled });
      } catch {
        patch({ guidance: 'Latarka nie jest dostępna dla tej kamery.' });
      }
    },
    [patch],
  );

  const setZoom = useCallback(
    async (value: number) => {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (!track?.applyConstraints || !Number.isFinite(value)) return;
      try {
        await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
        const zoom = session.current.cameraCapabilities.zoom;
        if (zoom) {
          patch({
            cameraCapabilities: {
              ...session.current.cameraCapabilities,
              zoom: { ...zoom, value },
            },
          });
        }
      } catch {
        patch({ guidance: 'Zoom nie jest dostępny dla tej kamery.' });
      }
    },
    [patch],
  );

  const confirmMissingOnPackage = useCallback(
    async (key: LiveScanFieldKey) => {
      const current = session.current;
      const viewForField: Readonly<Record<LiveScanFieldKey, ScanEvidenceKind>> = {
        barcode: 'barcode',
        product_name: 'identity',
        brand: 'identity',
        net_quantity: 'identity',
        nutrition: 'nutrition',
        ingredients: 'ingredients',
        allergens: 'ingredients',
      };
      const view = viewForField[key];
      const nextFields = confirmNotOnLabel(current.fields, key);
      patch({
        fields: nextFields,
        notOnLabelFields: current.notOnLabelFields.includes(key)
          ? current.notOnLabelFields
          : [...current.notOnLabelFields, key],
        shownViews: current.shownViews.includes(view)
          ? current.shownViews
          : [...current.shownViews, view],
        allergenConfirmed: key === 'allergens' ? true : current.allergenConfirmed,
        guidance: nextLiveHint(nextFields),
      });
      await advance();
    },
    [advance, patch],
  );

  const exactProduct = state.exactProduct;
  const showResult = scanShowsResult(route) || state.finished || state.assets.length > 0;
  const showFinalResult =
    state.exactProduct !== null || (state.analysis !== null && scanShowsResult(route));
  const needsAllergenConfirmation =
    state.missingCriticalFields.includes('allergen_confirmation') === true;
  const allergenConfirmationIsOnlyBlocker =
    state.missingCriticalFields.length === 1 && needsAllergenConfirmation;
  const completionFields = productCompletionFields(state.missingCriticalFields);
  const completionReady = productCompletionReady(
    completionFields,
    state.completionValues,
    state.allergenConfirmed,
  );
  const firstUnresolvedField = LIVE_FIELD_ORDER.find((key) =>
    ['MISSING', 'SEARCHING', 'CONFLICT'].includes(state.fields[key].status),
  );
  const notOnLabelCandidate =
    firstUnresolvedField &&
    ['barcode', 'net_quantity', 'nutrition', 'ingredients', 'allergens'].includes(
      firstUnresolvedField,
    )
      ? firstUnresolvedField
      : null;
  const completion = liveScanCompletion(state.fields);

  return (
    <div
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (files.length) void addFiles(files, 'paste').then(() => advance());
      }}
    >
      <section className={`${card} mt-6 overflow-hidden`} aria-label="Sesja skanowania produktu">
        <div className="border-b border-stone-200 bg-[#fbfaf7] p-5 sm:p-7">
          {intro && <p className="mb-4 text-sm leading-6 text-stone-600">{intro}</p>}
          <label className="flex items-start gap-3 text-sm leading-6 text-stone-600">
            <input
              type="checkbox"
              checked={state.privacyAccepted}
              onChange={(event) => patch({ privacyAccepted: event.currentTarget.checked })}
              className="mt-1 size-4 accent-stone-900"
            />
            <span>
              Zdjęcia etykiety mogą zostać przesłane do analizy produktu.
              <br />
              Ceny, dostawcy, notatki i stan magazynowy nie są publikowane.
            </span>
          </label>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void startCamera()}
              className={primaryButton}
              disabled={!state.privacyAccepted}
            >
              Skanuj kamerą
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className={quietButton}>
              Dodaj zdjęcia
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept={PRODUCT_SCAN_ACCEPT}
              multiple
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = '';
                void addFiles(files, 'gallery').then(() => advance());
              }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Kamera sama zapisuje potrzebne ujęcia. Możesz też dodać zdjęcia z urządzenia,
            przeciągnąć je lub wkleić — trafiają do tej samej sesji.
          </p>
        </div>

        {state.cameraOpen && (
          <div className="border-b border-stone-200 bg-ink p-4 text-white sm:p-6">
            <div className="relative mx-auto max-w-2xl overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-[3/4] w-full object-cover sm:aspect-[4/3]"
              />
              <div className="pointer-events-none absolute inset-x-[6%] top-[19%] h-[62%] rounded-lg border border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-base font-medium" aria-live="polite">
              {state.busy ??
                (state.guidance === 'Obracaj produkt powoli'
                  ? nextLiveHint(state.fields)
                  : state.guidance)}
            </p>
            <ul
              className="mx-auto mt-4 grid max-w-2xl gap-px overflow-hidden rounded-lg border border-white/15 bg-white/15 text-sm"
              aria-label="Postęp odczytu produktu"
            >
              {LIVE_FIELD_ORDER.map((key) => {
                const field = state.fields[key];
                const isFound = field.status === 'FOUND';
                const isAbsent = field.status === 'USER_CONFIRMED_NOT_ON_LABEL';
                const icon = isFound
                  ? '✓'
                  : isAbsent
                    ? '–'
                    : field.status === 'CONFLICT'
                      ? '!'
                      : '○';
                return (
                  <li
                    key={key}
                    className="flex min-h-11 items-center justify-between gap-3 bg-[#242321] px-3 py-2"
                  >
                    <span className={isFound || isAbsent ? 'text-white' : 'text-stone-300'}>
                      <span aria-hidden>{icon}</span> {LIVE_FIELD_LABEL[key]}
                    </span>
                    <span className="text-right font-mono text-xs text-stone-300">
                      {field.value ?? (isAbsent ? 'brak na etykiecie' : '')}
                    </span>
                    <span className="sr-only">
                      {isFound
                        ? 'znaleziono'
                        : isAbsent
                          ? 'potwierdzono brak na etykiecie'
                          : field.status === 'CONFLICT'
                            ? 'wykryto konflikt'
                            : 'szukanie'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {LIVE_FIELD_ORDER.filter((key) => state.fields[key].status === 'FOUND')
                .map((key) => `${LIVE_FIELD_LABEL[key]} znaleziono`)
                .join('. ')}
            </p>
            {notOnLabelCandidate && (
              <button
                type="button"
                className="pro-focus-ring mx-auto mt-3 flex min-h-11 max-w-2xl items-center text-sm text-stone-200 underline decoration-white/30 underline-offset-4"
                onClick={() => void confirmMissingOnPackage(notOnLabelCandidate)}
              >
                Nie ma tej informacji na opakowaniu
              </button>
            )}
            <div className="mx-auto mt-4 flex max-w-2xl justify-end">
              <button
                type="button"
                className="pro-focus-ring min-h-11 px-3 text-sm text-stone-300"
                onClick={stopCamera}
              >
                Zamknij
              </button>
            </div>
            <details className="mx-auto mt-2 max-w-2xl border-t border-white/15 pt-3 text-sm text-stone-300">
              <summary className="pro-focus-ring flex min-h-11 cursor-pointer items-center">
                Problem ze skanowaniem?
              </summary>
              <div className="flex flex-wrap items-center gap-2 pb-1 pt-2">
                <button
                  type="button"
                  className="pro-focus-ring min-h-11 rounded-lg border border-white/30 px-3"
                  onClick={() => {
                    const view = (wantedViews().find((item) => item !== 'barcode') ??
                      'identity') as CaptureView;
                    void captureFullFrame(view, 'camera_manual', null).then(() => advance());
                  }}
                >
                  Zatrzymaj jedną klatkę
                </button>
                <button
                  type="button"
                  className="pro-focus-ring min-h-11 rounded-lg border border-white/30 px-3"
                  onClick={() =>
                    void startCamera(state.cameraFacing === 'environment' ? 'user' : 'environment')
                  }
                >
                  Zmień kamerę
                </button>
                {state.cameraCapabilities.torch && (
                  <button
                    type="button"
                    className="pro-focus-ring min-h-11 rounded-lg border border-white/30 px-3"
                    onClick={() => void setTorch(!state.torchOn)}
                  >
                    {state.torchOn ? 'Wyłącz latarkę' : 'Włącz latarkę'}
                  </button>
                )}
                {state.cameraCapabilities.zoom && (
                  <label className="flex min-h-11 items-center gap-2">
                    Zoom
                    <input
                      type="range"
                      min={state.cameraCapabilities.zoom.min}
                      max={state.cameraCapabilities.zoom.max}
                      step={state.cameraCapabilities.zoom.step}
                      value={state.cameraCapabilities.zoom.value}
                      onChange={(event) => void setZoom(Number(event.currentTarget.value))}
                    />
                  </label>
                )}
              </div>
            </details>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {!state.cameraOpen && showResult && !showFinalResult && (
          <div className="p-5 sm:p-7" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Skanowanie produktu
            </p>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {LIVE_FIELD_ORDER.map((key) => (
                <li key={key}>
                  <span aria-hidden>{state.fields[key].status === 'FOUND' ? '✓' : '○'}</span>{' '}
                  {LIVE_FIELD_LABEL[key]}
                  {state.fields[key].value ? ` · ${state.fields[key].value}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-medium">{state.busy ?? nextLiveHint(state.fields)}</p>
            {evidence.requestView && !state.cameraOpen && (
              <button
                type="button"
                className={`${primaryButton} mt-4`}
                onClick={() => void startCamera()}
              >
                Pokaż to ujęcie
              </button>
            )}
            {notOnLabelCandidate && (
              <button
                type="button"
                className={`${quietButton} mt-3`}
                onClick={() => void confirmMissingOnPackage(notOnLabelCandidate)}
              >
                Nie ma tej informacji na opakowaniu
              </button>
            )}
          </div>
        )}

        <details className="m-5 rounded-xl border border-stone-200 bg-white p-4 text-sm sm:m-7">
          <summary className="pro-focus-ring flex min-h-11 cursor-pointer items-center font-semibold text-stone-700">
            Szczegóły i dodane zdjęcia {state.assets.length > 0 ? `(${state.assets.length})` : ''}
          </summary>
          <div
            className="mt-3 rounded-lg border border-dashed border-stone-300 p-4"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void addFiles([...event.dataTransfer.files], 'drop').then(() => advance());
            }}
          >
            {state.assets.length === 0 ? (
              <p className="py-3 text-center text-stone-500">
                Przeciągnij, wklej lub dodaj zdjęcia etykiety — trafią do tej samej sesji co skan.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {state.assets.map((asset, index) => (
                  <figure
                    key={asset.id}
                    className="overflow-hidden rounded-lg border border-stone-200"
                  >
                    <img
                      src={asset.previewUrl}
                      alt={`Ujęcie ${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                    <figcaption className="p-1 text-center">
                      <button
                        type="button"
                        className="pro-focus-ring min-h-11 px-1 text-[11px] font-semibold text-stone-600"
                        onClick={() => discardAsset(asset.id)}
                      >
                        Usuń
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
          {exposeStagingQaDiagnostics && (
            <dl className="mt-4 grid gap-2 rounded-lg bg-stone-950 p-3 font-mono text-[11px] text-stone-200 sm:grid-cols-2">
              <div>
                <dt>camera</dt>
                <dd>getUserMedia · {state.cameraFacing}</dd>
              </div>
              <div>
                <dt>camera startup</dt>
                <dd>{state.cameraStartupMs ?? '—'} ms</dd>
              </div>
              <div>
                <dt>frame source</dt>
                <dd>{state.frameSourceKind ?? 'preparing'}</dd>
              </div>
              <div>
                <dt>decoder</dt>
                <dd>{state.decoderKind ?? 'preparing'}</dd>
              </div>
              <div>
                <dt>WASM warmup</dt>
                <dd>{state.decoderWarmupMs ?? '—'} ms</dd>
              </div>
              <div>
                <dt>barcode attempts</dt>
                <dd>{state.barcodeAttempts}</dd>
              </div>
              <div>
                <dt>first barcode</dt>
                <dd>{state.timeToFirstBarcodeMs ?? '—'} ms</dd>
              </div>
              <div>
                <dt>auto evidence</dt>
                <dd>{state.autoCapturedViews.join(', ') || '—'}</dd>
              </div>
              <div>
                <dt>duplicates skipped</dt>
                <dd>{state.duplicateFramesSkipped}</dd>
              </div>
              <div>
                <dt>Vision calls</dt>
                <dd>{state.visionCalls}</dd>
              </div>
              <div>
                <dt>source lookups</dt>
                <dd>{state.sourceLookupCount}</dd>
              </div>
              <div>
                <dt>missing fields</dt>
                <dd>{missingFieldsForAnalysis(state.fields).join(', ') || '—'}</dd>
              </div>
              <div>
                <dt>not on label</dt>
                <dd>{state.notOnLabelFields.join(', ') || '—'}</dd>
              </div>
              <div>
                <dt>session</dt>
                <dd>{completion}</dd>
              </div>
            </dl>
          )}
        </details>

        {state.barcode && (
          <div className="mx-5 mb-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm sm:mx-7">
            <span className="font-semibold">Kod {state.barcode.format}:</span> {state.barcode.value}
          </div>
        )}
      </section>

      {exactProduct && (
        <section className={`${card} mt-6 border-sage/40 p-6`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Produkt znaleziony — bez analizy i bez limitu
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{exactProduct.displayName}</h2>
          <p className="mt-2 text-sm text-stone-600">
            {exactProduct.brand ?? 'Bez marki'} · {productStatus(exactProduct)}
          </p>
          {onResolved && (
            <button
              type="button"
              className={`${primaryButton} mt-5`}
              onClick={() =>
                onResolved({ ...exactProduct, barcode: state.barcode?.lookupValue ?? null })
              }
            >
              {resolveLabel ?? 'Dodaj do receptury'}
            </button>
          )}
        </section>
      )}

      {state.analysis && showFinalResult && (
        <section className={`${card} mt-6 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Wynik analizy
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {state.fields.product_name.value ??
                  state.analysis.result.identity.displayName ??
                  state.analysis.result.identity.originalName ??
                  'Nazwa wymaga potwierdzenia'}
              </h2>
              <p className="mt-2 text-sm text-stone-600">
                {state.fields.brand.value ??
                  state.analysis.result.identity.brand ??
                  (state.analysis.result.identity.explicitlyUnbranded
                    ? 'Produkt bez marki'
                    : 'Marka nieznana')}
              </p>
            </div>
            <span className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-600">
              {completion === 'COMPLETE' || completion === 'COMPLETE_WITH_NOT_ON_LABEL_FIELDS'
                ? 'Produkt gotowy ✓'
                : scanCompletenessLabel(state.analysis.overlayState, state.missingCriticalFields)}
            </span>
          </div>
          <dl className="mt-6 grid gap-4 border-y border-stone-200 py-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">Opakowanie</dt>
              <dd className="mt-1 font-medium">
                {state.fields.net_quantity.value ??
                  packageDisplay(state.analysis.result.package).value}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Energia</dt>
              <dd className="mt-1 font-medium">
                {state.analysis.result.nutrition.energyKcal ?? '—'} kcal
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Kod</dt>
              <dd className="mt-1 font-medium">
                {state.analysis.result.barcodes[0]?.value ?? state.barcode?.value ?? 'Brak'}
              </dd>
            </div>
          </dl>
          {scanBlockerExplanation(state.missingCriticalFields) && (
            <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-stone-700">
              {scanBlockerExplanation(state.missingCriticalFields)}
            </p>
          )}
          {completionFields.length > 0 && (
            <section className="mt-5 rounded-2xl border border-stone-200 bg-[#fbfaf7] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Uzupełnij produkt
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">
                Jeszcze {completionFields.length}{' '}
                {completionFields.length === 1 ? 'informacja' : 'informacje'}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
                Przepisz tylko brakujące dane z opakowania. Zachowaliśmy cały dotychczasowy skan.
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {completionFields.map((field) => (
                  <label
                    key={field.key}
                    className={field.input === 'textarea' ? 'sm:col-span-2' : ''}
                  >
                    <span className="text-sm font-semibold text-stone-800">{field.label}</span>
                    <span className="mt-2 flex items-center gap-2">
                      {field.input === 'select' ? (
                        <select
                          value={state.completionValues[field.key] ?? ''}
                          onChange={(event) => patch({
                            completionValues: {
                              ...session.current.completionValues,
                              [field.key]: event.currentTarget.value,
                            },
                          })}
                          className="pro-focus-ring min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                        >
                          <option value="">Wybierz…</option>
                          <option value="per_100g">na 100 g</option>
                          <option value="per_100ml">na 100 ml</option>
                        </select>
                      ) : field.input === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={state.completionValues[field.key] ?? ''}
                          onChange={(event) => patch({
                            completionValues: {
                              ...session.current.completionValues,
                              [field.key]: event.currentTarget.value,
                            },
                          })}
                          className="pro-focus-ring w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                        />
                      ) : (
                        <input
                          type={field.input}
                          inputMode={field.input === 'number' ? 'decimal' : undefined}
                          min={field.input === 'number' ? 0 : undefined}
                          step={field.input === 'number' ? 'any' : undefined}
                          value={state.completionValues[field.key] ?? ''}
                          onChange={(event) => patch({
                            completionValues: {
                              ...session.current.completionValues,
                              [field.key]: event.currentTarget.value,
                            },
                          })}
                          className="pro-focus-ring min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                        />
                      )}
                      {field.unit && (
                        <span className="shrink-0 text-xs font-medium text-stone-500">{field.unit}</span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">{field.help}</span>
                  </label>
                ))}
              </div>
            </section>
          )}
          {evidence.packageEvidenceExhausted && (
            <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              Pokazałeś już tę część opakowania. Brakujących danych nie ma na etykiecie —
              uzupełniamy je z Product Intelligence, bez kolejnych zdjęć.
            </p>
          )}
          {state.lookupUnavailable && (
            <p className="mt-4 text-sm text-stone-600">
              Nie udało się znaleźć dodatkowych danych online. Pracuję na tym, co widać na
              etykiecie.
            </p>
          )}
          {needsAllergenConfirmation && (
            <label className="mt-4 flex items-start gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={state.allergenConfirmed}
                onChange={(event) => {
                  if (event.currentTarget.checked) void confirmMissingOnPackage('allergens');
                  else
                    patch({
                      allergenConfirmed: false,
                      fields: clearNotOnLabel(session.current.fields, 'allergens'),
                      notOnLabelFields: session.current.notOnLabelFields.filter(
                        (key) => key !== 'allergens',
                      ),
                    });
                }}
                className="mt-1 size-4 accent-stone-900"
              />
              <span>
                Potwierdzam, że na dostarczonej etykiecie nie widzę dodatkowej deklaracji alergenów.
                To nie oznacza automatycznie „braku alergenów”.
              </span>
            </label>
          )}
          {completionFields.length === 0 && notOnLabelCandidate && notOnLabelCandidate !== 'allergens' && (
            <button
              type="button"
              className={`${quietButton} mt-4`}
              onClick={() => void confirmMissingOnPackage(notOnLabelCandidate)}
            >
              Nie ma tej informacji na opakowaniu
            </button>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={
                Boolean(state.busy) ||
                (state.analysis.overlayState === 'SCAN_DRAFT' &&
                  !(
                    (allergenConfirmationIsOnlyBlocker && state.allergenConfirmed) ||
                    (completionFields.length > 0 && completionReady)
                  ))
              }
              onClick={() => void save()}
            >
              Zapisz produkt
            </button>
          </div>
        </section>
      )}

      {state.saved && (
        <section className={`${card} mt-6 border-sage/40 p-6`} aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            {state.saved.engineUsable === true ? 'Produkt gotowy' : 'Produkt wymaga weryfikacji'}
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {typeof state.saved.productCode === 'string' ? state.saved.productCode : 'Produkt zapisany'}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Dokładność danych{' '}
            {typeof state.saved.productAccuracy === 'number'
              ? `${Math.round(state.saved.productAccuracy)}%`
              : '0%'}
          </p>
          {state.saved.allergenEvidenceStatus === 'NOT_CONFIRMED' && (
            <p className="mt-2 text-sm font-medium text-terracotta">Alergeny niepotwierdzone</p>
          )}
        </section>
      )}

      {state.error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-stone-700"
        >
          <p>{assertUserSafeScannerMessage(state.error, state.errorStage)}</p>
          {state.errorStage === 'save' && state.analysis && (
            <p className="mt-2 text-stone-600">
              Wynik analizy jest zachowany — nic nie trzeba skanować ponownie.
            </p>
          )}
          {state.errorStage === 'analysis' && state.assets.length > 0 && (
            <button
              type="button"
              className={`${quietButton} mt-3`}
              onClick={() => {
                patch({ error: null });
                void advance();
              }}
            >
              Spróbuj ponownie w tej sesji
            </button>
          )}
        </div>
      )}
    </div>
  );
}
