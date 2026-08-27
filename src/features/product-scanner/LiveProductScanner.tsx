import { useEffect, useRef, useState } from 'react';
import { validateBarcode, type ValidBarcode } from '@/features/product-scanner/barcode';
import {
  getSharedBarcodeDecoder,
  type BarcodeDecoder,
} from '@/features/product-scanner/barcodeDecoder';
import {
  PRODUCT_SCAN_ACCEPT,
  prepareProductScanImage,
} from '@/features/product-scanner/imagePreparation';
import { customerProductGapGuidance } from '@/features/product-scanner/customerProductGapGuidance';
import {
  nextAutonomousScanAction,
  productFieldsFromScanResult,
  retryablePackageFields,
} from '@/features/product-scanner/autonomousScanLoop';
import type {
  PreparedProductScanAsset,
  ProductScanResult,
} from '@/features/product-scanner/contracts';
import {
  analyzeProductImages,
  finalizeProductScan,
  lookupExactBarcode,
  lookupExactBarcodeFacts,
  type ScanAnalysisResponse,
  type ScanExactProduct,
} from '@/services/productScanner';
import {
  assertUserSafeScannerMessage,
  scannerMessageFromUnknown,
} from '@/services/scannerErrorGuard';

export const MAX_IMAGES = 4;

const card = 'border border-stone-200 bg-white';
const quietButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center border border-stone-300 bg-white px-4 text-sm font-semibold text-ink transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-45';
const primaryButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center bg-ink px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400';

const INITIAL_MISSING_FIELDS = [
  'product_identity',
  'brand_or_unbranded',
  'net_quantity',
  'nutrition_basis',
  'nutrition_energyKcal',
  'nutrition_fat',
  'nutrition_carbohydrate',
  'nutrition_sugars',
  'nutrition_protein',
  'nutrition_salt',
  'ingredientsText',
  'allergen_confirmation',
  'barcode',
  'production_declarations',
] as const;

type ScannerPhase =
  | 'idle'
  | 'preparing'
  | 'identity'
  | 'barcode'
  | 'label'
  | 'research'
  | 'profile'
  | 'ready'
  | 'needs_evidence'
  | 'saving'
  | 'saved'
  | 'blocked';

const PROGRESS_STEPS = [
  { id: 'identity', label: 'Rozpoznaję produkt' },
  { id: 'barcode', label: 'Sprawdzam kod' },
  { id: 'label', label: 'Odczytuję etykietę' },
  { id: 'research', label: 'Weryfikuję dane' },
  { id: 'profile', label: 'Przygotowuję produkt' },
] as const;

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
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return await decoder.decode(canvas);
  } catch {
    return null;
  }
}

const resultBarcode = (result: ProductScanResult | null): ValidBarcode | null =>
  validateBarcode(result?.barcodes[0]?.value ?? '');

const exactProductStatus = (product: ScanExactProduct): string => {
  if (product.engineReady === false) return 'Produkt wymaga weryfikacji';
  if (product.status === 'verified') return 'Produkt zweryfikowany przez Gellatti';
  return 'Produkt gotowy w Twoim katalogu';
};

const confidence = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
};

/** What the Scanner hands back to Product Picker. */
export type ResolvedScanProduct = ScanExactProduct & { barcode: string | null };

export interface LiveProductScannerProps {
  onResolved?: (product: ResolvedScanProduct) => void;
  resolveLabel?: string;
  intro?: string;
}

export function LiveProductScanner({ onResolved, resolveLabel, intro }: LiveProductScannerProps) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [assets, setAssets] = useState<PreparedProductScanAsset[]>([]);
  const [barcode, setBarcode] = useState<ValidBarcode | null>(null);
  const [eanLookupDone, setEanLookupDone] = useState(false);
  const [exactProduct, setExactProduct] = useState<ScanExactProduct | null>(null);
  const [analysis, setAnalysis] = useState<ScanAnalysisResponse | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<'analysis' | 'save'>('analysis');
  const [identityEvidenceGap, setIdentityEvidenceGap] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const decoder = useRef<BarcodeDecoder | null>(null);
  const assetsRef = useRef<PreparedProductScanAsset[]>([]);
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    void getSharedBarcodeDecoder()
      .then((value) => {
        if (active) decoder.current = value;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(
    () => () => {
      for (const asset of assetsRef.current) URL.revokeObjectURL(asset.previewUrl);
    },
    [],
  );

  const ready = preview?.kind === 'profile_preview' && preview.ready === true;
  const criticalGaps = Array.isArray(preview?.criticalGaps)
    ? preview.criticalGaps.filter((item): item is string => typeof item === 'string')
    : [];
  const packageGaps = retryablePackageFields(analysis?.missingCriticalFields ?? criticalGaps);
  const gapGuidance = customerProductGapGuidance(
    identityEvidenceGap
      ? [identityEvidenceGap]
      : packageGaps.length > 0
        ? packageGaps
        : criticalGaps,
  );

  async function preparedImages(inputAssets: readonly PreparedProductScanAsset[]) {
    return Promise.all(
      inputAssets.map(async (asset) => ({
        assetId: asset.id,
        mime: asset.file.type,
        base64: await fileToBase64(asset.file),
        source: asset.source,
        originalMime: asset.originalMime,
        transformations: asset.transformations,
        qualityScore: asset.qualityScore,
      })),
    );
  }

  async function researchBarcode(
    value: ValidBarcode,
  ): Promise<{ exact: ScanExactProduct | null; evidence: ScanAnalysisResponse | null }> {
    setBarcode(value);
    setPhase('barcode');
    setBusy('Sprawdzam kod produktu…');
    const localMatch = await lookupExactBarcode(value);
    if (localMatch) return { exact: localMatch, evidence: null };
    setPhase('research');
    setBusy('Weryfikuję produkt i źródła…');
    try {
      const response = await lookupExactBarcodeFacts({ sessionId, barcode: value });
      setEanLookupDone(true);
      if (response.kind === 'existing_product') return { exact: response.product, evidence: null };
      if (!response.result) return { exact: null, evidence: null };
      return {
        exact: null,
        evidence: {
          sessionId: response.sessionId,
          result: response.result,
          overlayState: response.overlayState ?? 'SCAN_DRAFT',
          missingCriticalFields: response.missingCriticalFields,
          usage: response.usage,
        },
      };
    } catch {
      setEanLookupDone(true);
      return { exact: null, evidence: null };
    }
  }

  async function readImages(
    inputAssets: readonly PreparedProductScanAsset[],
    activeBarcode: ValidBarcode | null,
    accurateRetry: boolean,
    requestedFields: readonly string[],
  ): Promise<{ exact: ScanExactProduct | null; evidence: ScanAnalysisResponse | null }> {
    setPhase(accurateRetry ? 'label' : 'identity');
    setBusy(accurateRetry ? 'Sprawdzam brakujące dane…' : 'Analizuję produkt…');
    const response = await analyzeProductImages({
      sessionId,
      images: await preparedImages(inputAssets),
      barcode: activeBarcode,
      accurateRetry,
      missingFields: [...requestedFields],
    });
    if (!('result' in response)) return { exact: response.product, evidence: null };
    setAnalysis(response);
    setPhase('label');
    return { exact: null, evidence: response };
  }

  async function completeProfile(
    activeAnalysis: ScanAnalysisResponse,
    activeBarcode: ValidBarcode,
  ): Promise<Record<string, unknown>> {
    setPhase('profile');
    setBusy('Przygotowuję produkt do Gellatti…');
    setErrorStage('save');
    const result = await finalizeProductScan({
      action: 'preview',
      sessionId,
      idempotencyKey: `${sessionId}:autonomous-preview-v2`,
      customerFamily: null,
      confirmations: {
        packageEvidenceExhausted: true,
        productFields: productFieldsFromScanResult(
          activeAnalysis.result,
          activeBarcode.lookupValue,
        ),
      },
      privateOverlay: {},
    });
    setPreview(result);
    if (result.kind === 'profile_preview' && result.ready === true) {
      setPhase('ready');
      setBusy(null);
    } else if (result.kind === 'family_confirmation_required') {
      setPhase('blocked');
      setBusy(null);
      setError(
        'Nie udało się wiarygodnie ustalić rodzaju produktu. Potrzebne jest wyraźniejsze zdjęcie nazwy i postaci produktu.',
      );
    } else {
      setPhase('needs_evidence');
      setBusy(null);
    }
    return result;
  }

  async function runAutonomousLoop(
    inputAssets: readonly PreparedProductScanAsset[],
    decodedBarcode: ValidBarcode | null,
    priorAnalysis: ScanAnalysisResponse | null,
  ): Promise<void> {
    if (running.current || inputAssets.length === 0) return;
    running.current = true;
    setError(null);
    setErrorStage('analysis');
    setPreview(null);
    try {
      let activeBarcode = decodedBarcode ?? barcode ?? resultBarcode(priorAnalysis?.result ?? null);
      let activeAnalysis = priorAnalysis;
      let researched = eanLookupDone;
      for (let step = 0; step < 8; step += 1) {
        const action = nextAutonomousScanAction({
          exactProductFound: false,
          hasImage: inputAssets.length > 0,
          barcode: activeBarcode?.lookupValue ?? null,
          eanLookupDone: researched,
          visionCalls: activeAnalysis?.usage.visionCalls ?? 0,
          missingCriticalFields: activeAnalysis?.missingCriticalFields ?? [
            ...INITIAL_MISSING_FIELDS,
          ],
          profilePreviewed: false,
          profileReady: false,
        });

        if (action.kind === 'ean_research' && activeBarcode) {
          const lookup = await researchBarcode(activeBarcode);
          researched = true;
          if (lookup.exact) {
            setExactProduct(lookup.exact);
            setPhase('ready');
            setBusy(null);
            return;
          }
          activeAnalysis = lookup.evidence ?? activeAnalysis;
          if (activeAnalysis) setAnalysis(activeAnalysis);
          continue;
        }

        if (action.kind === 'analyze_image') {
          const vision = await readImages(
            inputAssets,
            activeBarcode,
            action.accurateRetry,
            action.requestedFields ??
              activeAnalysis?.missingCriticalFields ?? [...INITIAL_MISSING_FIELDS],
          );
          if (vision.exact) {
            setExactProduct(vision.exact);
            setPhase('ready');
            setBusy(null);
            return;
          }
          activeAnalysis = vision.evidence ?? activeAnalysis;
          if (!activeAnalysis) throw new Error('Nie udało się odczytać produktu.');
          const visionBarcode = resultBarcode(activeAnalysis.result);
          if (visionBarcode) {
            activeBarcode = visionBarcode;
            setBarcode(visionBarcode);
          }
          continue;
        }

        if (action.kind === 'complete_profile') {
          activeBarcode = activeBarcode ?? resultBarcode(activeAnalysis?.result ?? null);
          if (!activeBarcode) {
            setPhase('needs_evidence');
            setBusy(null);
            setIdentityEvidenceGap('MISSING_EAN');
            setError(null);
            return;
          }
          if (!activeAnalysis) throw new Error('Nie udało się odczytać produktu.');
          await completeProfile(activeAnalysis, activeBarcode);
          return;
        }
      }
      throw new Error('Nie udało się ukończyć analizy produktu.');
    } catch (caught) {
      setPhase('blocked');
      setBusy(null);
      setError(scannerMessageFromUnknown(caught, 'analysis'));
    } finally {
      running.current = false;
    }
  }

  async function addFiles(
    files: readonly File[],
    source: PreparedProductScanAsset['source'],
  ): Promise<void> {
    const remaining = Math.max(0, MAX_IMAGES - assets.length);
    if (!remaining || files.length === 0 || running.current) return;
    setPhase('preparing');
    setBusy('Przygotowuję zdjęcie…');
    setIdentityEvidenceGap(null);
    setError(null);
    const next: PreparedProductScanAsset[] = [];
    let foundBarcode: ValidBarcode | null = null;
    for (const file of files.slice(0, remaining)) {
      const prepared = await prepareProductScanImage(file);
      if (!prepared.ok) {
        setError(prepared.reason);
        continue;
      }
      const asset: PreparedProductScanAsset = {
        id: crypto.randomUUID(),
        file: prepared.value.file,
        previewUrl: URL.createObjectURL(prepared.value.file),
        source,
        originalMime: prepared.value.originalMime,
        transformations: prepared.value.transformations,
        qualityScore: null,
      };
      next.push(asset);
      if (!barcode && !foundBarcode) {
        const activeDecoder =
          decoder.current ?? (await getSharedBarcodeDecoder().catch(() => null));
        if (activeDecoder) {
          decoder.current = activeDecoder;
          foundBarcode = await decodeBarcodeFromFile(asset.file, activeDecoder);
        }
      }
    }
    if (next.length === 0) {
      setBusy(null);
      setPhase('idle');
      return;
    }
    setAssets((current) => [...current, ...next].slice(0, MAX_IMAGES));
    if (foundBarcode) setBarcode(foundBarcode);
    await runAutonomousLoop(next, foundBarcode, analysis);
  }

  async function save(): Promise<void> {
    const activeBarcode = barcode ?? resultBarcode(analysis?.result ?? null);
    if (!ready || !analysis || !activeBarcode) return;
    setPhase('saving');
    setBusy('Dodaję produkt do Twojego katalogu…');
    setErrorStage('save');
    setError(null);
    try {
      const result = await finalizeProductScan({
        action: 'finalize',
        sessionId,
        idempotencyKey: `${sessionId}:autonomous-product-v2`,
        customerFamily: null,
        confirmations: {
          packageEvidenceExhausted: true,
          productFields: productFieldsFromScanResult(analysis.result, activeBarcode.lookupValue),
        },
        privateOverlay: {},
      });
      setSaved(result);
      setPhase('saved');
      const productId = typeof result.productId === 'string' ? result.productId : null;
      if (productId && onResolved) {
        onResolved({
          id: productId,
          displayName:
            typeof result.displayName === 'string'
              ? result.displayName
              : (analysis.result.identity.displayName ?? 'Produkt'),
          brand: typeof result.brand === 'string' ? result.brand : analysis.result.identity.brand,
          entityKind: 'commercial_product',
          status: 'manual_unverified',
          barcode: activeBarcode.lookupValue,
          productCode: typeof result.productCode === 'string' ? result.productCode : null,
          productAccuracy: confidence(result.productAccuracy ?? preview?.productAccuracy),
          engineReady: true,
        });
      }
    } catch (caught) {
      setPhase('blocked');
      setError(scannerMessageFromUnknown(caught, 'save'));
    } finally {
      setBusy(null);
    }
  }

  const currentProgress = Math.max(
    0,
    PROGRESS_STEPS.findIndex((step) => step.id === phase),
  );
  const activeBarcode = barcode ?? resultBarcode(analysis?.result ?? null);
  const displayResult = analysis?.result;

  return (
    <div
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (files.length) void addFiles(files, 'paste');
      }}
    >
      <section className={`${card} mt-6`} aria-label="Sesja skanowania produktu">
        <div className="border-b border-stone-200 bg-[#fbfaf7] p-5 sm:p-7">
          {intro && <p className="mb-4 text-sm leading-6 text-stone-600">{intro}</p>}
          <p className="text-sm leading-6 text-stone-600">
            Dodaj jedno dobre zdjęcie produktu. Zdjęcie zostanie przesłane do analizy etykiety;
            ceny, dostawcy, notatki i stan magazynowy pozostają prywatne.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              className={primaryButton}
              disabled={Boolean(busy)}
            >
              Zrób zdjęcie
            </button>
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              className={quietButton}
              disabled={Boolean(busy)}
            >
              Dodaj zdjęcie
            </button>
            <input
              ref={cameraInput}
              className="sr-only"
              type="file"
              accept={PRODUCT_SCAN_ACCEPT}
              capture="environment"
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = '';
                void addFiles(files, 'camera_manual');
              }}
            />
            <input
              ref={galleryInput}
              className="sr-only"
              type="file"
              accept={PRODUCT_SCAN_ACCEPT}
              multiple
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = '';
                void addFiles(files, 'gallery');
              }}
            />
          </div>
        </div>

        <div
          className="m-5 border border-dashed border-stone-300 p-4 sm:m-7"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addFiles([...event.dataTransfer.files], 'drop');
          }}
        >
          {assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              Jedno wyraźne zdjęcie może zawierać nazwę, kod, skład i tabelę wartości odżywczych. Na
              komputerze możesz też przeciągnąć je tutaj.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {assets.map((asset, index) => (
                <figure key={asset.id} className="border border-stone-200">
                  <img
                    src={asset.previewUrl}
                    alt={`Zdjęcie produktu ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                </figure>
              ))}
            </div>
          )}
        </div>

        {busy && (
          <div className="border-t border-stone-200 bg-stone-50 p-5 sm:p-7" role="status">
            <p className="text-lg font-semibold text-ink">Analizuję produkt…</p>
            <p className="mt-1 text-sm text-stone-600">{busy}</p>
            <ol className="mt-5 grid gap-2 sm:grid-cols-5">
              {PROGRESS_STEPS.map((step, index) => {
                const completed = currentProgress > index || phase === 'ready' || phase === 'saved';
                const active = currentProgress === index;
                return (
                  <li
                    key={step.id}
                    className={`border-t pt-2 text-xs ${
                      completed
                        ? 'border-sage text-[#246238]'
                        : active
                          ? 'border-ink text-ink'
                          : 'border-stone-200 text-stone-400'
                    }`}
                  >
                    {step.label}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      {exactProduct && (
        <section className={`${card} mt-6 border-sage/50 p-6 sm:p-8`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#246238]">
            Gellatti · gotowe
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{exactProduct.displayName}</h2>
          <p className="mt-2 text-sm text-stone-600">
            {exactProduct.brand ?? 'Bez marki'}
            {activeBarcode ? ` · EAN ${activeBarcode.lookupValue}` : ''}
          </p>
          {typeof exactProduct.productAccuracy === 'number' && (
            <p className="mt-4 font-mono text-sm text-stone-700">
              Dokładność produktu: {confidence(exactProduct.productAccuracy)}%
            </p>
          )}
          <p className="mt-2 text-sm font-semibold text-[#246238]">
            {exactProductStatus(exactProduct)}
          </p>
          {onResolved && exactProduct.engineReady !== false && (
            <button
              type="button"
              className={`${primaryButton} mt-5`}
              onClick={() =>
                onResolved({ ...exactProduct, barcode: activeBarcode?.lookupValue ?? null })
              }
            >
              {resolveLabel ?? 'Dodaj do receptury'}
            </button>
          )}
        </section>
      )}

      {ready && displayResult && !exactProduct && !saved && (
        <section className={`${card} mt-6 border-sage/50 p-6 sm:p-8`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#246238]">
            Gellatti Ready
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2 className="text-2xl font-semibold">
                {displayResult.identity.displayName ?? displayResult.identity.originalName}
              </h2>
              <p className="mt-2 text-sm text-stone-600">
                {displayResult.identity.brand ?? 'Bez marki'} · EAN {activeBarcode?.lookupValue}
              </p>
            </div>
            <div className="border-l-2 border-sage pl-4">
              <p className="font-mono text-2xl font-semibold text-ink">
                {confidence(preview?.productAccuracy)}%
              </p>
              <p className="text-xs text-stone-500">Dokładność produktu</p>
            </div>
          </div>
          <p className="mt-5 text-sm font-semibold text-[#246238]">GOTOWY DO UŻYCIA</p>
          <button type="button" className={`${primaryButton} mt-5`} onClick={() => void save()}>
            Dodaj produkt
          </button>

          <details className="mt-6 border-t border-stone-200 pt-5">
            <summary className="pro-focus-ring min-h-11 cursor-pointer text-sm font-semibold">
              Pokaż szczegóły
            </summary>
            <div className="mt-3 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
              <p>Etykieta: {displayResult.evidence.length} potwierdzonych odczytów</p>
              <p>Źródła internetowe: {displayResult.externalSources.length}</p>
              <p>
                Rodzina:{' '}
                {String(
                  (preview?.recognition as Record<string, unknown>)?.ingredientFamily ??
                    'rozpoznana',
                )}
              </p>
              <p>
                Źródło danych:{' '}
                {String(
                  (preview?.mapper as Record<string, unknown>)?.selectedDonorId ??
                    'nie był potrzebny',
                )}
              </p>
              <p>
                Zastosowanie:{' '}
                {String(
                  (preview?.productAccuracyAssessment as Record<string, unknown>)?.roleReadiness ??
                    'gotowe',
                )}
              </p>
              <p>
                Profil techniczny:{' '}
                {preview?.engineUsable === true ? 'gotowy do obliczeń' : 'zweryfikowany'}
              </p>
            </div>
          </details>
        </section>
      )}

      {phase === 'needs_evidence' && !ready && (
        <section className={`${card} mt-6 p-6 sm:p-8`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            {gapGuidance.requiresPhoto
              ? 'Potrzebuję jeszcze jednego zdjęcia'
              : 'Produkt wymaga weryfikacji'}
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {gapGuidance.question ?? 'Nie mogę jeszcze uczciwie udostępnić tego produktu'}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            {gapGuidance.explanation}
          </p>
          {gapGuidance.requiresPhoto && (
            <button
              type="button"
              className={`${primaryButton} mt-5`}
              onClick={() => cameraInput.current?.click()}
            >
              Dodaj potrzebne zdjęcie
            </button>
          )}
          <details className="mt-6 border-t border-stone-200 pt-5">
            <summary className="pro-focus-ring min-h-11 cursor-pointer text-sm font-semibold">
              Pokaż szczegóły diagnostyczne
            </summary>
            <div className="mt-3 grid gap-2 text-xs text-stone-500">
              <p>Dokładność: {confidence(preview?.productAccuracy)}%</p>
              <p>
                Profil obliczeń: {preview?.engineUsable === true ? 'gotowy' : 'wymaga uzupełnienia'}
              </p>
              <p>
                Kody decyzji:{' '}
                {criticalGaps.length > 0 ? criticalGaps.join(', ') : 'brak wystarczającego dowodu'}
              </p>
            </div>
          </details>
        </section>
      )}

      {saved && (
        <section className={`${card} mt-6 border-sage/50 p-6 sm:p-8`} aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#246238]">
            Dodano do Twojego katalogu
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {String(saved.displayName ?? displayResult?.identity.displayName ?? 'Produkt')}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Kod {String(saved.productCode ?? '')} · Dokładność{' '}
            {confidence(saved.productAccuracy ?? preview?.productAccuracy)}%
          </p>
          <p className="mt-3 text-sm font-semibold text-[#246238]">
            Produkt jest gotowy do użycia w recepturze i zapisany na przyszłość.
          </p>
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-stone-700"
        >
          {assertUserSafeScannerMessage(error, errorStage)}
        </div>
      )}
    </div>
  );
}
