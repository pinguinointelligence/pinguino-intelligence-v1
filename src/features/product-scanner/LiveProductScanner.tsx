import { useEffect, useMemo, useRef, useState } from 'react';
import { validateBarcode, type ValidBarcode } from '@/features/product-scanner/barcode';
import {
  getSharedBarcodeDecoder,
  type BarcodeDecoder,
} from '@/features/product-scanner/barcodeDecoder';
import {
  PRODUCT_SCAN_ACCEPT,
  prepareProductScanImage,
} from '@/features/product-scanner/imagePreparation';
import {
  CUSTOMER_PRODUCT_FAMILY_CHOICES,
  type CustomerProductFamilyChoice,
} from '@/features/product-scanner/customerProductFamily';
import { customerProductGapGuidance } from '@/features/product-scanner/customerProductGapGuidance';
import type {
  PreparedProductScanAsset,
  ProductScanNutrition,
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
import { assertUserSafeScannerMessage } from '@/services/scannerErrorGuard';

export const MAX_IMAGES = 4;
const card = 'border border-stone-200 bg-white';
const quietButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center border border-stone-300 bg-white px-4 text-sm font-semibold text-ink transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-45';
const primaryButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center bg-ink px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400';
const fieldClass =
  'pro-focus-ring min-h-11 w-full border border-stone-300 bg-white px-3 text-sm text-ink';

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

const exactProductStatus = (product: ScanExactProduct): string =>
  product.status === 'verified' ? 'Produkt zweryfikowany' : 'Produkt istnieje w katalogu';

const stringValue = (value: unknown): string =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : '';

type ReviewValues = {
  displayName: string;
  brand: string;
  barcode: string;
  nutrition: Record<keyof ProductScanNutrition, string>;
  ingredientsText: string;
  allergensText: string;
  productionDeclarations: Record<string, string>;
};

const reviewValues = (result: ProductScanResult, barcode: ValidBarcode | null): ReviewValues => ({
  displayName: result.identity.displayName ?? result.identity.originalName ?? '',
  brand: result.identity.brand ?? '',
  barcode: barcode?.lookupValue ?? result.barcodes[0]?.value ?? '',
  nutrition: {
    basis: result.nutrition.basis ?? '',
    energyKj: stringValue(result.nutrition.energyKj),
    energyKcal: stringValue(result.nutrition.energyKcal),
    fat: stringValue(result.nutrition.fat),
    saturatedFat: stringValue(result.nutrition.saturatedFat),
    carbohydrate: stringValue(result.nutrition.carbohydrate),
    sugars: stringValue(result.nutrition.sugars),
    protein: stringValue(result.nutrition.protein),
    salt: stringValue(result.nutrition.salt),
    fibre: stringValue(result.nutrition.fibre),
  },
  ingredientsText: result.ingredientsText ?? '',
  allergensText: result.allergensText ?? '',
  productionDeclarations: Object.fromEntries(
    Object.entries(result.productionDeclarations ?? {}).map(([key, value]) => [
      key,
      stringValue(value),
    ]),
  ),
});

function numericRecord(values: Record<string, string>): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    if (key === 'basis' || key.endsWith('Text') || key === 'formDeclaration')
      result[key] = value.trim();
    else {
      const parsed = Number(value.replace(',', '.'));
      if (Number.isFinite(parsed)) result[key] = parsed;
    }
  }
  return result;
}

const targetPrompt = (missing: readonly string[], result: ProductScanResult | null): string => {
  const values = new Set(missing);
  if (!result?.barcodes[0] || values.has('barcode')) return 'Pokaż kod kreskowy';
  if (values.has('product_identity') || values.has('brand_or_unbranded'))
    return 'Pokaż przód produktu';
  if ([...values].some((field) => field.startsWith('nutrition')))
    return 'Pokaż tabelę wartości odżywczych';
  if (values.has('ingredientsText') || values.has('allergen_confirmation')) return 'Pokaż skład';
  if (values.has('production_declarations')) return 'Pokaż deklarację zawartości lub alkoholu';
  return 'Pokaż brakującą część opakowania';
};

const truthLabel: Record<string, string> = {
  water_percent: 'Woda',
  total_solids_percent: 'Sucha masa',
  fat_percent: 'Tłuszcz',
  protein_percent: 'Białko',
  carbohydrate_percent: 'Węglowodany',
  total_sugars_percent: 'Cukry',
  alcohol_percent: 'Alkohol',
  fiber_percent: 'Błonnik',
  salt_percent: 'Sól',
};

const productionDeclarationFields = [
  ['alcoholAbv', 'Alkohol ABV', 'decimal'],
  ['cocoaButterPercent', 'Masło kakaowe', 'decimal'],
  ['cocoaSolidsPercent', 'Masa kakaowa', 'decimal'],
  ['fruitContentPercent', 'Zawartość owoców', 'decimal'],
  ['brix', 'Brix', 'decimal'],
  ['concentrationText', 'Koncentracja', 'text'],
  ['dosageText', 'Dozowanie', 'text'],
  ['technicalParametersText', 'Parametry techniczne', 'text'],
  ['formDeclaration', 'Postać produktu', 'text'],
] as const;

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
  const [analyzedAssetIds, setAnalyzedAssetIds] = useState<string[]>([]);
  const [barcode, setBarcode] = useState<ValidBarcode | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [exactProduct, setExactProduct] = useState<ScanExactProduct | null>(null);
  const [analysis, setAnalysis] = useState<ScanAnalysisResponse | null>(null);
  const [review, setReview] = useState<ReviewValues | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [familyChoice, setFamilyChoice] = useState<CustomerProductFamilyChoice | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [packageEvidenceExhausted, setPackageEvidenceExhausted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<'analysis' | 'save'>('analysis');
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const decoder = useRef<BarcodeDecoder | null>(null);
  const assetsRef = useRef<PreparedProductScanAsset[]>([]);

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

  const validReviewBarcode = validateBarcode(review?.barcode ?? barcodeInput);
  const familyRequired = preview?.kind === 'family_confirmation_required';
  const ready = preview?.kind === 'profile_preview' && preview.ready === true;
  const criticalGaps = Array.isArray(preview?.criticalGaps)
    ? preview.criticalGaps.filter((item): item is string => typeof item === 'string')
    : [];
  const gapGuidance = customerProductGapGuidance(criticalGaps);

  async function resolveBarcode(value: ValidBarcode): Promise<void> {
    setBarcode(value);
    setBarcodeInput(value.lookupValue);
    setError(null);
    setBusy('Sprawdzam kod produktu…');
    try {
      const existing = await lookupExactBarcode(value);
      if (existing) {
        setExactProduct(existing);
        return;
      }
      const response = await lookupExactBarcodeFacts({ sessionId, barcode: value });
      if (response.kind === 'existing_product') {
        setExactProduct(response.product);
      } else if (response.result) {
        const nextAnalysis: ScanAnalysisResponse = {
          sessionId: response.sessionId,
          result: response.result,
          overlayState: response.overlayState ?? 'SCAN_DRAFT',
          missingCriticalFields: response.missingCriticalFields,
          usage: response.usage,
        };
        setAnalysis(nextAnalysis);
        setReview(reviewValues(response.result, value));
      }
    } catch {
      // External EAN enrichment is optional. The label pipeline remains usable.
    } finally {
      setBusy(null);
    }
  }

  async function addFiles(
    files: readonly File[],
    source: PreparedProductScanAsset['source'],
  ): Promise<void> {
    if (!privacyAccepted) {
      setError('Potwierdź informację o prywatności przed dodaniem zdjęć.');
      return;
    }
    const remaining = Math.max(0, MAX_IMAGES - assets.length);
    if (!remaining) return;
    setBusy('Przygotowuję zdjęcia lokalnie…');
    setError(null);
    const preparedAssets: PreparedProductScanAsset[] = [];
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
      preparedAssets.push(asset);
      if (!barcode && !foundBarcode) {
        const activeDecoder =
          decoder.current ?? (await getSharedBarcodeDecoder().catch(() => null));
        if (activeDecoder) {
          decoder.current = activeDecoder;
          foundBarcode = await decodeBarcodeFromFile(asset.file, activeDecoder);
        }
      }
    }
    setAssets((current) => [...current, ...preparedAssets].slice(0, MAX_IMAGES));
    setBusy(null);
    if (foundBarcode) await resolveBarcode(foundBarcode);
  }

  async function analyze(): Promise<void> {
    if (!privacyAccepted) {
      setError('Potwierdź informację o prywatności przed analizą.');
      return;
    }
    const newAssets = assets.filter((asset) => !analyzedAssetIds.includes(asset.id));
    if (!newAssets.length) {
      setError('Dodaj co najmniej jedno nowe zdjęcie opakowania.');
      return;
    }
    setBusy(analysis ? 'Czytam dodatkowe ujęcie…' : 'Czytam opakowanie…');
    setErrorStage('analysis');
    setError(null);
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
        sessionId,
        images,
        barcode,
        accurateRetry: Boolean(analysis),
        missingFields: analysis?.missingCriticalFields ?? [...INITIAL_MISSING_FIELDS],
      });
      setAnalyzedAssetIds((current) => [
        ...new Set([...current, ...newAssets.map((asset) => asset.id)]),
      ]);
      if (!('result' in response)) {
        setExactProduct(response.product);
        return;
      }
      setAnalysis(response);
      setReview(reviewValues(response.result, barcode));
      const resultBarcode = validateBarcode(response.result.barcodes[0]?.value ?? '');
      if (!barcode && resultBarcode) await resolveBarcode(resultBarcode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się przeanalizować zdjęć.');
    } finally {
      setBusy(null);
    }
  }

  const productFields = useMemo(
    () =>
      review
        ? {
            barcode: validReviewBarcode?.lookupValue ?? review.barcode,
            identity: {
              displayName: review.displayName,
              brand: review.brand || null,
              explicitlyUnbranded: !review.brand.trim(),
            },
            nutrition: numericRecord(review.nutrition),
            ingredientsText: review.ingredientsText || undefined,
            allergensText: review.allergensText || undefined,
            productionDeclarations: numericRecord(review.productionDeclarations),
          }
        : {},
    [review, validReviewBarcode],
  );

  async function buildPreview(
    choice: CustomerProductFamilyChoice | null = familyChoice,
    evidenceExhausted: boolean = packageEvidenceExhausted,
  ): Promise<void> {
    if (!analysis || !review) return;
    if (!validReviewBarcode) {
      setError('Potwierdź poprawny EAN / GTIN produktu.');
      return;
    }
    setBusy('Uzupełniam profil produktu…');
    setErrorStage('save');
    setError(null);
    try {
      const result = await finalizeProductScan({
        action: 'preview',
        sessionId,
        idempotencyKey: `${sessionId}:customer-preview-v1`,
        customerFamily: choice,
        confirmations: { packageEvidenceExhausted: evidenceExhausted, productFields },
        privateOverlay: {},
      });
      setPreview(result);
      if (choice) setFamilyChoice(choice);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Nie udało się zbudować profilu produktu.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    if (!ready || !review || !validReviewBarcode) return;
    setBusy('Dodaję produkt do Twojego katalogu…');
    setErrorStage('save');
    setError(null);
    try {
      const result = await finalizeProductScan({
        action: 'finalize',
        sessionId,
        idempotencyKey: `${sessionId}:customer-product-v1`,
        customerFamily: familyChoice,
        confirmations: { packageEvidenceExhausted, productFields },
        privateOverlay: {},
      });
      setSaved(result);
      const productId = typeof result.productId === 'string' ? result.productId : null;
      if (productId && onResolved) {
        onResolved({
          id: productId,
          displayName:
            typeof result.displayName === 'string' ? result.displayName : review.displayName,
          brand: typeof result.brand === 'string' ? result.brand : review.brand || null,
          entityKind: 'commercial_product',
          status: 'manual_unverified',
          barcode: validReviewBarcode.lookupValue,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się dodać produktu.');
    } finally {
      setBusy(null);
    }
  }

  function patchReview(key: keyof ReviewValues, value: ReviewValues[keyof ReviewValues]): void {
    setReview((current) => (current ? ({ ...current, [key]: value } as ReviewValues) : current));
    setPreview(null);
  }

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
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              className={primaryButton}
              disabled={!privacyAccepted}
            >
              Zrób zdjęcie
            </button>
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              className={quietButton}
              disabled={!privacyAccepted}
            >
              Wybierz zdjęcia
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
            <p className="py-5 text-center text-sm text-stone-500">
              Dodaj przód, tabelę, skład i kod. Na komputerze możesz też przeciągnąć zdjęcia tutaj.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {assets.map((asset, index) => (
                <figure key={asset.id} className="border border-stone-200">
                  <img
                    src={asset.previewUrl}
                    alt={`Ujęcie ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                </figure>
              ))}
            </div>
          )}
          {assets.length > 0 && !exactProduct && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={primaryButton}
                onClick={() => void analyze()}
                disabled={Boolean(busy)}
              >
                {analysis ? 'Analizuj nowe zdjęcie' : 'Analizuj opakowanie'}
              </button>
              {analysis &&
                !packageEvidenceExhausted &&
                analysis.missingCriticalFields.length > 0 && (
                  <button
                    type="button"
                    className={quietButton}
                    onClick={() => cameraInput.current?.click()}
                  >
                    {targetPrompt(analysis.missingCriticalFields, analysis.result)}
                  </button>
                )}
            </div>
          )}
        </div>

        {!exactProduct && (
          <div className="mx-5 mb-5 border-t border-stone-200 pt-5 sm:mx-7 sm:mb-7">
            <label className="block max-w-md text-sm font-semibold text-stone-800">
              EAN / GTIN — wymagany
              <span className="mt-2 flex gap-2">
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={review?.barcode ?? barcodeInput}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setBarcodeInput(value);
                    if (review) patchReview('barcode', value);
                  }}
                  placeholder="Kod z opakowania"
                />
                <button
                  type="button"
                  className={quietButton}
                  disabled={!validateBarcode(review?.barcode ?? barcodeInput) || Boolean(busy)}
                  onClick={() => {
                    const value = validateBarcode(review?.barcode ?? barcodeInput);
                    if (value) void resolveBarcode(value);
                  }}
                >
                  Sprawdź
                </button>
              </span>
            </label>
            {!validReviewBarcode && (review?.barcode || barcodeInput) && (
              <p className="mt-2 text-sm text-terracotta">Kod nie ma poprawnej cyfry kontrolnej.</p>
            )}
          </div>
        )}
      </section>

      {exactProduct && (
        <section className={`${card} mt-6 border-sage/50 p-6`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Znaleziono dokładny EAN
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{exactProduct.displayName}</h2>
          <p className="mt-2 text-sm text-stone-600">
            {exactProduct.brand ?? 'Bez marki'} · {exactProductStatus(exactProduct)}
          </p>
          {onResolved && (
            <button
              type="button"
              className={`${primaryButton} mt-5`}
              onClick={() => onResolved({ ...exactProduct, barcode: barcode?.lookupValue ?? null })}
            >
              {resolveLabel ?? 'Dodaj do receptury'}
            </button>
          )}
        </section>
      )}

      {analysis && review && !exactProduct && (
        <section className={`${card} mt-6 p-5 sm:p-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Dowody z opakowania
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Sprawdź produkt</h2>
            </div>
            <span className="border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-600">
              {analysis.usage.visionCalls} analiza / {assets.length} zdjęć
            </span>
          </div>

          {!packageEvidenceExhausted && analysis.missingCriticalFields.length > 0 && (
            <div className="mt-5 border border-gold/40 bg-gold/10 p-4 text-sm text-stone-700">
              <p>{targetPrompt(analysis.missingCriticalFields, analysis.result)}</p>
              <button
                type="button"
                className={`${quietButton} mt-3`}
                onClick={() => setPackageEvidenceExhausted(true)}
              >
                Nie mam więcej informacji
              </button>
            </div>
          )}
          {packageEvidenceExhausted && (
            <p className="mt-5 border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              Nie prosimy już o kolejne zdjęcia. Product Intelligence sprawdzi teraz bezpieczne
              uzupełnienia.
            </p>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Nazwa produktu
              <input
                className={`${fieldClass} mt-2`}
                value={review.displayName}
                onChange={(event) => patchReview('displayName', event.currentTarget.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Marka
              <input
                className={`${fieldClass} mt-2`}
                value={review.brand}
                onChange={(event) => patchReview('brand', event.currentTarget.value)}
                placeholder="Bez marki — pozostaw puste"
              />
            </label>
          </div>

          <details className="mt-6 border-t border-stone-200 pt-5">
            <summary className="pro-focus-ring min-h-11 cursor-pointer text-sm font-semibold">
              Edytuj odczytane wartości
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['energyKcal', 'Energia kcal'],
                  ['fat', 'Tłuszcz'],
                  ['carbohydrate', 'Węglowodany'],
                  ['sugars', 'Cukry'],
                  ['protein', 'Białko'],
                  ['salt', 'Sól'],
                  ['fibre', 'Błonnik'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs font-semibold text-stone-700">
                  {label}
                  <input
                    className={`${fieldClass} mt-1`}
                    inputMode="decimal"
                    value={review.nutrition[key]}
                    onChange={(event) =>
                      patchReview('nutrition', {
                        ...review.nutrition,
                        [key]: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              ))}
              <label className="text-xs font-semibold text-stone-700">
                Podstawa
                <select
                  className={`${fieldClass} mt-1`}
                  value={review.nutrition.basis}
                  onChange={(event) =>
                    patchReview('nutrition', {
                      ...review.nutrition,
                      basis: event.currentTarget.value,
                    })
                  }
                >
                  <option value="">Nie odczytano</option>
                  <option value="per_100g">na 100 g</option>
                  <option value="per_100ml">na 100 ml</option>
                </select>
              </label>
              <label className="sm:col-span-3 text-xs font-semibold text-stone-700">
                Skład
                <textarea
                  className={`${fieldClass} mt-1 min-h-24 py-3`}
                  value={review.ingredientsText}
                  onChange={(event) => patchReview('ingredientsText', event.currentTarget.value)}
                />
              </label>
              <label className="sm:col-span-3 text-xs font-semibold text-stone-700">
                Alergeny
                <textarea
                  className={`${fieldClass} mt-1 min-h-20 py-3`}
                  value={review.allergensText}
                  onChange={(event) => patchReview('allergensText', event.currentTarget.value)}
                />
              </label>
              {productionDeclarationFields.map(([key, label, inputMode]) => (
                <label key={key} className="text-xs font-semibold text-stone-700">
                  {label}
                  <input
                    className={`${fieldClass} mt-1`}
                    inputMode={inputMode}
                    value={review.productionDeclarations[key] ?? ''}
                    onChange={(event) =>
                      patchReview('productionDeclarations', {
                        ...review.productionDeclarations,
                        [key]: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>

          {!preview && (
            <button
              type="button"
              className={`${primaryButton} mt-6`}
              disabled={!validReviewBarcode || !review.displayName.trim() || Boolean(busy)}
              onClick={() => void buildPreview()}
            >
              Sprawdź gotowość produktu
            </button>
          )}

          {familyRequired && (
            <div className="mt-6 border-t border-stone-200 pt-6">
              <h3 className="text-lg font-semibold">Jaki to rodzaj produktu?</h3>
              <p className="mt-1 text-sm text-stone-600">
                Wybierz prostą kategorię. Dopiero potem uruchomimy dopasowanie rodzinne.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {CUSTOMER_PRODUCT_FAMILY_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={familyChoice === choice.id ? primaryButton : quietButton}
                    onClick={() => {
                      setFamilyChoice(choice.id);
                      void buildPreview(choice.id);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {preview?.kind === 'profile_preview' && (
            <div className="mt-7 border-t border-stone-200 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold">
                    {ready ? 'Produkt gotowy' : 'Produkt wymaga danych'}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">
                    Pewność:{' '}
                    <span className="font-mono">{String(preview.productAccuracy ?? 0)}%</span>
                  </p>
                </div>
                {ready && (
                  <span className="bg-sage/15 px-3 py-2 text-sm font-semibold text-[#246238]">
                    Gotowy do Engine
                  </span>
                )}
              </div>

              {Object.entries(
                (preview.fieldTruth as Record<string, Record<string, unknown>> | undefined) ?? {},
              ).length > 0 && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {Object.entries(
                    preview.fieldTruth as Record<string, Record<string, unknown>>,
                  ).map(([key, truth]) => {
                    const estimated = truth.state === 'ESTIMATED';
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between border-b border-stone-100 py-2 text-sm"
                      >
                        <span>{truthLabel[key] ?? key}</span>
                        <span className={estimated ? 'text-stone-500' : 'text-ink'}>
                          {String(truth.value)}% · {estimated ? 'oszacowano' : 'potwierdzono'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {!ready && criticalGaps.length > 0 && (
                <div className="mt-5 border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-stone-800">
                  <p className="font-semibold text-terracotta">Profil wymaga dalszych dowodów</p>
                  <p className="mt-2">{gapGuidance.question ?? gapGuidance.explanation}</p>
                  {gapGuidance.question && (
                    <p className="mt-1 text-stone-600">{gapGuidance.explanation}</p>
                  )}
                  {gapGuidance.question && !packageEvidenceExhausted && (
                    <button
                      type="button"
                      className={`${quietButton} mt-3`}
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setPackageEvidenceExhausted(true);
                        void buildPreview(familyChoice, true);
                      }}
                    >
                      Nie mam więcej informacji
                    </button>
                  )}
                  {gapGuidance.question && packageEvidenceExhausted && (
                    <p className="mt-3 text-stone-600">
                      Nie prosimy o dane, których nie ma na opakowaniu. Produkt pozostaje niegotowy,
                      dopóki nie pojawi się bezpieczne źródło.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={!ready || !validReviewBarcode || Boolean(busy)}
                  onClick={() => void save()}
                >
                  Dodaj produkt
                </button>
                {!ready && (
                  <button
                    type="button"
                    className={quietButton}
                    onClick={() => {
                      setPreview(null);
                    }}
                  >
                    Popraw dane
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {saved && (
        <section className={`${card} mt-6 border-sage/50 p-6`} aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Dodano do Twojego katalogu
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {String(saved.displayName ?? review?.displayName ?? 'Produkt')}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Produkt jest gotowy do użycia. Kod: {String(saved.productCode ?? '')}
          </p>
        </section>
      )}

      {busy && (
        <p className="mt-4 text-sm font-medium text-stone-700" role="status">
          {busy}
        </p>
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
