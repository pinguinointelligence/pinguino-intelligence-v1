import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  PRODUCT_SCAN_ACCEPT,
  prepareProductScanImage,
} from '@/features/product-scanner/imagePreparation';
import { scoreRgbaFrame } from '@/features/product-scanner/frameQuality';
import { validateBarcode, type ValidBarcode } from '@/features/product-scanner/barcode';
import {
  analyzeProductImages,
  finalizeProductScan,
  lookupExactBarcode,
  ProductScannerServiceError,
  type ScanExactProduct,
  type ScanAnalysisResponse,
} from '@/services/productScanner';
import { nextEvidencePrompt } from '@/features/product-scanner/pipeline';
import type { PreparedProductScanAsset } from '@/features/product-scanner/contracts';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';

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

const MAX_IMAGES = 4;
const CAMERA_SCAN_INTERVAL_MS = 350;
const AUTO_CAPTURE_STABLE_FRAMES = 3;
const shell = 'mx-auto min-h-screen max-w-5xl bg-paper px-4 py-8 text-ink sm:px-8 lg:py-12';
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

function productStatus(product: ScanExactProduct): string {
  if (product.entityKind === 'pi_base') return 'Mapper Base';
  if (product.status === 'verified') return 'Produkt zweryfikowany';
  return 'Produkt istnieje w katalogu';
}

export function ProductScannerV1Page() {
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const frameLoopRef = useRef<number | null>(null);
  const scanFramesRef = useRef<() => void>(() => undefined);
  const lastFrameAtRef = useRef(0);
  const stableFramesRef = useRef(0);
  const autoCapturedRef = useRef(false);
  const bestFrameRef = useRef<{ blob: Blob; score: number } | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [assets, setAssets] = useState<PreparedProductScanAsset[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState('Ustaw etykietę w ramce.');
  const [barcode, setBarcode] = useState<ValidBarcode | null>(null);
  const [exactProduct, setExactProduct] = useState<ScanExactProduct | null>(null);
  const [analysis, setAnalysis] = useState<ScanAnalysisResponse | null>(null);
  const [visionCallsUsed, setVisionCallsUsed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [noAdditionalAllergenStatementVisible, setNoAdditionalAllergenStatementVisible] =
    useState(false);

  const stopCamera = useCallback(() => {
    if (frameLoopRef.current !== null) cancelAnimationFrame(frameLoopRef.current);
    frameLoopRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const addFiles = useCallback(
    async (
      files: readonly File[],
      source: PreparedProductScanAsset['source'],
      qualityScore: number | null = null,
    ) => {
      setError(null);
      const remaining = Math.max(0, MAX_IMAGES - assets.length);
      if (remaining === 0) {
        setError(`Możesz dodać maksymalnie ${MAX_IMAGES} zdjęć w jednej sesji.`);
        return;
      }
      setBusy('Przygotowuję zdjęcia lokalnie…');
      const prepared: PreparedProductScanAsset[] = [];
      for (const file of files.slice(0, remaining)) {
        const result = await prepareProductScanImage(file);
        if (!result.ok) {
          setError(result.reason);
          continue;
        }
        prepared.push({
          id: crypto.randomUUID(),
          file: result.value.file,
          previewUrl: URL.createObjectURL(result.value.file),
          source,
          originalMime: result.value.originalMime,
          transformations: result.value.transformations,
          qualityScore,
        });
      }
      setAssets((current) => [...current, ...prepared].slice(0, MAX_IMAGES));
      setAnalysis(null);
      setNoAdditionalAllergenStatementVisible(false);
      setSaved(null);
      setBusy(null);
    },
    [assets.length],
  );

  const replaceAsset = useCallback(async (assetId: string, supplied: File) => {
    setBusy('Przygotowuję zdjęcie lokalnie…');
    setError(null);
    const result = await prepareProductScanImage(supplied);
    if (!result.ok) {
      setError(result.reason);
      setBusy(null);
      return;
    }
    setAssets((current) =>
      current.map((asset) => {
        if (asset.id !== assetId) return asset;
        URL.revokeObjectURL(asset.previewUrl);
        return {
          ...asset,
          file: result.value.file,
          previewUrl: URL.createObjectURL(result.value.file),
          source: 'gallery',
          originalMime: result.value.originalMime,
          transformations: result.value.transformations,
          qualityScore: null,
        };
      }),
    );
    setAnalysis(null);
    setNoAdditionalAllergenStatementVisible(false);
    setSaved(null);
    setBusy(null);
  }, []);

  const resolveDetectedBarcode = useCallback(async (detected: ValidBarcode) => {
    setBarcode(detected);
    try {
      const existing = await lookupExactBarcode(detected);
      if (existing) {
        setExactProduct(existing);
        setCameraStatus('Kod rozpoznany — produkt już istnieje.');
      }
    } catch {
      // An unavailable catalog lookup must never be treated as a non-match. The
      // server repeats the exact lookup before authorizing a paid analysis.
      setCameraStatus('Kod odczytany. Serwer potwierdzi go przed analizą.');
    }
  }, []);

  const captureFrame = useCallback(
    async (source: 'camera_auto' | 'camera_manual') => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || assets.length >= MAX_IMAGES) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const sampleWidth = Math.min(320, canvas.width);
      const sampleHeight = Math.max(2, Math.round((canvas.height / canvas.width) * sampleWidth));
      const sample = document.createElement('canvas');
      sample.width = sampleWidth;
      sample.height = sampleHeight;
      const sampleContext = sample.getContext('2d', { willReadFrequently: true });
      sampleContext?.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
      const quality = sampleContext
        ? scoreRgbaFrame(
            sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data,
            sampleWidth,
            sampleHeight,
          )
        : null;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) return;
      const file = new File([blob], `produkt-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await addFiles([file], source, quality?.score ?? null);
      setCameraStatus(
        source === 'camera_auto' ? 'Najlepsza klatka zapisana automatycznie.' : 'Zdjęcie dodane.',
      );
    },
    [addFiles, assets.length],
  );

  const scanFrames = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    const now = performance.now();
    if (video.readyState >= 2 && now - lastFrameAtRef.current >= CAMERA_SCAN_INTERVAL_MS) {
      lastFrameAtRef.current = now;
      const width = Math.min(320, video.videoWidth || 320);
      const height = Math.max(
        2,
        Math.round(((video.videoHeight || 240) / (video.videoWidth || 320)) * width),
      );
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, width, height);
        const quality = scoreRgbaFrame(
          context.getImageData(0, 0, width, height).data,
          width,
          height,
        );
        setCameraStatus(
          quality.acceptableForAutoCapture
            ? 'Etykieta czytelna — przytrzymaj nieruchomo.'
            : quality.glare > 0.18
              ? 'Zmniejsz odblask na etykiecie.'
              : 'Zbliż etykietę i ustabilizuj telefon.',
        );
        if (quality.acceptableForAutoCapture) {
          stableFramesRef.current += 1;
          if (!bestFrameRef.current || quality.score > bestFrameRef.current.score) {
            const full = document.createElement('canvas');
            full.width = video.videoWidth;
            full.height = video.videoHeight;
            full.getContext('2d')?.drawImage(video, 0, 0, full.width, full.height);
            const bestBlob = await new Promise<Blob | null>((resolve) =>
              full.toBlob(resolve, 'image/jpeg', 0.92),
            );
            if (bestBlob) bestFrameRef.current = { blob: bestBlob, score: quality.score };
          }
        } else stableFramesRef.current = 0;
        if (detectorRef.current && !barcode) {
          try {
            const detected = await detectorRef.current.detect(canvas);
            const valid = detected
              .map((item) => validateBarcode(item.rawValue, item.format))
              .find((item): item is ValidBarcode => item !== null);
            if (valid) void resolveDetectedBarcode(valid);
          } catch {
            detectorRef.current = null;
          }
        }
        if (
          stableFramesRef.current >= AUTO_CAPTURE_STABLE_FRAMES &&
          !autoCapturedRef.current &&
          assets.length < MAX_IMAGES
        ) {
          autoCapturedRef.current = true;
          const best = bestFrameRef.current;
          if (best) {
            const file = new File([best.blob], `produkt-${Date.now()}.jpg`, {
              type: 'image/jpeg',
            });
            void addFiles([file], 'camera_auto', best.score);
            setCameraStatus('Najlepsza klatka zapisana automatycznie.');
          } else void captureFrame('camera_auto');
        }
      }
    }
    frameLoopRef.current = requestAnimationFrame(() => scanFramesRef.current());
  }, [addFiles, assets.length, barcode, captureFrame, resolveDetectedBarcode]);

  useEffect(() => {
    scanFramesRef.current = () => void scanFrames();
  }, [scanFrames]);

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user' = cameraFacing) => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamera nie jest dostępna w tej przeglądarce. Dodaj zdjęcia z urządzenia.');
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
        autoCapturedRef.current = false;
        bestFrameRef.current = null;
        setCameraOpen(true);
      } catch {
        setError('Nie udało się uruchomić kamery. Sprawdź uprawnienia lub dodaj zdjęcia.');
        setCameraOpen(false);
      }
    },
    [cameraFacing, stopCamera],
  );

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || !video || !stream) return;
    video.srcObject = stream;
    void video
      .play()
      .then(() => {
        if (frameLoopRef.current === null) {
          frameLoopRef.current = requestAnimationFrame(() => scanFramesRef.current());
        }
      })
      .catch(() => setError('Podgląd kamery nie mógł zostać uruchomiony.'));
  }, [cameraOpen]);

  const analyze = async (accurateRetry = false) => {
    if (busy || exactProduct || assets.length === 0 || visionCallsUsed >= 2) return;
    if (!privacyAccepted) {
      setError('Potwierdź informację o prywatności przed analizą.');
      return;
    }
    setBusy(accurateRetry ? 'Ponawiam dokładną analizę…' : 'Analizuję etykietę…');
    setError(null);
    try {
      const images = await Promise.all(
        assets.map(async (asset) => ({
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
        sessionId,
        images,
        barcode,
        accurateRetry,
        allowWeb: true,
      });
      if (!('result' in response)) {
        setExactProduct(response.product);
        setAnalysis(null);
        return;
      }
      setAnalysis(response);
      setNoAdditionalAllergenStatementVisible(false);
      setVisionCallsUsed(response.usage.visionCalls);
    } catch (caught) {
      if (caught instanceof ProductScannerServiceError && caught.visionCalls > 0) {
        setVisionCallsUsed(caught.visionCalls);
      }
      setError(caught instanceof Error ? caught.message : 'Nie udało się przeanalizować produktu.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!analysis || busy) return;
    setBusy('Zapisuję produkt…');
    setError(null);
    try {
      const result = await finalizeProductScan({
        sessionId,
        idempotencyKey: `${sessionId}:create-v1`,
        confirmations: {
          noAdditionalAllergenStatementVisible,
        },
        privateOverlay: {},
      });
      setSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się zapisać produktu.');
    } finally {
      setBusy(null);
    }
  };

  const missingPrompt = useMemo(
    () =>
      analysis?.missingCriticalFields.length
        ? nextEvidencePrompt(analysis.missingCriticalFields)
        : null,
    [analysis],
  );
  const needsAllergenConfirmation =
    analysis?.missingCriticalFields.includes('allergen_confirmation') === true;
  const allergenConfirmationIsOnlyBlocker =
    analysis?.missingCriticalFields.length === 1 && needsAllergenConfirmation;

  if (authStatus !== 'authed' && !import.meta.env.DEV) {
    return (
      <main className={shell}>
        <Link to="/products" className="text-sm text-stone-600 hover:text-ink">
          ← Produkty
        </Link>
        <section className={`${card} mt-8 p-6 sm:p-9`}>
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">Skanuj produkt</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">
            Zaloguj się, aby skan, prywatne dane i limity produktu były przypisane do właściwego
            konta.
          </p>
          <button type="button" onClick={openAuthModal} className={`${primaryButton} mt-6`}>
            Zaloguj się
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className={shell}
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (files.length) void addFiles(files, 'paste');
      }}
    >
      <Link
        to="/products"
        className="pro-focus-ring inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-ink"
      >
        ← Produkty
      </Link>
      <header className="mt-5 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Gellatti Product Scanner
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Skanuj produkt
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600 sm:text-base">
          Zacznij od kodu lub etykiety. Kamera, galeria, przeciąganie i wklejanie tworzą jedną sesję
          — możesz dokładać brakujące ujęcia.
        </p>
      </header>

      <section className={`${card} mt-8 overflow-hidden`} aria-label="Sesja skanowania produktu">
        <div className="border-b border-stone-200 bg-[#fbfaf7] p-5 sm:p-7">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void startCamera()} className={primaryButton}>
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
                void addFiles([...(event.currentTarget.files ?? [])], 'gallery');
                event.currentTarget.value = '';
              }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-500">
            JPEG, PNG, WEBP, HEIC/HEIF · do {MAX_IMAGES} ujęć · możesz też wkleić obraz lub
            przeciągnąć go poniżej.
          </p>
        </div>

        {cameraOpen && (
          <div className="border-b border-stone-200 bg-ink p-4 text-white sm:p-6">
            <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-[10%] rounded-xl border border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
            </div>
            <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-200" aria-live="polite">
                {cameraStatus}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="pro-focus-ring min-h-10 rounded-xl border border-white/30 px-3 text-sm"
                  onClick={() => {
                    const next = cameraFacing === 'environment' ? 'user' : 'environment';
                    setCameraFacing(next);
                    void startCamera(next);
                  }}
                >
                  Obróć
                </button>
                <button
                  type="button"
                  className="pro-focus-ring min-h-10 rounded-xl bg-white px-4 text-sm font-semibold text-ink"
                  onClick={() => void captureFrame('camera_manual')}
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
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        <div
          className={`m-5 rounded-2xl border border-dashed p-5 transition sm:m-7 ${dragActive ? 'border-ink bg-stone-50' : 'border-stone-300 bg-white'}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void addFiles([...event.dataTransfer.files], 'drop');
          }}
        >
          {assets.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-medium">Przeciągnij zdjęcia etykiety tutaj</p>
              <p className="mt-2 text-sm text-stone-500">
                Najlepiej: przód, tabela odżywcza, skład i kod.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {assets.map((asset, index) => (
                <figure
                  key={asset.id}
                  className="group relative overflow-hidden rounded-xl border border-stone-200 bg-stone-50"
                >
                  <img
                    src={asset.previewUrl}
                    alt={`Zdjęcie etykiety ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  <figcaption className="flex items-center justify-between gap-2 p-2 text-[11px] text-stone-600">
                    <span>
                      {index + 1}. {asset.source.startsWith('camera') ? 'Kamera' : 'Zdjęcie'}
                    </span>
                    <span className="flex items-center gap-1">
                      <label className="pro-focus-ring inline-flex min-h-8 cursor-pointer items-center px-1 font-semibold text-stone-700">
                        Zastąp
                        <input
                          type="file"
                          accept={PRODUCT_SCAN_ACCEPT}
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (file) void replaceAsset(asset.id, file);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="pro-focus-ring min-h-8 px-1 font-semibold text-stone-700"
                        onClick={() => {
                          URL.revokeObjectURL(asset.previewUrl);
                          setAssets((current) => current.filter((item) => item.id !== asset.id));
                          setAnalysis(null);
                        }}
                      >
                        Usuń
                      </button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        {barcode && (
          <div className="mx-5 mb-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm sm:mx-7">
            <span className="font-semibold">Kod {barcode.format}:</span> {barcode.value}
          </div>
        )}

        <div className="border-t border-stone-200 p-5 sm:p-7">
          <label className="flex items-start gap-3 text-sm leading-6 text-stone-600">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.currentTarget.checked)}
              className="mt-1 size-4 accent-stone-900"
            />
            <span>
              Zdjęcia etykiety mogą zostać przesłane do analizy produktu.
              <br />
              Ceny, dostawcy, notatki i stan magazynowy nie są publikowane.
            </span>
          </label>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={
                !assets.length || Boolean(busy) || Boolean(exactProduct) || visionCallsUsed >= 2
              }
              onClick={() => void analyze(visionCallsUsed >= 1)}
            >
              {busy ??
                (visionCallsUsed >= 2
                  ? 'Limit analiz wykorzystany'
                  : visionCallsUsed === 1
                    ? 'Analizuj uzupełnienie'
                    : 'Analizuj produkt')}
            </button>
            {analysis &&
              analysis.missingCriticalFields.length > 0 &&
              analysis.usage.visionCalls < 2 && (
                <button
                  type="button"
                  className={quietButton}
                  disabled={Boolean(busy)}
                  onClick={() => void analyze(true)}
                >
                  Ponów dokładnie
                </button>
              )}
            <span className="text-xs text-stone-500">Maks. 1 analiza + 1 dokładne ponowienie.</span>
          </div>
        </div>
      </section>

      {exactProduct && (
        <section className={`${card} mt-6 border-sage/40 p-6`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Znaleziono po kodzie — bez analizy płatnej
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{exactProduct.displayName}</h2>
          <p className="mt-2 text-sm text-stone-600">
            {exactProduct.brand ?? 'Bez marki'} · {productStatus(exactProduct)}
          </p>
          <Link to="/products" className={`${quietButton} mt-5`}>
            Otwórz produkty
          </Link>
        </section>
      )}

      {analysis && (
        <section className={`${card} mt-6 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Wynik analizy
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {analysis.result.identity.displayName ??
                  analysis.result.identity.originalName ??
                  'Nazwa wymaga potwierdzenia'}
              </h2>
              <p className="mt-2 text-sm text-stone-600">
                {analysis.result.identity.brand ??
                  (analysis.result.identity.explicitlyUnbranded
                    ? 'Produkt bez marki'
                    : 'Marka nieznana')}
              </p>
            </div>
            <span className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-600">
              {analysis.overlayState}
            </span>
          </div>
          <dl className="mt-6 grid gap-4 border-y border-stone-200 py-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">Opakowanie</dt>
              <dd className="mt-1 font-medium">
                {analysis.result.package.netQuantityText ?? 'Brak danych'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Energia</dt>
              <dd className="mt-1 font-medium">
                {analysis.result.nutrition.energyKcal ?? '—'} kcal
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Kod</dt>
              <dd className="mt-1 font-medium">
                {analysis.result.barcodes[0]?.value ?? barcode?.value ?? 'Brak'}
              </dd>
            </div>
          </dl>
          {missingPrompt && (
            <div className="mt-5 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
              <p className="font-semibold">
                {needsAllergenConfirmation ? 'Sprawdź jedną rzecz' : 'Potrzebne dodatkowe ujęcie'}
              </p>
              <p className="mt-1 text-stone-600">{missingPrompt}</p>
              {needsAllergenConfirmation && (
                <label className="mt-3 flex items-start gap-3 text-stone-700">
                  <input
                    type="checkbox"
                    checked={noAdditionalAllergenStatementVisible}
                    onChange={(event) =>
                      setNoAdditionalAllergenStatementVisible(event.currentTarget.checked)
                    }
                    className="mt-1 size-4 accent-stone-900"
                  />
                  <span>
                    Potwierdzam, że na dostarczonej etykiecie nie widzę dodatkowej deklaracji
                    alergenów. To nie oznacza automatycznie „braku alergenów”.
                  </span>
                </label>
              )}
            </div>
          )}
          {analysis.result.conflicts.length > 0 && (
            <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
              Dane z etykiety zachowano; {analysis.result.conflicts.length} rozbieżności z innymi
              źródłami czeka na weryfikację.
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={
                Boolean(busy) ||
                (analysis.overlayState === 'SCAN_DRAFT' &&
                  !(allergenConfirmationIsOnlyBlocker && noAdditionalAllergenStatementVisible))
              }
              onClick={() => void save()}
            >
              Zapisz produkt
            </button>
            <button type="button" className={quietButton} onClick={() => inputRef.current?.click()}>
              Dodaj brakujące zdjęcie
            </button>
          </div>
        </section>
      )}

      {saved && (
        <section className={`${card} mt-6 border-sage/40 p-6`} aria-live="polite">
          <h2 className="text-xl font-semibold">Produkt zapisany</h2>
          <p className="mt-2 text-sm text-stone-600">
            Publiczne fakty i prywatne dane pozostały w oddzielnych granicach dostępu.
          </p>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-stone-700"
        >
          {error}
        </p>
      )}
    </main>
  );
}
