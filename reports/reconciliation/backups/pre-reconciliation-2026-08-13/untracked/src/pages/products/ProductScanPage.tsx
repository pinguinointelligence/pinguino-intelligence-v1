import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { TesseractOcrProvider } from '@/features/ocr-intake/provider/tesseractProvider';
import { extractEvidence } from '@/features/ocr-intake/evidenceExtractor';
import { toEvidenceSources } from '@/features/ocr-intake/ui/intakeWiring';
import { EvidenceReviewPanel } from '@/features/ocr-intake/ui/EvidenceReviewPanel';
import {
  addImage,
  beginExtraction,
  beginImageAnalysis,
  chooseCandidate,
  completeImageAnalysis,
  confirmFieldReview,
  createIntakeSession,
  editFieldValue,
  extractSessionFields,
  markFieldUnknown,
  markReadyToSave,
  setManualEan,
} from '@/features/ocr-intake/session/intakeSession';
import { assessDuplicate } from '@/features/ocr-intake/session/duplicateCheck';
import { buildSessionCandidate, type DuplicateResolutionAction } from '@/features/ocr-intake/session/saveFlow';
import { validateLabelImage } from '@/features/ocr-intake/ocrEngine';
import { completeSavedOcrProductAndRetryCatalog, persistSessionAndSave, retryGlobalCatalogContribution, type PersistSessionResult } from '@/services/ocrIntakePersistence';
import { listMyProducts } from '@/services/products';
import { catalogSubmissionMessage } from '@/services/globalCatalog';
import type {
  AcceptedMime,
  DuplicateAssessment,
  IntakeImageRole,
  IntakeFieldKey,
  ProductIntakeSession,
} from '@/features/ocr-intake/intakeContracts';
import { CatalogRiskChallenge } from '@/features/global-catalog/CatalogRiskChallenge';
import {
  duplicateFactDifferences,
  duplicateSimilarityPercent,
  existingDuplicateFacts,
  type DuplicateComparisonFacts,
} from '@/features/global-catalog/duplicateComparison';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';

const ROLES: readonly { value: IntakeImageRole; label: string }[] = [
  { value: 'front', label: 'Przód opakowania' },
  { value: 'nutrition_table', label: 'Tabela odżywcza' },
  { value: 'ingredients', label: 'Skład i alergeny' },
  { value: 'barcode', label: 'Kod kreskowy' },
  { value: 'back', label: 'Tył opakowania' },
  { value: 'claims_allergens', label: 'Oświadczenia i alergeny' },
  { value: 'other', label: 'Inne' },
];

interface PendingImage {
  id: string;
  file: File;
  role: IntakeImageRole;
}

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const acceptedMime = (value: string): value is AcceptedMime =>
  value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';

const MISSING_FIELD_LABELS: Record<string, string> = {
  product_name: 'czytelna nazwa produktu',
  product_identity: 'czytelna nazwa produktu',
  brand_or_unbranded: 'marka albo oznaczenie produktu bez marki',
  net_quantity: 'masa lub objętość opakowania',
  net_quantity_unit: 'masa lub objętość opakowania z jednostką',
  market: 'rynek sprzedaży',
  market_of_sale: 'rynek sprzedaży',
  nutrition_basis: 'podstawa tabeli odżywczej',
  nutrition_energyKcal: 'energia',
  nutrition_fat: 'tłuszcz',
  nutrition_carbohydrate: 'węglowodany',
  nutrition_protein: 'białko',
  nutrition_salt: 'sól',
  ingredients_text: 'czytelny wykaz składników',
  allergens_text: 'czytelna informacja o alergenach',
  ean_gtin_check_digit: 'nieprawidłowa suma kontrolna EAN/GTIN',
  nutrition_saturated_fat: 'nieprawidłowa wartość tłuszczów nasyconych',
  nutrition_sugars: 'nieprawidłowa wartość cukrów',
  nutrition_sugars_gt_carbohydrate: 'cukry przekraczają węglowodany',
  nutrition_fibre: 'nieprawidłowa wartość błonnika',
  nutrition_macro_mass_conflict: 'suma składników odżywczych przekracza 100 g',
  nutrition_energy_macro_conflict: 'energia jest sprzeczna z makroskładnikami',
  front_package_image: 'zdjęcie przodu opakowania',
  nutrition_image: 'zdjęcie tabeli odżywczej',
};

const missingFieldLabel = (value: string): string => MISSING_FIELD_LABELS[value] ?? value.replaceAll('_', ' ');

function statusCopy(result: PersistSessionResult): { title: string; detail: string; tone: string } {
  const shared = result.globalCatalogContribution;
  if (result.saveResult.kind === 'open_existing' && !shared) {
    return { title: 'Produkt już istnieje', detail: 'Istniejący produkt został rozpoznany; bezpieczne zgłoszenie katalogowe można ponowić.', tone: 'border-sage/40 bg-sage/10' };
  }
  if (result.saveResult.kind === 'enrichment_handoff') {
    return { title: 'Wymagane potwierdzenie aktualizacji', detail: 'Istniejący produkt nie został automatycznie nadpisany.', tone: 'border-gold/40 bg-gold/10' };
  }
  if (result.saveResult.kind !== 'saved') {
    return { title: 'Nie zapisano produktu', detail: result.saveResult.kind === 'failed' ? result.saveResult.error : 'Rozstrzygnij duplikat.', tone: 'border-terracotta/50 bg-terracotta/10' };
  }
  if (!shared) return { title: 'Skan zapisany', detail: result.globalCatalogContributionError ? 'Automatyczne zgłoszenie do wspólnego katalogu wymaga ponowienia. Dane skanu pozostają bezpiecznie zapisane.' : 'Wspólny katalog oczekuje na bezpieczne ponowienie.', tone: 'border-gold/40 bg-gold/10' };
  if (shared.kind === 'rate_limited') return { title: 'Skan zapisany', detail: catalogSubmissionMessage(shared) ?? 'Limit automatycznego katalogu został osiągnięty.', tone: 'border-gold/40 bg-gold/10' };
  if (shared.kind === 'likely_duplicate') return { title: 'Czy to ten sam produkt?', detail: 'Wspólny katalog znalazł prawdopodobny duplikat. Skan pozostaje zapisany.', tone: 'border-gold/40 bg-gold/10' };
  if (shared.status === 'verified' && shared.reviewCaseKey) return { title: 'Istniejący produkt pozostaje zweryfikowany', detail: 'Ten skan różni się od bieżących faktów. Nie nadpisaliśmy katalogu; utworzono sprawę korekty.', tone: 'border-gold/40 bg-gold/10' };
  if (shared.status === 'verified') return { title: 'Zweryfikowany automatycznie', detail: 'Serwerowe OCR potwierdziło komplet publicznych danych. Produkt dodano do Ulubionych.', tone: 'border-sage/40 bg-sage/10' };
  if (shared.status === 'manual_unverified') return {
    title: 'Dane ręczne — niezweryfikowane',
    detail: shared.reviewEscalationLimited
      ? `Produkt jest dostępny jako BLUE. Osiągnięto limit zgłoszeń wymagających ręcznej weryfikacji; nowa sprawa nie została utworzona.${shared.retryAt ? ` Spróbuj ponownie po ${new Date(shared.retryAt).toLocaleString('pl-PL')}.` : ''}`
      : 'Produkt jest widoczny jako BLUE i nie otrzymuje uprawnień Engine.',
    tone: 'border-sky-300 bg-sky-50',
  };
  const defects = [
    ...shared.missingFields.map((field) => `brak: ${missingFieldLabel(field)}`),
    ...(shared.invalidFields ?? []).map((field) => `błąd: ${missingFieldLabel(field)}`),
  ];
  return { title: 'Wymaga uzupełnienia', detail: defects.length > 0 ? defects.join(' · ') : 'Brakuje danych możliwych do bezpiecznego potwierdzenia.', tone: 'border-terracotta/50 bg-terracotta/10' };
}

export function ProductScanPage() {
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const providerRef = useRef(new TesseractOcrProvider());
  const bytesRef = useRef(new Map<string, Uint8Array>());
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [session, setSession] = useState<ProductIntakeSession | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateAssessment | null>(null);
  const [existing, setExisting] = useState<Awaited<ReturnType<typeof listMyProducts>>>([]);
  const [result, setResult] = useState<PersistSessionResult | null>(null);
  const [riskToken, setRiskToken] = useState<string | null>(null);
  const [scanMarket, setScanMarket] = useState('');
  const [scanRetailer, setScanRetailer] = useState('');
  const [explicitlyUnbranded, setExplicitlyUnbranded] = useState(false);
  const [duplicateDifference, setDuplicateDifference] = useState('');
  const busy = progress !== null;
  const unresolved = useMemo(
    () => session?.fields.filter((field) => field.reviewStatus === 'needs_confirmation' || field.reviewStatus === 'conflict_unresolved').length ?? 0,
    [session],
  );
  const currentScan = useMemo(() => {
    if (!session) return null;
    const { candidate } = buildSessionCandidate(session, { explicitlyUnbranded });
    return {
      name: candidate.insert.product_name_display ?? candidate.insert.product_name_internal ?? null,
      brand: candidate.insert.brand ?? null,
      package: candidate.insert.package_size ?? null,
      ean: session.manualEan ?? candidate.insert.ean_code ?? candidate.insert.barcode ?? null,
      market: scanMarket.trim() || null,
    } satisfies DuplicateComparisonFacts;
  }, [explicitlyUnbranded, scanMarket, session]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const next: PendingImage[] = [];
    for (const file of Array.from(files).slice(0, 10 - pending.length)) {
      const validation = validateLabelImage({ filename: file.name, mime: file.type || null, sizeBytes: file.size });
      if (!validation.ok || !acceptedMime(file.type)) {
        setError(validation.reason ?? `Nieobsługiwany format: ${file.name}`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, role: pending.length + next.length === 0 ? 'front' : 'other' });
    }
    setPending((current) => [...current, ...next]);
  };

  const analyse = async () => {
    if (pending.length === 0 || busy) return;
    setError(null);
    setResult(null);
    setDuplicate(null);
    setProgress('Przygotowuję zdjęcia…');
    try {
      let next = createIntakeSession(crypto.randomUUID());
      bytesRef.current = new Map();
      for (const item of pending) {
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        bytesRef.current.set(item.id, bytes);
        next = addImage(next, {
          imageId: item.id,
          role: item.role,
          fileName: item.file.name,
          mime: item.file.type as AcceptedMime,
          byteSize: bytes.byteLength,
          checksumSha256: await sha256(bytes),
        });
      }
      next = beginExtraction(next);
      for (let index = 0; index < next.images.length; index += 1) {
        const image = next.images[index]!;
        setProgress(`OCR ${index + 1}/${next.images.length}: ${image.fileName}`);
        next = beginImageAnalysis(next, image.imageId);
        const outcome = await providerRef.current.recognize({
          imageId: image.imageId,
          bytes: bytesRef.current.get(image.imageId)!,
          mime: image.mime,
          languages: ['pol', 'eng', 'spa', 'deu', 'ita'],
        });
        next = completeImageAnalysis(next, image.imageId, outcome);
      }
      next = extractSessionFields(next, (runs, images) => extractEvidence(toEvidenceSources(runs, images)));
      setSession(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się odczytać etykiety.');
    } finally {
      setProgress(null);
    }
  };

  const update = (fn: (value: ProductIntakeSession) => ProductIntakeSession) =>
    setSession((current) => current ? fn(current) : current);

  const resolveStraightforward = () => update((current) => {
    let next = current;
    for (const field of next.fields) {
      if (field.reviewStatus !== 'needs_confirmation') continue;
      const hasValue = field.candidates.some((candidate) => candidate.normalized !== null);
      next = hasValue ? confirmFieldReview(next, field.fieldKey) : markFieldUnknown(next, field.fieldKey);
    }
    return next;
  });

  const persist = async (resolution?: DuplicateResolutionAction) => {
    if (!session || busy) return;
    setError(null);
    setProgress('Sprawdzam duplikaty i zapisuję…');
    try {
      const ready = markReadyToSave(session);
      const owned = existing.length > 0 ? existing : await listMyProducts();
      if (existing.length === 0) setExisting(owned);
      const candidate = buildSessionCandidate(ready, { explicitlyUnbranded }).candidate;
      const assessment = assessDuplicate({ insert: candidate.insert, manualEan: ready.manualEan }, owned);
      if (assessment.verdict !== 'new_product' && !resolution) {
        setDuplicate(assessment);
        return;
      }
      const saved = await persistSessionAndSave(ready, bytesRef.current, owned, {
        resolution,
        explicitlyUnbranded,
        market: scanMarket.trim() || null,
        retailer: scanRetailer.trim() || null,
        distinguishingEvidence: resolution === 'create_new'
          ? { variant: duplicateDifference.trim() }
          : {},
      });
      setResult(saved);
      setDuplicate(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się zapisać produktu.');
    } finally {
      setProgress(null);
    }
  };

  const retryContribution = async (
    duplicateDecision?: 'same' | 'different',
  ) => {
    if (!result || !session || busy) return;
    setProgress('Ponawiam bezpieczne zgłoszenie…');
    setError(null);
    try {
      const contribution = await retryGlobalCatalogContribution(result, session, {
        duplicateDecision,
        distinguishingEvidence: duplicateDecision === 'different'
          ? { variant: duplicateDifference.trim() }
          : {},
        riskChallengeToken: riskToken,
        market: scanMarket.trim() || null,
        retailer: scanRetailer.trim() || null,
      });
      setResult({ ...result, globalCatalogContribution: contribution, globalCatalogContributionError: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się ponowić zgłoszenia.');
    } finally {
      setProgress(null);
    }
  };

  const completeProduct = async () => {
    if (!result || !session || busy || unresolved > 0) return;
    setProgress('Zapisuję uzupełnienia…');
    setError(null);
    try {
      const contribution = await completeSavedOcrProductAndRetryCatalog(result, session, {
        explicitlyUnbranded,
        market: scanMarket.trim() || null,
        retailer: scanRetailer.trim() || null,
      });
      setResult({ ...result, globalCatalogContribution: contribution, globalCatalogContributionError: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się zapisać uzupełnień.');
    } finally {
      setProgress(null);
    }
  };

  const visual = result ? statusCopy(result) : null;
  if (authStatus !== 'authed' && !import.meta.env.DEV) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl bg-paper px-4 py-16 text-ink sm:px-8">
        <Link to="/products" className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-ink">← Produkty</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.035em]">Zaloguj się, aby skanować produkty</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">Skanowanie, prywatne Ulubione i limity katalogu są przypisane do uwierzytelnionego konta.</p>
        <button type="button" onClick={openAuthModal} className="pro-focus-ring mt-6 min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white">Zaloguj się</button>
      </main>
    );
  }
  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-paper px-4 py-10 text-ink sm:px-8 lg:py-16">
      <Link to="/products" className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-ink">← Produkty</Link>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">Global Product Catalog</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Dodaj produkt ze zdjęć etykiety</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        OCR działa lokalnie. Po Twoim przeglądzie bezpieczne publiczne fakty są automatycznie zgłaszane do wspólnego katalogu. Cena, dostawca, notatki i stan magazynowy nigdy nie są publikowane.
      </p>

      {!session ? (
        <section className="mt-8 rounded-[20px] border border-ink/10 bg-white p-5 shadow-e1">
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-ink/25 px-4 text-center focus-within:ring-2 focus-within:ring-gold">
            <span className="font-medium">Dodaj zdjęcia opakowania</span>
            <span className="mt-1 text-xs text-stone-600">PNG, JPEG lub WebP · maks. 10 MB każde · do 10 zdjęć</span>
            <input className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => addFiles(event.target.files)} />
          </label>
          {pending.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {pending.map((item) => (
                <li key={item.id} className="grid items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 sm:grid-cols-[1fr_220px_44px]">
                  <span className="truncate text-sm">{item.file.name}</span>
                  <select aria-label={`Rodzaj zdjęcia ${item.file.name}`} className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm" value={item.role} onChange={(event) => setPending((current) => current.map((entry) => entry.id === item.id ? { ...entry, role: event.target.value as IntakeImageRole } : entry))}>
                    {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <button type="button" aria-label={`Usuń ${item.file.name}`} className="min-h-11 rounded-xl border border-ink/15" onClick={() => setPending((current) => current.filter((entry) => entry.id !== item.id))}>×</button>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="mt-5 min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-40" disabled={pending.length === 0 || busy} onClick={() => void analyse()}>{progress ?? 'Odczytaj etykietę'}</button>
        </section>
      ) : (
        <>
          <section className="mt-8 rounded-[20px] border border-ink/10 bg-white p-4 shadow-e1 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-semibold">Sprawdź odczytane dane</h2><p className="mt-1 text-xs text-stone-600">Brak wartości pozostaje brakiem — nigdy zerem.</p></div>
              <button type="button" className="min-h-11 rounded-xl border border-ink/15 px-4 text-xs font-medium" onClick={resolveStraightforward}>Potwierdź odczytane / oznacz braki</button>
            </div>
            <label className="mt-4 block text-xs font-medium text-stone-600">EAN wpisany ręcznie
              <input className="mt-1 min-h-11 w-full rounded-xl border border-ink/15 px-3 text-sm sm:max-w-xs" value={session.manualEan ?? ''} onChange={(event) => update((current) => setManualEan(current, event.target.value || null))} />
            </label>
            <label className="mt-4 block text-xs font-medium text-stone-600">Rynek sprzedaży
              <input
                className="mt-1 min-h-11 w-full rounded-xl border border-ink/15 px-3 text-sm sm:max-w-xs"
                value={scanMarket}
                onChange={(event) => setScanMarket(event.currentTarget.value)}
                placeholder="np. Polska"
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-stone-600">Sprzedawca (opcjonalnie)
              <input
                className="mt-1 min-h-11 w-full rounded-xl border border-ink/15 px-3 text-sm sm:max-w-xs"
                value={scanRetailer}
                onChange={(event) => setScanRetailer(event.currentTarget.value)}
                placeholder="np. Lidl, REWE, Mercadona"
              />
            </label>
            <label className="mt-4 flex min-h-11 max-w-xs items-center gap-3 rounded-xl border border-ink/10 px-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={explicitlyUnbranded}
                disabled={currentScan?.brand !== null}
                onChange={(event) => setExplicitlyUnbranded(event.currentTarget.checked)}
                className="size-5 accent-ink"
              />
              Ten produkt jest jawnie bez marki
            </label>
            <EvidenceReviewPanel
              fields={session.fields}
              onEdit={(key: IntakeFieldKey, value: string) => update((current) => editFieldValue(current, key, value))}
              onMarkUnknown={(key: IntakeFieldKey) => update((current) => markFieldUnknown(current, key))}
              onChooseCandidate={(key: IntakeFieldKey, index: number) => update((current) => chooseCandidate(current, key, index))}
              onConfirm={(key: IntakeFieldKey) => update((current) => confirmFieldReview(current, key))}
            />
            <div className="sticky bottom-3 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/15 bg-white/95 p-3 shadow-e2 backdrop-blur">
              <span className="text-xs text-stone-600">{unresolved === 0 ? 'Wszystkie pola rozstrzygnięte.' : `Do rozstrzygnięcia: ${unresolved}`}</span>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-40"
                disabled={unresolved > 0 || busy || (result !== null && result.globalCatalogContribution?.status !== 'blocked')}
                onClick={() => void (result ? completeProduct() : persist())}
              >
                {progress ?? (result ? (result.globalCatalogContribution?.status === 'blocked' ? 'Zapisz uzupełnienia' : 'Produkt zapisany') : 'Zapisz produkt')}
              </button>
            </div>
          </section>
          {duplicate ? (
            <section role="dialog" aria-labelledby="duplicate-title" className="mt-5 rounded-[20px] border border-gold/40 bg-gold/10 p-5">
              <h2 id="duplicate-title" className="font-semibold">Czy to ten sam produkt?</h2>
              <p className="mt-2 text-sm text-stone-700">Znaleziono {duplicate.verdict === 'exact_duplicate' ? 'dokładny' : 'prawdopodobny'} duplikat. Nie utworzymy drugiego wpisu bez Twojej decyzji.</p>
              {currentScan ? <div className="mt-3 rounded-xl border border-ink/10 bg-white p-3 text-xs text-stone-700">
                <strong className="block text-ink">Nowy skan: {currentScan.name ?? 'Nie odczytano'}</strong>
                <span>{[currentScan.brand ?? 'Bez marki', currentScan.package ?? 'Brak opakowania', currentScan.market ?? 'Brak rynku', currentScan.ean ?? 'Brak EAN'].join(' · ')}</span>
              </div> : null}
              <ul className="mt-3 space-y-2" aria-label="Porównanie podobnych produktów">
                {duplicate.reasons.map((reason) => {
                  const product = existing.find((entry) => entry.id === reason.existingProductId);
                  const facts = product ? existingDuplicateFacts(product) : null;
                  const differences = currentScan && facts ? duplicateFactDifferences(currentScan, facts) : [];
                  return (
                  <li key={`${reason.check}:${reason.existingProductId}`} className="rounded-xl border border-ink/10 bg-white/70 p-3 text-xs text-stone-700">
                    <strong className="block text-ink">Istniejący produkt: {facts?.name ?? reason.existingProductId}</strong>
                    <span className="block">{[facts?.brand ?? 'Bez marki', facts?.package ?? 'Brak opakowania', facts?.market ?? 'Brak rynku', facts?.ean ?? 'Brak EAN'].join(' · ')}</span>
                    <span className="mt-1 block">{reason.check === 'ean_match' ? 'Ten sam EAN/GTIN' : reason.check === 'identity_hash_match' ? 'Ta sama tożsamość produktu' : `Podobna nazwa, marka i opakowanie · ${duplicateSimilarityPercent(reason.score)}%`}</span>
                    <span className="mt-1 block font-medium text-ink">Różnice: {differences.length > 0 ? differences.join(' · ') : 'brak rozbieżności w dostępnych kluczowych danych'}</span>
                  </li>
                  );
                })}
              </ul>
              {duplicate.allowedActions.includes('create_new') ? (
                <label className="mt-3 block text-xs font-medium text-stone-700">Opisz konkretną różnicę
                  <textarea value={duplicateDifference} onChange={(event) => setDuplicateDifference(event.currentTarget.value)} placeholder="np. inny EAN, masa, skład, wartości lub rynek" className="pro-focus-ring mt-1 min-h-20 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm" />
                </label>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="min-h-11 rounded-xl bg-ink px-4 text-sm text-white" onClick={() => void persist('open_existing')}>Tak, to ten produkt</button>
                {duplicate.allowedActions.includes('create_new') ? <button type="button" disabled={duplicateDifference.trim().length < 6} className="min-h-11 rounded-xl border border-ink/20 bg-white px-4 text-sm disabled:opacity-40" onClick={() => void persist('create_new')}>Nie, utwórz osobny</button> : null}
              </div>
            </section>
          ) : null}
          {visual ? (
            <section role="status" className={`mt-5 rounded-[20px] border p-5 ${visual.tone}`}>
              <h2 className="font-semibold">{visual.title}</h2><p className="mt-2 text-sm text-stone-700">{visual.detail}</p>
              {result?.globalCatalogContributionError ? <button type="button" className="mt-4 min-h-11 rounded-xl border border-ink/20 bg-white px-4 text-sm" onClick={() => void retryContribution()}>Ponów zgłoszenie katalogowe</button> : null}
              {result?.globalCatalogContribution?.kind === 'rate_limited' && result.globalCatalogContribution.challengeRequired ? (
                <>
                  <CatalogRiskChallenge onToken={setRiskToken} />
                  <button type="button" disabled={!riskToken || busy} className="mt-3 min-h-11 rounded-xl border border-ink/20 bg-white px-4 text-sm disabled:opacity-40" onClick={() => void retryContribution()}>Zweryfikuj i ponów</button>
                </>
              ) : null}
              {result?.globalCatalogContribution?.kind === 'rate_limited' && !result.globalCatalogContribution.challengeRequired ? (
                <button type="button" disabled={busy} className="mt-3 min-h-11 rounded-xl border border-ink/20 bg-white px-4 text-sm disabled:opacity-40" onClick={() => void retryContribution()}>
                  Ponów automatyczne przetwarzanie
                </button>
              ) : null}
              {result?.globalCatalogContribution?.kind === 'likely_duplicate' ? (
                <div className="mt-4 space-y-3">
                  {currentScan ? <div className="rounded-xl border border-ink/10 bg-white/70 p-3 text-xs text-stone-700">
                    <strong className="block text-ink">Nowy skan: {currentScan.name}</strong>
                    <span>{[currentScan.brand, currentScan.package, currentScan.market, currentScan.ean].join(' · ')}</span>
                  </div> : null}
                  <ul className="space-y-2" aria-label="Najbardziej podobne produkty">
                    {result.globalCatalogContribution.duplicateCandidates.map((candidate) => (
                      <li key={candidate.productId} className="rounded-xl border border-ink/10 bg-white/70 p-3 text-xs text-stone-700">
                        <strong className="block text-ink">{candidate.displayName ?? `Produkt ${candidate.productId}`}</strong>
                        {[candidate.brand, candidate.netQuantity, candidate.market, candidate.ean].filter(Boolean).join(' · ')}
                        <span className="mt-1 block">Zgodność {Math.round(candidate.score * 100)}% · {candidate.reasons.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="block text-xs font-medium text-stone-700">
                    Jeśli to inny produkt, opisz konkretną różnicę
                    <textarea
                      value={duplicateDifference}
                      onChange={(event) => setDuplicateDifference(event.currentTarget.value)}
                      placeholder="np. inny EAN, masa opakowania, skład, wartości odżywcze lub rynek"
                      className="pro-focus-ring mt-1 min-h-20 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="min-h-11 rounded-xl bg-ink px-4 text-sm text-white" onClick={() => void retryContribution('same')}>Tak, to ten produkt</button>
                    <button type="button" disabled={duplicateDifference.trim().length < 6} className="min-h-11 rounded-xl border border-ink/20 bg-white px-4 text-sm disabled:opacity-40" onClick={() => void retryContribution('different')}>Nie, to inny wariant</button>
                  </div>
                </div>
              ) : null}
              {result?.globalCatalogContribution?.status === 'blocked' ? (
                <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-ink/20 bg-white px-4 text-sm">
                  Dodaj wyraźniejsze zdjęcia
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      addFiles(event.currentTarget.files);
                      setSession(null);
                      setResult(null);
                    }}
                  />
                </label>
              ) : null}
            </section>
          ) : null}
        </>
      )}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-terracotta/50 bg-terracotta/10 p-3 text-sm text-terracotta">{error}</p> : null}
    </main>
  );
}
