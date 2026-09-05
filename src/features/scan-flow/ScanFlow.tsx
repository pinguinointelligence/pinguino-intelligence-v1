/**
 * SCAN FLOW — the one shared flow of the application: camera → Scan Core → EAN/GTIN → Scan Import 2.0.
 *
 * Entered from HOME and PRO („Dodaj składnik → Skanuj”, mode `recipe`) and from Produkty
 * („Skanuj produkt”, mode `catalog`). Rules (owner, 2026-09-05):
 *   - known product → recipe: that exact product goes into the open recipe; catalog: "already
 *     exists", no duplicate;
 *   - unknown product → Scan Import 2.0 discovery (internet evidence, then a label photograph);
 *   - still missing ice-cream data → only the minimal plain fields the customer can read off the
 *     label; the answer is saved as a LOCAL USER PRODUCT, private to this account, never added to
 *     the global catalogue by itself.
 * No technical parameter is ever shown. Mobile and web run the same code.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import {
  continueDiscovery,
  createIndexedDbStore,
  createMemoryStore,
  createOfflineCache,
  fileToLabelImage,
  runScanImportV2,
  type CustomerFamily,
  type DiscoverySession,
  type ExactCandidate,
  type FinalizeInput,
  type LabelImage,
  type RequestContext,
  type ScanImportV2Result,
} from '@/scan-import-v2';
import { createScanImportV2AppPorts, getScanImportV2AccountId } from '@/services/scanImportV2';
import { describeCaptureError, ScanCoreCapture, type CaptureStatus } from './scanCoreCapture';
import {
  confirmationsFromFields,
  manualConfirmedScan,
  plainFieldsFor,
  toResolvedScanProduct,
  type PlainField,
  type ResolvedScanProductLike,
} from './scanFlowLogic';

/** the dedicated exact-identity authority once its migration is deployed (staging: yes); otherwise the interim path */
const EXACT_AUTHORITY =
  import.meta.env.VITE_SCAN_IMPORT_GTIN_RPC === '1' ? 'gtin_rpc' : 'search_rpc';

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

type Phase =
  | { kind: 'camera'; status: CaptureStatus; error: string | null }
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
  | { kind: 'label'; session: DiscoverySession; note: string | null }
  | { kind: 'family'; session: DiscoverySession; options: readonly CustomerFamily[] }
  | { kind: 'fields'; session: DiscoverySession; fields: PlainField[]; note: string | null }
  | {
      kind: 'saved';
      product: ExactCandidate;
      resolved: ResolvedScanProductLike;
      engineReady: boolean;
    }
  | { kind: 'requested' }
  | { kind: 'error'; message: string };

const STATUS_TEXT: Record<CaptureStatus, string> = {
  starting: 'Uruchamiam aparat…',
  live: 'Pokaż kod kreskowy. Szukam kodu…',
  reading: 'Widzę kod, odczytuję…',
  confirmed: 'Kod odczytany.',
  stopped: '',
  unavailable: '',
};

const btn =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-semibold';
const btnPrimary = `${btn} bg-ink text-white disabled:opacity-40`;
const btnSecondary = `${btn} border border-ink/15 bg-white text-ink`;
const input =
  'pro-focus-ring min-h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink';

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

export function ScanFlow({ mode, onResolved, resolveLabel, intro }: ScanFlowProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'camera', status: 'starting', error: null });
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [family, setFamily] = useState<CustomerFamily | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeRef = useRef<string | null>(null);
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

  const fail = (message: string) => setPhase({ kind: 'error', message });

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
        case 'needs_confirmation':
          if (r.reason === 'family_confirmation' && r.sessionId) {
            setPhase({
              kind: 'family',
              session: session ?? seedSession(r.sessionId, r.identity, []),
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
          fail('Ten produkt wymaga jeszcze sprawdzenia. Spróbuj ponownie później.');
          return;
        case 'discovered_pending': {
          const next = seedSession(r.sessionId, r.identity, r.ledger.missingCritical);
          const noteText = r.note ?? null;
          const afterFinalize = session !== undefined;
          if (afterFinalize) {
            // the authority answered: either it still needs the label, or it named plain facts
            const fields = plainFieldsFor(r.ledger.missingCritical, {
              needIdentity: /identity/.test(noteText ?? ''),
            });
            if (fields.length > 0) setPhase({ kind: 'fields', session: next, fields, note: null });
            else setPhase({ kind: 'label', session: next, note: noteText });
            return;
          }
          if (r.next === 'finalize') {
            await finalize(next, { customerFamily: family }, ctx, code);
            return;
          }
          setPhase({ kind: 'label', session: next, note: noteText });
          return;
        }
        case 'discovered_exact':
          setPhase({
            kind: 'saved',
            product: r.product,
            resolved: toResolvedScanProduct(r.product, r.engineReady, code),
            engineReady: r.engineReady,
          });
          return;
        case 'discovery_requested':
          setPhase({ kind: 'requested' });
          return;
        case 'ambiguous':
          fail('Kilka produktów ma ten sam kod. Wybierz właściwy w wyszukiwarce produktów.');
          return;
        case 'unknown':
          if (ctx.accountId === null) setPhase({ kind: 'guest' });
          else fail('Nie udało się rozpoznać tego produktu. Spróbuj jeszcze raz.');
          return;
        case 'invalid_code':
          fail('To nie wygląda na poprawny kod kreskowy. Spróbuj jeszcze raz.');
          return;
        case 'offline':
          setPhase({ kind: 'offline' });
          return;
        default:
          fail('Nie udało się sprawdzić produktu. Spróbuj ponownie.');
      }
    },
    // finalize is a per-render closure over the same ports/ctx; listing it would only re-create this callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [family],
  );

  async function finalize(
    session: DiscoverySession,
    input: FinalizeInput,
    ctx: RequestContext,
    code: string,
  ) {
    const port = ports?.discovery;
    if (!port) return fail('Backend nie jest skonfigurowany.');
    const r = await continueDiscovery(session, { type: 'finalize', input }, ctx, port);
    await handleResult(r, code, ctx, session);
  }

  const resolve = useCallback(
    async (scan: ConfirmedScan) => {
      if (!ports) return fail('Backend nie jest skonfigurowany.');
      codeRef.current = scan.value;
      setBusy(true);
      setPhase({ kind: 'resolving', code: scan.value });
      try {
        const accountId = await getScanImportV2AccountId();
        const ctx = contextFor(accountId);
        const r = await runScanImportV2(scan, ctx, ports);
        await handleResult(r, scan.value, ctx);
      } catch {
        fail('Nie udało się sprawdzić produktu. Spróbuj ponownie.');
      } finally {
        setBusy(false);
      }
    },
    [ports, handleResult],
  );
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

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
    const capture = new ScanCoreCapture({
      onConfirmed: (scan) => void resolveRef.current(scan),
      onStatus: (status) =>
        setPhase((p) => (p.kind === 'camera' && status !== 'stopped' ? { ...p, status } : p)),
      onError: () =>
        setPhase((p) =>
          p.kind === 'camera'
            ? { ...p, error: 'Odczyt kodu nie działa w tej przeglądarce. Wpisz kod z opakowania.' }
            : p,
        ),
    });
    capture.start(video).catch((error: unknown) => {
      setPhase((p) =>
        p.kind === 'camera'
          ? { ...p, status: 'unavailable', error: describeCaptureError(error) }
          : p,
      );
    });
    return () => capture.stop();
  }, [phase.kind]);

  const restart = () => {
    setManual('');
    setValues({});
    setFamily(null);
    setPhase({ kind: 'camera', status: 'starting', error: null });
  };

  const submitManual = () => {
    const scan = manualConfirmedScan(manual);
    if (!scan) return fail('Kod powinien mieć 8, 12 lub 13 cyfr.');
    void resolve(scan);
  };

  const withBusy = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      fail('Coś poszło nie tak. Spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  };

  const sendLabel = (session: DiscoverySession, file: File, source: LabelImage['source']) =>
    withBusy(async () => {
      const port = ports?.discovery;
      if (!port) return fail('Backend nie jest skonfigurowany.');
      const ctx = contextFor(await getScanImportV2AccountId());
      const image = await fileToLabelImage(await downscaled(file), source);
      const r = await continueDiscovery(session, { type: 'label', images: [image] }, ctx, port);
      if (r.kind === 'discovered_pending') {
        // the label was read: let the authority decide what is still missing (plain fields, not another photo)
        const next = seedSession(r.sessionId, r.identity, r.ledger.missingCritical);
        await finalize(next, { customerFamily: family }, ctx, codeRef.current ?? '');
        return;
      }
      await handleResult(r, codeRef.current ?? '', ctx);
    });

  const chooseFamily = (session: DiscoverySession, choice: CustomerFamily) =>
    withBusy(async () => {
      setFamily(choice);
      const ctx = contextFor(await getScanImportV2AccountId());
      await finalize(
        session,
        { customerFamily: choice, confirmations: confirmationsFromFields(values) },
        ctx,
        codeRef.current ?? '',
      );
    });

  const submitFields = (session: DiscoverySession, fields: PlainField[]) =>
    withBusy(async () => {
      const missing = fields.filter((f) => {
        if (!f.required) return false;
        if (f.key === 'displayName' || f.key === 'brand') return false;
        const v = values[f.key];
        return typeof v !== 'string' || v.trim() === '';
      });
      if (missing.length > 0) {
        setPhase({
          kind: 'fields',
          session,
          fields,
          note: `Uzupełnij: ${missing.map((f) => f.label).join(', ')}.`,
        });
        return;
      }
      const ctx = contextFor(await getScanImportV2AccountId());
      await finalize(
        session,
        { customerFamily: family, confirmations: confirmationsFromFields(values) },
        ctx,
        codeRef.current ?? '',
      );
    });

  /** no usable photograph: ask the authority now and let the customer type what is missing */
  const enterManually = (session: DiscoverySession) =>
    withBusy(async () => {
      const ctx = contextFor(await getScanImportV2AccountId());
      await finalize(session, { customerFamily: family }, ctx, codeRef.current ?? '');
    });

  const requestVerification = (session: DiscoverySession) =>
    withBusy(async () => {
      const port = ports?.discovery;
      if (!port) return fail('Backend nie jest skonfigurowany.');
      const ctx = contextFor(await getScanImportV2AccountId());
      const r = await continueDiscovery(session, { type: 'request' }, ctx, port);
      await handleResult(r, codeRef.current ?? '', ctx);
    });

  const productCard = (p: ExactCandidate) => (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <p className="text-sm font-semibold text-ink">{p.displayName}</p>
      {p.brand ? <p className="text-xs text-stone-600">{p.brand}</p> : null}
    </div>
  );

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

  return (
    <section className="space-y-4" data-testid="scan-flow" data-scan-flow-mode={mode}>
      {phase.kind === 'camera' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            {intro ?? 'Pokaż kod kreskowy produktu aparatowi.'}
          </p>
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full rounded-2xl bg-black object-cover"
            muted
            playsInline
            autoPlay
            hidden={phase.status === 'unavailable'}
          />
          <p className="text-xs text-stone-600" aria-live="polite">
            {phase.error ?? STATUS_TEXT[phase.status]}
          </p>
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
        </div>
      ) : null}

      {phase.kind === 'resolving' ? (
        <p className="text-sm text-stone-700" aria-live="polite">
          Sprawdzam produkt…
        </p>
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
          {addButton(phase.resolved, phase.engineReady)}
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'guest' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Nie znam tego produktu. Zaloguj się, aby go rozpoznać i zapisać na swoim koncie.
          </p>
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'offline' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Brak połączenia. Znane produkty działają offline; nowy produkt rozpoznamy po odzyskaniu
            sieci.
          </p>
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'label' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Nie znam jeszcze tego produktu. Zrób zdjęcie etykiety ze składem i tabelą wartości
            odżywczych.
          </p>
          {phase.note ? <p className="text-xs text-stone-600">{phase.note}</p> : null}
          <div className="flex flex-wrap gap-2">
            <label className={btnPrimary}>
              Zrób zdjęcie
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const f = event.target.files?.[0];
                  if (f) void sendLabel(phase.session, f, 'camera_manual');
                }}
              />
            </label>
            <label className={btnSecondary}>
              Dodaj zdjęcie
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const f = event.target.files?.[0];
                  if (f) void sendLabel(phase.session, f, 'gallery');
                }}
              />
            </label>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => void enterManually(phase.session)}
            >
              Wpiszę dane ręcznie
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => void requestVerification(phase.session)}
            >
              Zgłoś do weryfikacji
            </button>
          </div>
          {busy ? <p className="text-xs text-stone-600">Odczytuję etykietę…</p> : null}
        </div>
      ) : null}

      {phase.kind === 'family' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">Co to za produkt?</p>
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
          <p className="text-sm text-stone-700">
            Uzupełnij brakujące dane z etykiety. Produkt zapiszemy prywatnie na Twoim koncie.
          </p>
          {phase.note ? <p className="text-xs text-red-700">{phase.note}</p> : null}
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
                  type={field.kind === 'number' ? 'text' : 'text'}
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
              Z etykiety nie da się uzupełnić brakujących danych. Możesz zgłosić produkt do
              weryfikacji.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {phase.fields.length > 0 ? (
              <button type="submit" className={btnPrimary} disabled={busy}>
                Zapisz jako mój produkt
              </button>
            ) : null}
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
          <p className="text-sm font-semibold text-ink">
            Zapisano jako Twój produkt (prywatny, widoczny tylko na Twoim koncie).
          </p>
          {productCard(phase.product)}
          {addButton(phase.resolved, phase.engineReady)}
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'requested' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Zgłoszono do weryfikacji. Damy znać, gdy produkt będzie gotowy.
          </p>
          {againButton}
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div className="space-y-3">
          <p className="text-sm text-red-700">{phase.message}</p>
          <button type="button" className={btnSecondary} onClick={restart}>
            Spróbuj ponownie
          </button>
        </div>
      ) : null}
    </section>
  );
}
