/**
 * SCAN FLOW — the one shared flow of the application: camera → Scan Core → EAN/GTIN → Scan Import 2.0.
 *
 * Entered from HOME and PRO („Dodaj składnik → Skanuj”, mode `recipe`), from the HOME creator's own
 * scan button, and from Produkty („Skanuj produkt”, mode `catalog`). Owner contract (2026-09-05):
 *   - known product → recipe: that exact product goes into the open recipe; catalog: "already exists";
 *   - unknown product → exact-GTIN registry evidence FIRST (name + brand used as they are, no generic
 *     category question), then label photographs (as many as needed, evidence is additive), then only
 *     the ordinary facts a customer can read off a package;
 *   - a decoded GTIN and everything learnt about it are never lost to a generic error: one failed
 *     source or one failed photograph is reported in place, with a retry, while the identity stays;
 *   - a product the authority cannot yet make recipe-ready is still SAVED PRIVATELY (engine-ready
 *     false), never globally, never as a country default;
 *   - the customer sees what the scanner does (state, guidance, digits read so far, confirmation) and
 *     never an internal code.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import {
  continueDiscovery,
  createIndexedDbStore,
  createMemoryStore,
  createOfflineCache,
  fileToLabelImage,
  identifyCode,
  identityFromEvidence,
  runScanImportV2,
  type CustomerFamily,
  type DiscoverySession,
  type ExactCandidate,
  type ExactWebIdentity,
  type ExternalEvidence,
  type FinalizeInput,
  type LabelImage,
  type RequestContext,
  type ScanImportV2Result,
} from '@/scan-import-v2';
import { createScanImportV2AppPorts, getScanImportV2AccountId } from '@/services/scanImportV2';
import {
  describeCaptureError,
  ScanCoreCapture,
  type CaptureFrame,
  type CaptureStatus,
} from './scanCoreCapture';
import {
  confirmationsFromFields,
  ledgerIdentity,
  manualConfirmedScan,
  maskedDigits,
  offerPhotoFallback,
  plainFieldsFor,
  positionHint,
  prefillFromIdentity,
  scanFeedbackText,
  toResolvedScanProduct,
  type PlainField,
  type ResolvedScanProductLike,
} from './scanFlowLogic';

/** the dedicated exact-identity authority once its migration is deployed (staging: yes); otherwise the interim path */
const EXACT_AUTHORITY =
  import.meta.env.VITE_SCAN_IMPORT_GTIN_RPC === '1' ? 'gtin_rpc' : 'search_rpc';
/** the customer must perceive the successful scan before the lookup replaces it */
const CONFIRM_DWELL_MS = 700;

const FAMILIES: readonly CustomerFamily[] = [
  'dairy',
  'fruit',
  'cocoa_chocolate',
  'nut_paste',
  'alcohol',
  'sweetener',
  'beverage',
  'technical',
  'other',
];
const FAMILY_LABEL: Record<CustomerFamily, string> = {
  dairy: 'Nabiał',
  fruit: 'Owoce',
  cocoa_chocolate: 'Kakao / czekolada',
  nut_paste: 'Orzechy / pasty',
  alcohol: 'Alkohol',
  sweetener: 'Cukier / słodzik',
  beverage: 'Napój',
  technical: 'Dodatek techniczny',
  other: 'Inne',
};

export interface ScanFlowProps {
  mode: 'recipe' | 'catalog';
  /** recipe mode: the exact product the recipe should receive (the picker's existing add path) */
  onResolved?: (product: ResolvedScanProductLike) => void;
  resolveLabel?: string;
  intro?: string;
}

export interface LabelPhoto {
  id: string;
  file: File;
  source: LabelImage['source'];
  status: 'pending' | 'analyzing' | 'done' | 'failed';
  /** plain-language reason when failed */
  error: string | null;
}

type Phase =
  | { kind: 'camera'; status: CaptureStatus; error: string | null }
  | { kind: 'confirmed'; code: string }
  | { kind: 'resolving'; code: string }
  | {
      kind: 'known';
      product: ExactCandidate;
      resolved: ResolvedScanProductLike;
      engineReady: boolean;
      fromCache: boolean;
    }
  | { kind: 'guest' }
  | { kind: 'offline' }
  | { kind: 'label'; session: DiscoverySession; notice: string | null; canSavePrivate: boolean }
  | { kind: 'family'; session: DiscoverySession; options: readonly CustomerFamily[] }
  | {
      kind: 'fields';
      session: DiscoverySession;
      fields: PlainField[];
      notice: string | null;
      canSavePrivate: boolean;
    }
  | {
      kind: 'saved';
      product: ExactCandidate;
      resolved: ResolvedScanProductLike;
      engineReady: boolean;
      privateNotReady: boolean;
    }
  | { kind: 'requested' }
  | { kind: 'error'; message: string; retry: 'lookup' | 'restart' };

const STATUS_TEXT: Record<CaptureStatus, string> = {
  starting: 'Uruchamiam aparat…',
  live: 'Szukam kodu…',
  reading: 'Odczytuję kod…',
  confirmed: 'Odczytano',
  stopped: '',
  unavailable: '',
};

const LABEL_FAILURE_TEXT: Record<string, string> = {
  burst: 'Za dużo analiz w krótkim czasie — spróbuj ponownie za minutę.',
  vision_limit: 'Limit analiz zdjęć dla tego skanu został wyczerpany.',
  asset_conflict: 'To zdjęcie było już wysłane — dodaj inne ujęcie.',
  asset_metadata: 'Nie udało się przesłać tego zdjęcia — spróbuj ponownie.',
  network: 'Brak połączenia — zdjęcie zostanie odczytane po ponowieniu.',
  provider: 'Odczyt etykiet jest chwilowo niedostępny — spróbuj za chwilę.',
  other: 'Nie udało się odczytać tego zdjęcia — spróbuj ponownie lub dodaj inne.',
};

const btn =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-semibold';
const btnPrimary = `${btn} bg-ink text-white disabled:opacity-40`;
const btnSecondary = `${btn} border border-ink/15 bg-white text-ink disabled:opacity-40`;
const input =
  'pro-focus-ring min-h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink';

function isExternalEvidence(v: unknown): v is ExternalEvidence {
  return Boolean(v) && typeof v === 'object' && Array.isArray((v as { facts?: unknown }).facts);
}

function seedSession(
  sessionId: string,
  identity: DiscoverySession['identity'],
  missingCritical: readonly string[],
): DiscoverySession {
  return {
    sessionId,
    identity,
    result: null,
    overlayState: null,
    missingCritical,
    usage: { visionCalls: 0, webCalls: 0 },
    recordedAt: Date.now(),
  };
}

async function downscaled(file: File, maxLongEdge = 1600): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export function ScanFlow({ mode, onResolved, resolveLabel, intro }: ScanFlowProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'camera', status: 'starting', error: null });
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [fallbackOffered, setFallbackOffered] = useState(false);
  const [stillNotice, setStillNotice] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [family, setFamily] = useState<CustomerFamily | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [recognized, setRecognized] = useState<ExactWebIdentity | null>(null);
  const [researched, setResearched] = useState<{
    displayName: string;
    brand: string | null;
  } | null>(null);
  const [photos, setPhotos] = useState<LabelPhoto[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureRef = useRef<ScanCoreCapture | null>(null);
  const codeRef = useRef<string | null>(null);
  const scanRef = useRef<ConfirmedScan | null>(null);
  const labelTriedRef = useRef(false);
  const refusedOnceRef = useRef(false);
  const familyRef = useRef<CustomerFamily | null>(null);
  const valuesRef = useRef<Record<string, string | boolean>>({});
  const trackedSinceRef = useRef<number | null>(null);
  const blurredSinceRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  familyRef.current = family;
  valuesRef.current = values;

  const cache = useMemo(
    () =>
      createOfflineCache({
        store: typeof indexedDB === 'undefined' ? createMemoryStore() : createIndexedDbStore(),
      }),
    [],
  );
  const ports = useMemo(
    () => createScanImportV2AppPorts({ exactAuthority: EXACT_AUTHORITY, offlineCache: cache }),
    [cache],
  );

  const contextFor = (accountId: string | null): RequestContext => ({
    accountId,
    productCountry: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    surface: 'PRO',
    now: Date.now(),
  });

  const lookupFailed = () =>
    setPhase({
      kind: 'error',
      message: 'Nie udało się połączyć z serwerem. Kod został zachowany — spróbuj ponownie.',
      retry: 'lookup',
    });

  /* ------------------------------------------------------------------------------------------ */
  /* results → phases                                                                            */
  /* ------------------------------------------------------------------------------------------ */

  const handleResult = useCallback(
    async (
      r: ScanImportV2Result,
      code: string,
      ctx: RequestContext,
      session?: DiscoverySession,
    ) => {
      switch (r.kind) {
        case 'resolved_exact':
          setPhase({
            kind: 'known',
            product: r.product,
            resolved: toResolvedScanProduct(r.product, r.behaviour.outcome === 'classified', code),
            engineReady: r.behaviour.outcome === 'classified',
            fromCache: r.provenance === 'local_cache',
          });
          return;
        case 'needs_confirmation': {
          if (r.reason === 'family_confirmation' && r.sessionId) {
            const next = session ?? seedSession(r.sessionId, r.identity, []);
            const web = session ? null : identityFromEvidence(r.externalEvidence);
            if (web) {
              setRecognized(web);
              setValues(prefillFromIdentity(web));
              setFamily(web.family);
              if (web.family) {
                await finalize(
                  next,
                  {
                    customerFamily: web.family,
                    confirmations: { productFields: web.productFields },
                  },
                  ctx,
                  code,
                );
                return;
              }
            }
            setPhase({
              kind: 'family',
              session: next,
              options: (r.options as readonly CustomerFamily[] | undefined) ?? FAMILIES,
            });
            return;
          }
          if (r.product) {
            setPhase({
              kind: 'known',
              product: r.product,
              resolved: toResolvedScanProduct(r.product, false, code),
              engineReady: false,
              fromCache: false,
            });
            return;
          }
          setPhase({
            kind: 'label',
            session: session ?? seedSession(r.sessionId ?? '', r.identity, []),
            notice: 'Ten produkt wymaga jeszcze sprawdzenia. Dodaj zdjęcie etykiety.',
            canSavePrivate: false,
          });
          return;
        }
        case 'discovered_pending': {
          const next = seedSession(r.sessionId, r.identity, r.ledger.missingCritical);
          const fromLedger = ledgerIdentity(r.ledger);
          if (fromLedger) setResearched(fromLedger);
          const afterFinalize = session !== undefined;
          if (afterFinalize) {
            // the authority answered: plain facts it still needs, or only technical readiness the
            // customer cannot supply — the product is then saved privately, never looped on photos
            refusedOnceRef.current = true;
            const fields = plainFieldsFor(r.ledger.missingCritical, {
              needIdentity: /identity/.test(r.note ?? ''),
            });
            if (fields.length > 0)
              setPhase({
                kind: 'fields',
                session: next,
                fields,
                notice: null,
                canSavePrivate: true,
              });
            else if (!labelTriedRef.current)
              setPhase({
                kind: 'label',
                session: next,
                notice:
                  'Do użycia w recepturze brakuje jeszcze danych z etykiety — zrób zdjęcie składu i tabeli wartości odżywczych.',
                canSavePrivate: true,
              });
            else
              setPhase({
                kind: 'label',
                session: next,
                notice:
                  'Odczytaliśmy etykietę. Część parametrów technicznych wymaga jeszcze weryfikacji przed użyciem w recepturze — produkt możesz zapisać prywatnie.',
                canSavePrivate: true,
              });
            return;
          }
          const web = identityFromEvidence(r.externalEvidence);
          if (web) {
            setRecognized(web);
            setValues(prefillFromIdentity(web));
            setFamily(web.family);
            await finalize(
              next,
              { customerFamily: web.family, confirmations: { productFields: web.productFields } },
              ctx,
              code,
            );
            return;
          }
          if (r.next === 'finalize') {
            await finalize(next, { customerFamily: familyRef.current }, ctx, code);
            return;
          }
          setPhase({ kind: 'label', session: next, notice: null, canSavePrivate: false });
          return;
        }
        case 'discovered_exact':
          setPhase({
            kind: 'saved',
            product: r.product,
            resolved: toResolvedScanProduct(r.product, r.engineReady, code),
            engineReady: r.engineReady,
            privateNotReady: r.privateNotReady === true || !r.engineReady,
          });
          return;
        case 'discovery_requested':
          setPhase({ kind: 'requested' });
          return;
        case 'ambiguous':
          setPhase({
            kind: 'error',
            message: 'Kilka produktów ma ten sam kod. Wybierz właściwy w wyszukiwarce produktów.',
            retry: 'restart',
          });
          return;
        case 'unknown':
          if (ctx.accountId === null) setPhase({ kind: 'guest' });
          else lookupFailed();
          return;
        case 'invalid_code':
          setPhase({
            kind: 'error',
            message: 'To nie wygląda na poprawny kod kreskowy. Spróbuj jeszcze raz.',
            retry: 'restart',
          });
          return;
        case 'offline':
          setPhase({ kind: 'offline' });
          return;
        case 'failed':
        default:
          lookupFailed();
      }
    },
    // finalize is a per-render closure over the same ports; listing it would only re-create this callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function finalize(
    session: DiscoverySession,
    inputArg: FinalizeInput,
    ctx: RequestContext,
    code: string,
  ) {
    const port = ports?.discovery;
    if (!port) return lookupFailed();
    try {
      const r = await continueDiscovery(session, { type: 'finalize', input: inputArg }, ctx, port);
      await handleResult(r, code, ctx, session);
    } catch {
      // the authority could not be reached: the session and everything learnt stay; retry in place
      setPhase({
        kind: 'label',
        session,
        notice:
          'Nie udało się zapisać produktu — sprawdź połączenie i spróbuj ponownie. Zdjęcia i dane zostały zachowane.',
        canSavePrivate: refusedOnceRef.current,
      });
    }
  }

  const resolve = useCallback(
    async (scan: ConfirmedScan) => {
      if (!ports)
        return setPhase({
          kind: 'error',
          message: 'Backend nie jest skonfigurowany.',
          retry: 'restart',
        });
      codeRef.current = scan.value;
      scanRef.current = scan;
      labelTriedRef.current = false;
      refusedOnceRef.current = false;
      setBusy(true);
      setPhotos([]);
      setResearched(null);
      setPhase({ kind: 'resolving', code: scan.value });
      try {
        const accountId = await getScanImportV2AccountId();
        const ctx = contextFor(accountId);
        // the exact-GTIN registry answers in about a second; the server research can take much longer —
        // show the identity as soon as it is known (the memoised port makes this a single request)
        const identity = identifyCode(scan);
        if (identity.ok && ports.external && ctx.online) {
          void ports.external
            .research(identity.identity, ctx)
            .then((ev) => {
              if (codeRef.current !== scan.value) return;
              const web = identityFromEvidence(isExternalEvidence(ev) ? ev : null);
              if (web) setRecognized((current) => current ?? web);
            })
            .catch(() => undefined);
        }
        const r = await runScanImportV2(scan, ctx, ports);
        if (codeRef.current !== scan.value) return; // a newer scan replaced this one
        await handleResult(r, scan.value, ctx);
      } catch {
        lookupFailed();
      } finally {
        setBusy(false);
      }
    },
    [ports, handleResult],
  );
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  /* ------------------------------------------------------------------------------------------ */
  /* camera                                                                                      */
  /* ------------------------------------------------------------------------------------------ */

  useEffect(() => {
    if (phase.kind !== 'camera') return;
    const video = videoRef.current;
    if (!video || !ScanCoreCapture.supported()) {
      setPhase((p) =>
        p.kind === 'camera'
          ? {
              ...p,
              status: 'unavailable',
              error: 'Aparat nie jest dostępny w tej przeglądarce. Wpisz kod z opakowania.',
            }
          : p,
      );
      return;
    }
    setFrame(null);
    setFallbackOffered(false);
    setStillNotice(null);
    trackedSinceRef.current = null;
    blurredSinceRef.current = null;
    let dwell: ReturnType<typeof setTimeout> | null = null;
    const capture = new ScanCoreCapture({
      onConfirmed: (scan) => {
        // the customer must see the success before the lookup takes the screen
        setRecognized(null);
        setPhase({ kind: 'confirmed', code: scan.value });
        dwell = setTimeout(() => void resolveRef.current(scan), CONFIRM_DWELL_MS);
      },
      onStatus: (status) =>
        setPhase((p) => (p.kind === 'camera' && status !== 'stopped' ? { ...p, status } : p)),
      onFrame: (f) => {
        const now = Date.now();
        const tracked = f.state !== 'SEARCHING' && f.state !== 'LOST';
        if (tracked) trackedSinceRef.current ??= now;
        else trackedSinceRef.current = null;
        if (f.digits && f.digits.reads > 0) trackedSinceRef.current = now; // a read resets the clock
        const blurred = typeof f.sharpRel === 'number' && f.sharpRel < 0.5;
        if (blurred) blurredSinceRef.current ??= now;
        else blurredSinceRef.current = null;
        setFrame(f);
        if (
          !fallbackOffered &&
          offerPhotoFallback({
            blurredForMs: blurredSinceRef.current ? now - blurredSinceRef.current : 0,
            trackedWithoutReadMs: trackedSinceRef.current ? now - trackedSinceRef.current : 0,
            focusControl: f.focusControl,
            formFactor: f.formFactor,
          })
        )
          setFallbackOffered(true);
      },
      onError: () =>
        setPhase((p) =>
          p.kind === 'camera'
            ? { ...p, error: 'Odczyt kodu nie działa w tej przeglądarce. Wpisz kod z opakowania.' }
            : p,
        ),
    });
    captureRef.current = capture;
    capture.start(video).catch((error: unknown) => {
      setPhase((p) =>
        p.kind === 'camera'
          ? { ...p, status: 'unavailable', error: describeCaptureError(error) }
          : p,
      );
    });
    return () => {
      if (dwell) clearTimeout(dwell);
      capture.stop();
      captureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === 'camera']);

  const restart = () => {
    labelTriedRef.current = false;
    refusedOnceRef.current = false;
    setManual('');
    setValues({});
    setFamily(null);
    setRecognized(null);
    setResearched(null);
    setPhotos([]);
    setFrame(null);
    setPhase({ kind: 'camera', status: 'starting', error: null });
  };

  const retryLookup = () => {
    const scan = scanRef.current;
    if (scan) void resolve(scan);
    else restart();
  };

  const submitManual = () => {
    const scan = manualConfirmedScan(manual);
    if (!scan)
      return setPhase({
        kind: 'error',
        message: 'Kod powinien mieć 8, 12 lub 13 cyfr.',
        retry: 'restart',
      });
    void resolve(scan);
  };

  const decodeStill = async (file: File) => {
    const capture = captureRef.current;
    if (!capture) return;
    setStillNotice('Odczytuję kod ze zdjęcia…');
    const ok = await capture.decodeStill(file).catch(() => false);
    if (!ok)
      setStillNotice(
        'Nie udało się odczytać kodu z tego zdjęcia — zrób ostrzejsze ujęcie kodu albo wpisz cyfry.',
      );
  };

  /* ------------------------------------------------------------------------------------------ */
  /* discovery steps (label photographs are additive; a failed one is retried alone)             */
  /* ------------------------------------------------------------------------------------------ */

  const setPhoto = (id: string, patch: Partial<LabelPhoto>) =>
    setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const analyzePhoto = async (session: DiscoverySession, photo: LabelPhoto) => {
    const port = ports?.discovery;
    if (!port) return;
    setPhoto(photo.id, { status: 'analyzing', error: null });
    const ctx = contextFor(await getScanImportV2AccountId());
    let r: ScanImportV2Result;
    try {
      const image = await fileToLabelImage(await downscaled(photo.file), photo.source);
      r = await continueDiscovery(session, { type: 'label', images: [image] }, ctx, port);
    } catch {
      setPhoto(photo.id, { status: 'failed', error: LABEL_FAILURE_TEXT['network']! });
      return;
    }
    if (r.kind === 'discovered_pending' && r.labelError) {
      setPhoto(photo.id, {
        status: 'failed',
        error: LABEL_FAILURE_TEXT[r.labelError.reason] ?? LABEL_FAILURE_TEXT['other']!,
      });
      return;
    }
    setPhoto(photo.id, { status: 'done', error: null });
    labelTriedRef.current = true;
    if (r.kind === 'discovered_pending') {
      // the label was read: the authority decides what is still missing
      const next = seedSession(r.sessionId, r.identity, r.ledger.missingCritical);
      await finalize(
        next,
        {
          customerFamily: familyRef.current,
          confirmations: confirmationsFromFields(valuesRef.current),
        },
        ctx,
        codeRef.current ?? '',
      );
      return;
    }
    await handleResult(r, codeRef.current ?? '', ctx);
  };

  const addPhoto = (session: DiscoverySession, file: File, source: LabelImage['source']) => {
    const photo: LabelPhoto = { id: newId(), file, source, status: 'pending', error: null };
    setPhotos((list) => [...list, photo]);
    queueRef.current = queueRef.current
      .then(() => analyzePhoto(session, photo))
      .catch(() => undefined);
  };

  const retryPhoto = (session: DiscoverySession, id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (!photo) return;
    queueRef.current = queueRef.current
      .then(() => analyzePhoto(session, { ...photo, status: 'pending', error: null }))
      .catch(() => undefined);
  };

  const withBusy = async (work: () => Promise<void>, onError: () => void) => {
    setBusy(true);
    try {
      await work();
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  };

  const chooseFamily = (session: DiscoverySession, choice: CustomerFamily) =>
    withBusy(
      async () => {
        setFamily(choice);
        const ctx = contextFor(await getScanImportV2AccountId());
        await finalize(
          session,
          { customerFamily: choice, confirmations: confirmationsFromFields(valuesRef.current) },
          ctx,
          codeRef.current ?? '',
        );
      },
      () =>
        setPhase({
          kind: 'family',
          session,
          options: FAMILIES,
        }),
    );

  const submitFields = (session: DiscoverySession, fields: PlainField[]) =>
    withBusy(
      async () => {
        const missing = fields.filter((f) => {
          if (!f.required) return false;
          if (f.key === 'displayName' || f.key === 'brand') return false;
          const v = valuesRef.current[f.key];
          return typeof v !== 'string' || v.trim() === '';
        });
        if (missing.length > 0) {
          setPhase({
            kind: 'fields',
            session,
            fields,
            notice: `Uzupełnij: ${missing.map((f) => f.label).join(', ')}.`,
            canSavePrivate: refusedOnceRef.current,
          });
          return;
        }
        const ctx = contextFor(await getScanImportV2AccountId());
        await finalize(
          session,
          {
            customerFamily: familyRef.current,
            confirmations: confirmationsFromFields(valuesRef.current),
          },
          ctx,
          codeRef.current ?? '',
        );
      },
      () =>
        setPhase({
          kind: 'fields',
          session,
          fields,
          notice: 'Nie udało się zapisać — spróbuj ponownie. Wpisane dane zostały zachowane.',
          canSavePrivate: refusedOnceRef.current,
        }),
    );

  /** owner contract: the exact product is kept privately even when not recipe-ready */
  const savePrivately = (session: DiscoverySession) =>
    withBusy(
      async () => {
        const ctx = contextFor(await getScanImportV2AccountId());
        await finalize(
          session,
          {
            customerFamily: familyRef.current ?? 'other',
            confirmations: {
              ...confirmationsFromFields(valuesRef.current),
              packageEvidenceExhausted: true,
            },
            savePrivateNotReady: true,
          },
          ctx,
          codeRef.current ?? '',
        );
      },
      () =>
        setPhase({
          kind: 'label',
          session,
          notice: 'Nie udało się zapisać — spróbuj ponownie. Dane zostały zachowane.',
          canSavePrivate: true,
        }),
    );

  const requestVerification = (session: DiscoverySession) =>
    withBusy(
      async () => {
        const port = ports?.discovery;
        if (!port) return;
        const ctx = contextFor(await getScanImportV2AccountId());
        const r = await continueDiscovery(session, { type: 'request' }, ctx, port);
        await handleResult(r, codeRef.current ?? '', ctx);
      },
      () =>
        setPhase({
          kind: 'label',
          session,
          notice: 'Nie udało się wysłać zgłoszenia — spróbuj ponownie.',
          canSavePrivate: refusedOnceRef.current,
        }),
    );

  /* ------------------------------------------------------------------------------------------ */
  /* view pieces                                                                                 */
  /* ------------------------------------------------------------------------------------------ */

  const productCard = (p: ExactCandidate) => (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <p className="text-sm font-semibold text-ink">{p.displayName}</p>
      {p.brand ? <p className="text-xs text-stone-600">{p.brand}</p> : null}
    </div>
  );

  const recognizedLine = recognized ? (
    <p className="text-xs text-stone-600" data-testid="scan-flow-recognized">
      Rozpoznano po kodzie: <span className="font-semibold text-ink">{recognized.displayName}</span>
      {recognized.brand ? ` · ${recognized.brand}` : ''}
      {recognized.quantity ? ` · ${recognized.quantity}` : ''}
    </p>
  ) : researched ? (
    <p className="text-xs text-stone-600" data-testid="scan-flow-recognized">
      Rozpoznano: <span className="font-semibold text-ink">{researched.displayName}</span>
      {researched.brand ? ` · ${researched.brand}` : ''}
      {codeRef.current ? ` · ${codeRef.current}` : ''}
    </p>
  ) : codeRef.current && phase.kind !== 'camera' && phase.kind !== 'confirmed' ? (
    <p className="text-xs text-stone-600" data-testid="scan-flow-code">
      Kod: <span className="font-mono">{codeRef.current}</span>
    </p>
  ) : null;

  const addButton = (resolved: ResolvedScanProductLike, engineReady: boolean) =>
    mode === 'recipe' && onResolved ? (
      <div className="mt-3 space-y-2">
        {!engineReady ? (
          <p className="text-xs text-stone-600">
            Ten produkt nie ma jeszcze wszystkich danych potrzebnych do receptury.
          </p>
        ) : null}
        <button
          type="button"
          className={btnPrimary}
          disabled={!engineReady || busy}
          onClick={() => onResolved(resolved)}
        >
          {resolveLabel ?? 'Dodaj do receptury'}
        </button>
      </div>
    ) : null;

  const againButton = (
    <button type="button" className={btnSecondary} onClick={restart} disabled={busy}>
      Skanuj kolejny
    </button>
  );

  const photoInput = (
    session: DiscoverySession,
    label: string,
    source: LabelImage['source'],
    primary: boolean,
    capture: boolean,
  ) => (
    <label className={primary ? btnPrimary : btnSecondary}>
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const f = event.target.files?.[0];
          event.target.value = '';
          if (f) addPhoto(session, f, source);
        }}
      />
    </label>
  );

  const photoList = (session: DiscoverySession) =>
    photos.length > 0 ? (
      <ul className="space-y-1" data-testid="scan-flow-photos">
        {photos.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs text-stone-700">
            <span className="font-semibold">Zdjęcie {i + 1}:</span>
            <span>
              {p.status === 'pending'
                ? 'czeka'
                : p.status === 'analyzing'
                  ? 'odczytuję…'
                  : p.status === 'done'
                    ? 'odczytane ✓'
                    : (p.error ?? 'nie udało się')}
            </span>
            {p.status === 'failed' ? (
              <button
                type="button"
                className="pro-focus-ring rounded-full border border-ink/15 bg-white px-3 py-1 text-xs font-semibold text-ink"
                disabled={busy}
                onClick={() => retryPhoto(session, p.id)}
              >
                Ponów to zdjęcie
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null;

  const privateSaveButton = (session: DiscoverySession) => (
    <button
      type="button"
      className={btnPrimary}
      disabled={busy}
      onClick={() => void savePrivately(session)}
      data-testid="scan-flow-save-private"
    >
      Zapisz prywatnie
    </button>
  );

  // live feedback over the camera image
  const video = videoRef.current;
  const now = Date.now();
  const position = frame ? positionHint(frame.roi, frame.sourceW, frame.sourceH) : null;
  const digitsView = frame ? maskedDigits(frame.digits) : null;
  const feedback =
    phase.kind === 'camera'
      ? phase.error
        ? phase.error
        : frame && phase.status !== 'starting'
          ? scanFeedbackText({
              state: frame.state,
              guidance: frame.guidance,
              timedOut: frame.timedOut,
              position,
              sharpRel: frame.sharpRel,
              focusControl: frame.focusControl,
              formFactor: frame.formFactor,
              readingAxis: frame.readingAxis,
              trackedWithoutReadMs: trackedSinceRef.current ? now - trackedSinceRef.current : 0,
            })
          : STATUS_TEXT[phase.status]
      : '';
  let roiBox: { left: number; top: number; width: number; height: number } | null = null;
  if (frame?.roi && video && video.videoWidth && video.videoHeight && video.clientWidth) {
    const scale = Math.max(
      video.clientWidth / video.videoWidth,
      video.clientHeight / video.videoHeight,
    );
    const offX = (video.clientWidth - video.videoWidth * scale) / 2;
    const offY = (video.clientHeight - video.videoHeight * scale) / 2;
    roiBox = {
      left: offX + frame.roi.x * scale,
      top: offY + frame.roi.y * scale,
      width: frame.roi.w * scale,
      height: frame.roi.h * scale,
    };
  }
  const engaged = frame ? frame.state !== 'SEARCHING' && frame.state !== 'LOST' : false;
  const showCamera = phase.kind === 'camera' || phase.kind === 'confirmed';
  const success = phase.kind === 'confirmed';

  return (
    <section className="space-y-4" data-testid="scan-flow" data-scan-flow-mode={mode}>
      {showCamera ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            {intro ?? 'Pokaż kod kreskowy produktu aparatowi.'}
          </p>
          <div
            className="relative overflow-hidden rounded-2xl bg-black"
            hidden={phase.kind === 'camera' && phase.status === 'unavailable'}
            data-testid="scan-flow-camera"
          >
            <video
              ref={videoRef}
              className="aspect-[3/4] w-full object-cover"
              muted
              playsInline
              autoPlay
            />
            {/* guide frame: where the code should be */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute left-[12%] top-[32%] h-[36%] w-[76%] rounded-xl border-2 ${
                success ? 'border-emerald-400' : engaged ? 'border-amber-300' : 'border-white/70'
              } ${engaged || success ? '' : 'border-dashed'}`}
            />
            {/* the code the engine is tracking */}
            {roiBox && !success ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute rounded-md border-2 border-amber-300"
                style={roiBox}
              />
            ) : null}
            {/* digits the decoder has actually read so far */}
            {digitsView && !success ? (
              <div
                className="absolute inset-x-0 top-2 text-center font-mono text-base tracking-[0.2em] text-white drop-shadow"
                data-testid="scan-flow-digits"
              >
                {digitsView.text}
              </div>
            ) : null}
            <div
              className={`absolute inset-x-0 bottom-0 px-3 py-2 text-center text-sm font-semibold ${
                success ? 'bg-emerald-600 text-white' : 'bg-black/55 text-white'
              }`}
              aria-live="polite"
              data-testid="scan-flow-feedback"
            >
              {success ? (
                <>
                  Odczytano ✓{' '}
                  <span className="font-mono font-normal">
                    {phase.kind === 'confirmed' ? phase.code : ''}
                  </span>
                </>
              ) : (
                feedback
              )}
              {frame && frame.zoomLevel > 1 && !success ? (
                <span className="ml-2 text-xs font-normal opacity-80">×{frame.zoomLevel}</span>
              ) : null}
            </div>
            {frame && engaged && !success ? (
              <div className="absolute inset-x-0 bottom-9 h-1 bg-white/25" aria-hidden="true">
                <div
                  className="h-1 bg-amber-300 transition-[width] duration-150"
                  style={{ width: `${Math.round(frame.progress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
          {phase.kind === 'camera' && phase.status === 'unavailable' ? (
            <p className="text-xs text-stone-600" aria-live="polite">
              {phase.error}
            </p>
          ) : null}
          {phase.kind === 'camera' && (fallbackOffered || phase.status === 'unavailable') ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="scan-flow-still">
              {phase.status !== 'unavailable' ? (
                <label className={btnSecondary}>
                  Zrób zdjęcie kodu
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => {
                      const f = event.target.files?.[0];
                      event.target.value = '';
                      if (f) void decodeStill(f);
                    }}
                  />
                </label>
              ) : null}
              {stillNotice ? <span className="text-xs text-stone-600">{stillNotice}</span> : null}
              {!stillNotice && frame && frame.focusControl !== 'continuous' ? (
                <span className="text-xs text-stone-600">
                  Jeśli kamera nie łapie ostrości, zrób zdjęcie kodu.
                </span>
              ) : null}
            </div>
          ) : null}
          {phase.kind === 'camera' ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitManual();
              }}
            >
              <input
                className={input}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Wpisz kod z opakowania"
                aria-label="Kod kreskowy z opakowania"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
              />
              <button type="submit" className={btnSecondary} disabled={busy || !manual.trim()}>
                Sprawdź
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {phase.kind === 'resolving' ? (
        <div className="space-y-2" aria-live="polite">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            Odczytano ✓ <span className="font-mono font-normal">{phase.code}</span>
          </p>
          {recognizedLine}
          <p className="text-sm text-stone-700">Sprawdzam produkt…</p>
        </div>
      ) : null}

      {phase.kind === 'known' ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">
            {mode === 'catalog'
              ? 'Ten produkt już jest w katalogu — nie tworzymy duplikatu.'
              : 'Znaleziono produkt.'}
          </p>
          {productCard(phase.product)}
          {phase.fromCache ? (
            <p className="text-xs text-stone-600">Rozpoznano z pamięci urządzenia (offline).</p>
          ) : null}
          {!phase.engineReady ? (
            <p className="text-xs text-stone-600">
              Produkt jest zapisany. Do użycia w recepturze wymaga jeszcze weryfikacji.
            </p>
          ) : null}
          {addButton(phase.resolved, phase.engineReady)}
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'guest' ? (
        <div className="space-y-3">
          {recognizedLine}
          <p className="text-sm text-stone-700">
            Nie znam tego produktu. Zaloguj się, aby go rozpoznać i zapisać na swoim koncie.
          </p>
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'offline' ? (
        <div className="space-y-3">
          {recognizedLine}
          <p className="text-sm text-stone-700">
            Brak połączenia. Znane produkty działają offline; nowy produkt rozpoznamy po odzyskaniu
            sieci.
          </p>
          <button type="button" className={btnSecondary} onClick={retryLookup} disabled={busy}>
            Spróbuj ponownie
          </button>
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'label' ? (
        <div className="space-y-3">
          {recognizedLine}
          <p className="text-sm text-stone-700">
            {phase.notice ??
              (recognized
                ? 'Brakuje jeszcze danych z etykiety. Zrób zdjęcia składu i tabeli wartości odżywczych — możesz dodać kilka zdjęć.'
                : 'Nie znam jeszcze tego produktu. Zrób zdjęcia etykiety: przód opakowania, skład i tabelę wartości odżywczych.')}
          </p>
          {photoList(phase.session)}
          <div className="flex flex-wrap gap-2">
            {photoInput(
              phase.session,
              photos.length ? 'Dodaj kolejne zdjęcie' : 'Zrób zdjęcie',
              'camera_manual',
              true,
              true,
            )}
            {photoInput(phase.session, 'Z galerii', 'gallery', false, false)}
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() =>
                setPhase({
                  kind: 'fields',
                  session: phase.session,
                  fields: plainFieldsFor(phase.session.missingCritical, {
                    needIdentity: !recognized,
                  }),
                  notice: null,
                  canSavePrivate: phase.canSavePrivate,
                })
              }
            >
              Wpiszę dane ręcznie
            </button>
            {phase.canSavePrivate ? privateSaveButton(phase.session) : null}
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => void requestVerification(phase.session)}
            >
              Zgłoś do weryfikacji
            </button>
          </div>
        </div>
      ) : null}

      {phase.kind === 'family' ? (
        <div className="space-y-3">
          {recognizedLine}
          <p className="text-sm text-stone-700">
            {recognized ? `Co to za produkt? (${recognized.displayName})` : 'Co to za produkt?'}
          </p>
          <div className="flex flex-wrap gap-2">
            {phase.options.map((option) => (
              <button
                key={option}
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={() => void chooseFamily(phase.session, option)}
              >
                {FAMILY_LABEL[option] ?? option}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase.kind === 'fields' ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitFields(phase.session, phase.fields);
          }}
        >
          {recognizedLine}
          <p className="text-sm text-stone-700">
            {recognized
              ? 'Sprawdź dane z etykiety i uzupełnij brakujące. Produkt zapiszemy prywatnie na Twoim koncie.'
              : 'Uzupełnij dane z etykiety. Produkt zapiszemy prywatnie na Twoim koncie.'}
          </p>
          {phase.notice ? <p className="text-xs text-red-700">{phase.notice}</p> : null}
          {photoList(phase.session)}
          {phase.fields.map((field) => (
            <label key={field.key} className="block text-xs text-stone-700">
              <span className="mb-1 block font-semibold">
                {field.label}
                {field.unit ? ` (${field.unit})` : ''}
              </span>
              {field.kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={values[field.key] === true}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [field.key]: event.target.checked }))
                  }
                />
              ) : field.kind === 'select' ? (
                <select
                  className={input}
                  value={typeof values[field.key] === 'string' ? String(values[field.key]) : ''}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [field.key]: event.target.value }))
                  }
                >
                  <option value="">—</option>
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : field.kind === 'textarea' ? (
                <textarea
                  className={`${input} min-h-24 py-2`}
                  value={typeof values[field.key] === 'string' ? String(values[field.key]) : ''}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [field.key]: event.target.value }))
                  }
                />
              ) : (
                <input
                  className={input}
                  type="text"
                  inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                  value={typeof values[field.key] === 'string' ? String(values[field.key]) : ''}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [field.key]: event.target.value }))
                  }
                />
              )}
            </label>
          ))}
          {phase.fields.length === 0 ? (
            <p className="text-xs text-stone-600">
              Rozpoznaliśmy produkt i zapisaliśmy dane z etykiety. Część parametrów technicznych
              wymaga jeszcze weryfikacji przed użyciem w recepturze — produkt możesz zapisać
              prywatnie.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {phase.fields.length > 0 ? (
              <button type="submit" className={btnPrimary} disabled={busy}>
                Zapisz jako mój produkt
              </button>
            ) : null}
            {phase.canSavePrivate ? privateSaveButton(phase.session) : null}
            {photoInput(phase.session, 'Zrób zdjęcie etykiety', 'camera_manual', false, true)}
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => void requestVerification(phase.session)}
            >
              Zgłoś do weryfikacji
            </button>
          </div>
        </form>
      ) : null}

      {phase.kind === 'saved' ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink" data-testid="scan-flow-saved">
            {phase.privateNotReady
              ? 'Produkt zapisany prywatnie.'
              : 'Zapisano jako Twój produkt (prywatny, widoczny tylko na Twoim koncie).'}
          </p>
          {recognizedLine}
          {productCard(phase.product)}
          {phase.privateNotReady ? (
            <p className="text-xs text-stone-600">
              Produkt jest zapisany. Do użycia w recepturze wymaga jeszcze weryfikacji.
            </p>
          ) : null}
          {addButton(phase.resolved, phase.engineReady)}
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'requested' ? (
        <div className="space-y-3">
          {recognizedLine}
          <p className="text-sm text-stone-700">
            Zgłoszono do weryfikacji. Damy znać, gdy produkt będzie gotowy.
          </p>
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div className="space-y-3">
          {recognizedLine}
          <p className="text-sm text-red-700">{phase.message}</p>
          <div className="flex flex-wrap gap-2">
            {phase.retry === 'lookup' ? (
              <button type="button" className={btnPrimary} onClick={retryLookup} disabled={busy}>
                Spróbuj ponownie
              </button>
            ) : null}
            <button type="button" className={btnSecondary} onClick={restart} disabled={busy}>
              Skanuj ponownie
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
