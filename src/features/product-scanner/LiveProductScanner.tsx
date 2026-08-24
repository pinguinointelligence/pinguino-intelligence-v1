import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PRODUCT_SCAN_ACCEPT,
  prepareProductScanImage,
} from '@/features/product-scanner/imagePreparation';
import { scoreRgbaFrame } from '@/features/product-scanner/frameQuality';
import { validateBarcode, type ValidBarcode } from '@/features/product-scanner/barcode';
import {
  decodeGtinFromLuminance,
  decodeGtinFromRgba,
} from '@/features/product-scanner/barcodeScanline';
import {
  frameHash,
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
  scanCompletenessLabel,
} from '@/features/product-scanner/resultPresentation';
import type { PreparedProductScanAsset } from '@/features/product-scanner/contracts';

interface DetectedBarcode {
  rawValue: string;
  format?: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

export const MAX_IMAGES = 4;
const CAMERA_SCAN_INTERVAL_MS = 220;
/** The analysis width the local reader works on. Small enough to stay real-time. */
const ANALYSIS_WIDTH = 480;

const card =
  'rounded-[20px] border border-stone-200 bg-white shadow-[0_12px_32px_rgba(28,25,23,0.06)]';
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

/**
 * Read a GTIN out of a still image the owner supplied.
 *
 * An uploaded label is evidence exactly like a camera frame (§11, §12), so it gets the
 * same free routing: a code found here reaches the catalogue and the exact source before
 * any model is asked to read anything.
 */
async function decodeBarcodeFromFile(file: File): Promise<ValidBarcode | null> {
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
    const decoded = decodeGtinFromRgba(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
    );
    return decoded ? validateBarcode(decoded) : null;
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
  captured: CapturedFrame[];
  barcode: ValidBarcode | null;
  exactProduct: ScanExactProduct | null;
  analysis: ScanAnalysisResponse | null;
  missingCriticalFields: string[];
  resolvedByLookup: ScanEvidenceKind[];
  resolvedByCamera: ScanEvidenceKind[];
  shownViews: ScanEvidenceKind[];
  eanLookupDone: boolean;
  lookupUnavailable: boolean;
  visionCalls: number;
  analyzedFrameCount: number;
  cameraOpen: boolean;
  cameraFacing: 'environment' | 'user';
  guidance: string;
  busy: string | null;
  error: string | null;
  errorStage: ScannerStage;
  saved: Record<string, unknown> | null;
  privacyAccepted: boolean;
  allergenConfirmed: boolean;
  finished: boolean;
}

const freshSession = (): ScanSession => ({
  sessionId: crypto.randomUUID(),
  assets: [],
  captured: [],
  barcode: null,
  exactProduct: null,
  analysis: null,
  missingCriticalFields: [],
  resolvedByLookup: [],
  resolvedByCamera: [],
  shownViews: [],
  eanLookupDone: false,
  lookupUnavailable: false,
  visionCalls: 0,
  analyzedFrameCount: 0,
  cameraOpen: false,
  cameraFacing: 'environment',
  guidance: 'Pokaż produkt — kod kreskowy najlepiej na początek.',
  busy: null,
  error: null,
  errorStage: 'analysis',
  saved: null,
  privacyAccepted: false,
  allergenConfirmed: false,
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
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const frameLoopRef = useRef<number | null>(null);
  const scanFramesRef = useRef<() => void>(() => undefined);
  const lastFrameAtRef = useRef(0);
  const stableFramesRef = useRef(0);
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
    analyzedFrameCount: state.analyzedFrameCount,
    visionCalls: state.visionCalls,
    maxVisionCalls: 2,
    evidence,
  });

  const stopCamera = useCallback(() => {
    if (frameLoopRef.current !== null) cancelAnimationFrame(frameLoopRef.current);
    frameLoopRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    patch({ cameraOpen: false });
  }, [patch]);

  useEffect(() => () => stopCamera(), [stopCamera]);

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
        // A code found in an uploaded label routes exactly like one read live: catalogue
        // and exact source first, before any model call.
        if (!session.current.barcode && !session.current.exactProduct) {
          const decoded = await decodeBarcodeFromFile(result.value.file);
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
          captured: view
            ? [...current.captured, { view, hash: hash ?? 0n, score: qualityScore ?? 0 }]
            : current.captured,
          shownViews:
            view && !current.shownViews.includes(view)
              ? [...current.shownViews, view]
              : current.shownViews,
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
    const missing = evidenceOf(current).missingKinds;
    const wanted = missing.filter((kind) => !held.has(kind));
    // Before the first analysis nothing is known to be missing, so the session starts
    // by wanting the two views every packaged product has: its code and its front.
    if (current.assets.length === 0 && wanted.length === 0) {
      return ['barcode', 'identity'].filter(
        (kind) => !held.has(kind as CaptureView),
      ) as CaptureView[];
    }
    return wanted;
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
        patch({ exactProduct: response.product });
      } else {
        patch({
          ...(response.result
            ? {
                missingCriticalFields: response.missingCriticalFields,
                resolvedByLookup: resolvedKinds(response.missingCriticalFields),
              }
            : {}),
          lookupUnavailable: response.providerUnavailable === true,
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
      const analyzedNow = current.assets.length;
      try {
        const images = await Promise.all(
          current.assets.map(async (asset) => ({
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
        });
        if (!('result' in response)) {
          patch({
            analyzedFrameCount: analyzedNow,
            exactProduct: response.product,
            analysis: null,
          });
          return;
        }
        patch({
          analyzedFrameCount: analyzedNow,
          analysis: response,
          missingCriticalFields: response.missingCriticalFields,
          resolvedByCamera: resolvedKinds(response.missingCriticalFields),
          visionCalls: response.usage.visionCalls,
          allergenConfirmed: false,
        });
      } catch (caught) {
        // A failed analysis costs the session nothing and leaves the frames in place;
        // the owner is not sent back to the beginning (§14, §15).
        patch({
          analyzedFrameCount: analyzedNow,
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
          analyzedFrameCount: current.analyzedFrameCount,
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
      patch({ barcode: detected, guidance: 'Kod odczytany. Sprawdzam katalog…' });
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

  const captureFullFrame = useCallback(
    async (view: CaptureView, source: 'camera_auto' | 'camera_manual', hash: bigint) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || capturingRef.current) return;
      capturingRef.current = true;
      try {
        const full = document.createElement('canvas');
        full.width = video.videoWidth;
        full.height = video.videoHeight;
        full.getContext('2d')?.drawImage(video, 0, 0, full.width, full.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          full.toBlob(resolve, 'image/jpeg', 0.92),
        );
        if (!blob) return;
        const file = new File([blob], `produkt-${Date.now()}.jpg`, { type: 'image/jpeg' });
        await addFiles([file], source, null, view, hash);
        patch({
          guidance: view === 'barcode' ? 'Kod zapisany.' : `Zapisano: ${EVIDENCE_LABEL[view]}.`,
        });
      } finally {
        capturingRef.current = false;
      }
    },
    [addFiles, patch],
  );

  const scanFrames = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const current = session.current;
    if (video && canvas && streamRef.current) {
      const now = performance.now();
      if (video.readyState >= 2 && now - lastFrameAtRef.current >= CAMERA_SCAN_INTERVAL_MS) {
        lastFrameAtRef.current = now;
        const width = Math.min(ANALYSIS_WIDTH, video.videoWidth || ANALYSIS_WIDTH);
        const height = Math.max(
          2,
          Math.round(((video.videoHeight || 240) / (video.videoWidth || 320)) * width),
        );
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, width, height);
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
          let decoded: string | null = null;
          if (!current.barcode) {
            if (detectorRef.current) {
              try {
                const found = await detectorRef.current.detect(canvas);
                decoded =
                  found
                    .map((item) => validateBarcode(item.rawValue, item.format))
                    .find((item): item is ValidBarcode => item !== null)?.value ?? null;
              } catch {
                detectorRef.current = null;
              }
            }
            // Safari has no BarcodeDetector. Without this the owner's iPhone reached a
            // paid analysis with no code at all and the result said „Kod: Brak".
            if (!decoded) decoded = decodeGtinFromLuminance(luminance, width, height);
          }
          const validated = decoded ? validateBarcode(decoded) : null;
          const decision = liveCaptureDecision({
            wanted: wantedViews(),
            captured: current.captured,
            stableFrames: stableFramesRef.current,
            signals: {
              quality,
              barcode: validated?.value ?? null,
              hash: frameHash(luminance, width, height),
              textDensity: textDensity(luminance, width, height),
            },
            maxFrames: MAX_IMAGES,
          });
          if (decision.kind === 'hold') {
            stableFramesRef.current =
              decision.reason === 'settling' ? stableFramesRef.current + 1 : 0;
            if (current.guidance !== decision.guidance && !current.busy) {
              patch({ guidance: decision.guidance });
            }
          } else if (decision.kind === 'capture') {
            stableFramesRef.current = 0;
            await captureFullFrame(
              decision.view,
              'camera_auto',
              frameHash(luminance, width, height),
            );
            if (decision.view === 'barcode' && validated) {
              await resolveDetectedBarcode(validated);
            } else {
              await advance();
            }
          } else if (decision.kind === 'enough') {
            await advance();
          }
        }
      }
    }
    frameLoopRef.current = requestAnimationFrame(() => scanFramesRef.current());
  }, [advance, captureFullFrame, patch, resolveDetectedBarcode, wantedViews]);

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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const Detector = (
          window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }
        ).BarcodeDetector;
        if (Detector) {
          detectorRef.current = new Detector({ formats: ['ean_8', 'ean_13', 'upc_a', 'upc_e'] });
        }
        stableFramesRef.current = 0;
        patch({
          cameraFacing: requestedFacing,
          cameraOpen: true,
          finished: false,
          guidance: 'Pokaż produkt — kod kreskowy najlepiej na początek.',
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
        if (frameLoopRef.current === null) {
          frameLoopRef.current = requestAnimationFrame(() => scanFramesRef.current());
        }
      })
      .catch(() => patch({ error: 'Podgląd kamery nie mógł zostać uruchomiony.' }));
  }, [patch, state.cameraOpen]);

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
        captured: current.captured.filter((_, position) => position !== index),
        shownViews: view ? current.shownViews.filter((kind) => kind !== view) : current.shownViews,
        analyzedFrameCount: Math.min(current.analyzedFrameCount, current.assets.length - 1),
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
        confirmations: { noAdditionalAllergenStatementVisible: current.allergenConfirmed },
        privateOverlay: {},
      });
      patch({ saved: result });
      const identity = current.analysis.result.identity;
      const productId = typeof result.productId === 'string' ? result.productId : null;
      if (productId && onResolved) {
        onResolved({
          id: productId,
          displayName: identity.displayName ?? identity.originalName ?? 'Nowy produkt',
          brand: identity.brand ?? null,
          entityKind: 'commercial_product',
          status: 'manual_unverified',
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

  const exactProduct = state.exactProduct;
  const showResult = scanShowsResult(route) || state.finished || state.assets.length > 0;
  const showFinalResult =
    state.exactProduct !== null || (state.analysis !== null && scanShowsResult(route));
  const needsAllergenConfirmation =
    state.missingCriticalFields.includes('allergen_confirmation') === true;
  const allergenConfirmationIsOnlyBlocker =
    state.missingCriticalFields.length === 1 && needsAllergenConfirmation;

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
            <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-[3/4] w-full object-cover sm:aspect-[4/3]"
              />
              <div className="pointer-events-none absolute inset-[8%] rounded-xl border border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-base font-medium" aria-live="polite">
              {state.busy ?? evidence.requestMessage ?? state.guidance}
            </p>
            {/* What to show is the headline; how to hold it changes frame by frame and
                must not be swallowed by it. */}
            {!state.busy && evidence.requestMessage && (
              <p className="mx-auto mt-1 max-w-2xl text-sm text-stone-300" aria-live="polite">
                {state.guidance}
              </p>
            )}
            <ul className="mx-auto mt-3 flex max-w-2xl flex-wrap gap-x-5 gap-y-1 text-sm text-stone-300">
              {evidence.entries.map((entry) => (
                <li key={entry.kind}>
                  <span aria-hidden>{entry.present ? '✓' : '○'}</span>{' '}
                  <span className={entry.present ? 'text-white' : ''}>
                    {EVIDENCE_LABEL[entry.kind]}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="pro-focus-ring min-h-10 rounded-xl border border-white/30 px-3 text-sm"
                onClick={() =>
                  void startCamera(state.cameraFacing === 'environment' ? 'user' : 'environment')
                }
              >
                Obróć
              </button>
              <button
                type="button"
                className="pro-focus-ring min-h-10 rounded-xl border border-white/30 px-3 text-sm"
                onClick={() => {
                  const view = (wantedViews()[0] ?? 'identity') as CaptureView;
                  void captureFullFrame(view, 'camera_manual', 0n).then(() => advance());
                }}
              >
                Zrób zdjęcie
              </button>
              <button
                type="button"
                className="pro-focus-ring min-h-10 px-2 text-sm text-stone-300"
                onClick={stopCamera}
              >
                Zamknij
              </button>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {!state.cameraOpen && showResult && !showFinalResult && (
          <div className="p-5 sm:p-7" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Skanowanie produktu
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {evidence.entries.map((entry) => (
                <li key={entry.kind}>
                  <span aria-hidden>{entry.present ? '✓' : '○'}</span> {EVIDENCE_LABEL[entry.kind]}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-medium">
              {state.busy ?? evidence.requestMessage ?? 'Zbieram dane produktu…'}
            </p>
            {evidence.requestView && !state.cameraOpen && (
              <button
                type="button"
                className={`${primaryButton} mt-4`}
                onClick={() => void startCamera()}
              >
                Pokaż to ujęcie
              </button>
            )}
          </div>
        )}

        <div
          className="m-5 rounded-2xl border border-dashed border-stone-300 bg-white p-4 sm:m-7"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addFiles([...event.dataTransfer.files], 'drop').then(() => advance());
          }}
        >
          {state.assets.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">
              Nie masz produktu pod ręką? Przeciągnij, wklej lub dodaj zdjęcia etykiety — trafią do
              tej samej sesji co skan.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {state.assets.map((asset, index) => (
                <figure
                  key={asset.id}
                  className="overflow-hidden rounded-xl border border-stone-200"
                >
                  <img
                    src={asset.previewUrl}
                    alt={`Ujęcie ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  <figcaption className="p-1 text-center">
                    <button
                      type="button"
                      className="pro-focus-ring min-h-8 px-1 text-[11px] font-semibold text-stone-600"
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
                {state.analysis.result.identity.displayName ??
                  state.analysis.result.identity.originalName ??
                  'Nazwa wymaga potwierdzenia'}
              </h2>
              <p className="mt-2 text-sm text-stone-600">
                {state.analysis.result.identity.brand ??
                  (state.analysis.result.identity.explicitlyUnbranded
                    ? 'Produkt bez marki'
                    : 'Marka nieznana')}
              </p>
            </div>
            <span className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-600">
              {scanCompletenessLabel(state.analysis.overlayState, state.missingCriticalFields)}
            </span>
          </div>
          <dl className="mt-6 grid gap-4 border-y border-stone-200 py-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">Opakowanie</dt>
              <dd className="mt-1 font-medium">
                {packageDisplay(state.analysis.result.package).value}
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
                onChange={(event) => patch({ allergenConfirmed: event.currentTarget.checked })}
                className="mt-1 size-4 accent-stone-900"
              />
              <span>
                Potwierdzam, że na dostarczonej etykiecie nie widzę dodatkowej deklaracji alergenów.
                To nie oznacza automatycznie „braku alergenów”.
              </span>
            </label>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={
                Boolean(state.busy) ||
                (state.analysis.overlayState === 'SCAN_DRAFT' &&
                  !(allergenConfirmationIsOnlyBlocker && state.allergenConfirmed))
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
          <h2 className="text-xl font-semibold">Produkt zapisany</h2>
          <p className="mt-2 text-sm text-stone-600">
            Publiczne fakty i prywatne dane pozostały w oddzielnych granicach dostępu.
          </p>
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
        </div>
      )}
    </div>
  );
}
