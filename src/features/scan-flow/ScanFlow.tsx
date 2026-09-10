/**
 * SCAN FLOW — the one shared flow of the application: camera → Scan Core → EAN/GTIN → Scan Import 2.0.
 *
 * Entered from HOME and PRO („Dodaj składnik → Skanuj”, mode `recipe`) and from Produkty
 * („Skanuj produkt”, mode `catalog`). Rules (owner, 2026-09-05):
 *   - known product → recipe: that exact product goes into the open recipe; catalog: "already
 *     exists", no duplicate;
 *   - unknown product → exact-GTIN registry evidence FIRST (name + brand are used as they are, the
 *     customer is not asked for a generic category when the code already identifies the product),
 *     then Scan Import 2.0 discovery (label photograph) for what is still missing;
 *   - still missing ice-cream data → only the minimal plain fields the customer can read off the
 *     label, prefilled from the registry where it knows them; the answer is saved as a LOCAL USER
 *     PRODUCT, private to this account, never added to the global catalogue by itself.
 * The customer always sees what the scanner is doing (state, guidance, progress, confirmation).
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
import { customerSafeNotice } from '@/copy/customerSafeNotice';
import {
  describeCaptureError,
  ScanCoreCapture,
  type CaptureFrame,
  type CaptureStatus,
} from './scanCoreCapture';
import {
  confirmationsFromFields,
  entryContextOf,
  isRecipeEntry,
  manualConfirmedScan,
  rememberGuestCode,
  takeGuestCode,
  labelPhotoRequest,
  plainFieldsFor,
  savedProductNotice,
  positionHint,
  prefillFromIdentity,
  scanFeedbackText,
  toResolvedScanProduct,
  type PlainField,
  type ResolvedScanProductLike,
  type ScanEntryContext,
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
  /** where the customer came from. Defaults from `mode` so existing call sites keep working. */
  entryContext?: ScanEntryContext;
  /** recipe mode: the exact product the recipe should receive (the picker's existing add path) */
  onResolved?: (product: ResolvedScanProductLike) => void;
  /** the return action: "Nie" in a recipe, "Wróć do demo" for a guest */
  onReturn?: () => void;
  /** a guest chose a plan from the offer screen */
  onChoosePlan?: (plan: 'home' | 'pro') => void;
  resolveLabel?: string;
  /** a saved code the customer chose to finish, from Produkty -> Niezweryfikowane */
  initialCode?: string | null;
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
  /** a guest scanned a code nobody has yet: the one screen where HOME and PRO are the answer */
  | { kind: 'guest_offer' }
  /** a recipe entry met an unknown code: exactly one question, Tak / Nie */
  | {
      kind: 'ask_add';
      session: DiscoverySession;
      code: string;
      /** everything the continuation needs, so "Tak" resumes THIS scan — no second camera run */
      web: ExactWebIdentity | null;
      next: 'finalize' | 'analyze_label' | null;
      note: string | null;
    }
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
  live: 'Szukam kodu…',
  reading: 'Odczytuję kod…',
  confirmed: 'Odczytano',
  stopped: '',
  unavailable: '',
};

const btn =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-semibold';
const btnPrimary = `${btn} bg-ink text-white disabled:opacity-40`;
const btnSecondary = `${btn} border border-ink/15 bg-white text-ink`;
const input =
  'pro-focus-ring min-h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink';

/**
 * MANDATORY at every customer-facing render of a pipeline sentence — not an opt-in prop.
 *
 * OWNER QA 2026-09-07. The scanner printed the authority's refusal verbatim on a phone:
 * „not ready: INGREDIENTS_EVIDENCE_REQUIRED, PRODUCT_SEMANTICS_UNRESOLVED, roleReadiness:REVIEW,
 * recognition:NORMAL_INGREDIENT/BASE_ONLY". The sentence is composed upstream now, but the denylist
 * stays applied HERE as well: a note is a string from the pipeline, and the next one nobody has
 * written yet must be calm by default rather than leak until someone notices.
 */
const CALM_SCAN_NOTICE =
  'Brakuje jeszcze danych z etykiety. Dodaj zdjęcie składu i tabeli wartości odżywczych albo wpisz dane ręcznie.';
const safeNote = (note: string | null | undefined): string | null =>
  customerSafeNotice(note, CALM_SCAN_NOTICE);

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

export function ScanFlow({
  mode,
  entryContext,
  onResolved,
  onReturn,
  onChoosePlan,
  resolveLabel,
  initialCode,
  intro,
}: ScanFlowProps) {
  const entry = entryContextOf(mode, entryContext);
  const [phase, setPhase] = useState<Phase>({ kind: 'camera', status: 'starting', error: null });
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [family, setFamily] = useState<CustomerFamily | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [recognized, setRecognized] = useState<ExactWebIdentity | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeRef = useRef<string | null>(null);
  /** the customer answered "Tak" for THIS scan: the question is asked once, never again mid-scan */
  const addConfirmedRef = useRef(false);
  const labelTriedRef = useRef(false);
  /*
    ONE VERDICT PER SCAN. The server returns the hash of the assessment behind every screen; a save
    sends it back so it can only persist the verdict the customer actually saw. It is sent ONLY when
    nothing has been typed since — new answers legitimately produce a new assessment, and holding a
    stale hash over them would refuse the customer's own work.
  */
  const assessmentHashRef = useRef<string | null>(null);
  const assessmentValuesRef = useRef<Record<string, string | boolean>>({});
  const valuesRef = useRef<Record<string, string | boolean>>({});
  valuesRef.current = values;
  const bindingAssessmentHash = () =>
    assessmentHashRef.current !== null && assessmentValuesRef.current === valuesRef.current
      ? assessmentHashRef.current
      : null;
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
        case 'needs_confirmation': {
          if (r.reason === 'family_confirmation' && r.sessionId) {
            const next = session ?? seedSession(r.sessionId, r.identity, []);
            const web = session ? null : identityFromEvidence(r.externalEvidence);
            if (web) {
              // the code already identifies the product: use it, and its family when the registry knows one
              setRecognized(web);
              setValues(prefillFromIdentity(web));
              setFamily(web.family);
              if (!web.publicationEligibility.eligible) {
                setPhase({
                  kind: 'label',
                  session: next,
                  note: 'Brakuje dokładnej nazwy wariantu. Zrób zdjęcie przodu opakowania.',
                });
                return;
              }
              if (web.family) {
                await finalize(
                  next,
                  {
                    customerFamily: web.family,
                    automaticEvidence: web.automaticEvidence,
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
          fail('Ten produkt wymaga jeszcze sprawdzenia. Spróbuj ponownie później.');
          return;
        }
        case 'discovered_pending': {
          const next = seedSession(r.sessionId, r.identity, r.ledger.missingCritical);
          const noteText = r.note ?? null;
          /*
            The authority's own codes arrive in `diagnostics` and are never rendered. What the flow
            still needs from them is one bit — "is the identity itself missing" — which used to be
            read out of the customer sentence with /identity/. Reading a rendered sentence for
            control flow is what tied the two together in the first place.
          */
          const diagnostics = r.diagnostics ?? [];
          // the verdict the customer is being shown; a save may persist only this one
          assessmentHashRef.current = r.assessmentHash ?? null;
          assessmentValuesRef.current = valuesRef.current;
          const afterFinalize = session !== undefined;
          if (!afterFinalize) {
            // A guest may FIND a product, never create one: no OCR, no enrichment, no Rescue, no
            // private save, no verification. An unknown code is the one screen that says why HOME
            // and PRO are worth having.
            if (entry === 'guest_demo') {
              rememberGuestCode(code);
              setPhase({ kind: 'guest_offer' });
              return;
            }
            // A recipe entry asks exactly one question. "Dodaj produkt" never asks it: the customer
            // already answered it by choosing that menu item.
            if (isRecipeEntry(entry) && !addConfirmedRef.current) {
              setPhase({
                kind: 'ask_add',
                session: next,
                code,
                web: identityFromEvidence(r.externalEvidence),
                next: r.next === 'finalize' ? 'finalize' : 'analyze_label',
                note: noteText,
              });
              return;
            }
          }
          if (afterFinalize) {
            // the authority answered: plain facts it still needs, the label it still needs, or only
            // technical readiness the customer cannot supply — then the product is reported, not looped
            const fields = plainFieldsFor(r.ledger.missingCritical, {
              needIdentity: diagnostics.some((code) => /identity/i.test(code)),
            });
            if (fields.length > 0) setPhase({ kind: 'fields', session: next, fields, note: null });
            else if (!labelTriedRef.current)
              setPhase({ kind: 'label', session: next, note: recognized ? null : noteText });
            else setPhase({ kind: 'fields', session: next, fields: [], note: null });
            return;
          }
          await continueUnknownRef.current(
            next,
            identityFromEvidence(r.externalEvidence),
            r.next === 'finalize' ? 'finalize' : 'analyze_label',
            noteText,
            ctx,
            code,
          );
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
          // Nobody signed in: the pipeline cannot start discovery, so an unknown code ends here.
          // For a demo visitor that is not a failure — it is the ONE screen that says why HOME and
          // PRO are worth having. No question, no technical reason, no missing fields.
          if (entry === 'guest_demo') {
            rememberGuestCode(code);
            setPhase({ kind: 'guest_offer' });
            return;
          }
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
    /**
     * The customer has seen what is missing and chose to save anyway / finish later. The product is
     * then kept as PM UNVERIFIED instead of being discarded. Never set on its own path.
     */
    unverified = false,
  ) {
    const port = ports?.discovery;
    if (!port) return fail('Backend nie jest skonfigurowany.');
    const r = await continueDiscovery(
      session,
      {
        type: unverified ? 'finalize_unverified' : 'finalize',
        // binding only while the customer has typed nothing since the assessment was shown
        input: { ...input, expectedAssessmentHash: bindingAssessmentHash() },
      },
      ctx,
      port,
    );
    await handleResult(r, code, ctx, session);
  }

  /**
   * What happens to a code nobody knows yet. It is ONE function so the automatic path
   * ("Dodaj produkt") and the answer to the recipe question ("Tak") cannot drift apart: the same
   * session, the same photos, the same authority call.
   */
  const continueUnknown = async (
    session: DiscoverySession,
    web: ExactWebIdentity | null,
    nextStep: 'finalize' | 'analyze_label' | null,
    note: string | null,
    ctx: RequestContext,
    code: string,
  ) => {
    if (web) {
      // Registry data may prefill the flow, but a brand/family-only title is not an exact SKU.
      setRecognized(web);
      setValues(prefillFromIdentity(web));
      setFamily(web.family);
      if (!web.publicationEligibility.eligible) {
        setPhase({
          kind: 'label',
          session,
          note: 'Brakuje dokładnej nazwy wariantu. Zrób zdjęcie przodu opakowania.',
        });
        return;
      }
      await finalize(
        session,
        { customerFamily: web.family, automaticEvidence: web.automaticEvidence },
        ctx,
        code,
      );
      return;
    }
    if (nextStep === 'finalize') {
      await finalize(session, { customerFamily: family }, ctx, code);
      return;
    }
    setPhase({ kind: 'label', session, note });
  };
  const continueUnknownRef = useRef(continueUnknown);
  continueUnknownRef.current = continueUnknown;

  const resolve = useCallback(
    async (scan: ConfirmedScan) => {
      if (!ports) return fail('Backend nie jest skonfigurowany.');
      codeRef.current = scan.value;
      labelTriedRef.current = false;
      // a new scan asks the question again; the previous answer belonged to the previous product
      addConfirmedRef.current = false;
      setBusy(true);
      setRecognized(null);
      setPhase({ kind: 'resolving', code: scan.value });
      try {
        const accountId = await getScanImportV2AccountId();
        const ctx = contextFor(accountId);
        // the exact-GTIN registry answers in about a second; the server research can take much longer —
        // show the identity as soon as it is known (the memoised port makes this a single request)
        const identity = identifyCode(scan);
        // a guest is never researched: they may FIND a product, and nothing is spent on one they
        // cannot create (owner, 2026-09-06)
        if (identity.ok && ports.external && ctx.online && entry !== 'guest_demo') {
          void ports.external
            .research(identity.identity, ctx)
            .then((ev) => {
              if (codeRef.current !== scan.value) return;
              const web = identityFromEvidence(isExternalEvidence(ev) ? ev : null);
              if (web) setRecognized((current) => current ?? web);
            })
            .catch(() => undefined);
        }
        // the same pipeline for everyone; a guest simply has no external research port, so no web
        // call, no OCR and no enrichment is spent on a product they cannot create
        const r = await runScanImportV2(
          scan,
          ctx,
          entry === 'guest_demo' ? { ...ports, external: null } : ports,
        );
        await handleResult(r, scan.value, ctx);
      } catch {
        fail('Nie udało się sprawdzić produktu. Spróbuj ponownie.');
      } finally {
        setBusy(false);
      }
    },
    [ports, handleResult, entry],
  );
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  /*
    A visitor who scanned in the demo, chose a plan and signed in must not scan the same box twice.
    So the code they read is OFFERED here — prefilled, named, one tap away — and never resolved
    behind their back. That distinction is the whole safety of this feature: the customer may have
    opened the scanner for a completely different product, and on a shared browser the person
    holding the phone may not even be the person who scanned. A guest entry never picks it up;
    that would loop them straight back to the offer they just left.
  */
  /*
    The guest offer is the ONE conversion screen in the flow, so its buttons must work from EVERY
    entry — not only from the mount that happened to pass a handler. A caller that wants to stay in
    the SPA passes `onChoosePlan`; otherwise the flow navigates itself. `window.location` needs no
    router context, which matters because this component is mounted from a portal inside the picker
    as well as from a page.
  */
  const choosePlan = (plan: 'home' | 'pro') => {
    if (onChoosePlan) return onChoosePlan(plan);
    window.location.assign(plan === 'pro' ? '/subscription?plan=pro' : '/subscription?plan=home');
  };

  /*
    SOL-045. On a computer the browser delivers the USER-facing camera (there is no environment one),
    and an un-mirrored front camera is the view another person has of you: the product moves the
    wrong way. The PREVIEW is mirrored so movement reads naturally — left is left, up is up. The
    DECODER is never mirrored: it reads the raw frame, and a mirrored barcode would not decode.
  */
  const [mirrorPreview, setMirrorPreview] = useState(false);

  const [resumedCode, setResumedCode] = useState<string | null>(null);
  useEffect(() => {
    // A code handed in by the Niezweryfikowane list is resolved straight away: the customer has
    // already chosen this product, so there is nothing to offer them a second time.
    if (initialCode) {
      const chosen = manualConfirmedScan(initialCode);
      if (chosen) {
        void resolveRef.current(chosen);
        return;
      }
    }
    if (entry === 'guest_demo') return;
    // `takeGuestCode` CONSUMES the stored code, so reading it is a side effect and belongs in an
    // effect — not in a render-phase initializer, which StrictMode may invoke twice and swallow the
    // value in. Setting state from it is therefore deliberate and runs exactly once per mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    const pending = takeGuestCode();
    if (pending && manualConfirmedScan(pending)) {
      setManual(pending);
      setResumedCode(pending);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const capture = new ScanCoreCapture({
      onConfirmed: (scan) => void resolveRef.current(scan),
      onStatus: (status) =>
        setPhase((p) => (p.kind === 'camera' && status !== 'stopped' ? { ...p, status } : p)),
      onFrame: (f) => setFrame(f),
      onMirror: (m) => setMirrorPreview(m),
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
    labelTriedRef.current = false;
    setManual('');
    setValues({});
    setFamily(null);
    setRecognized(null);
    setFrame(null);
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
      labelTriedRef.current = true;
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
      await finalize(session, { customerFamily: choice }, ctx, codeRef.current ?? '');
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

  /**
   * OWNER CONTRACT 2026-09-07 — the customer saw what is missing and chose to save anyway. Whatever
   * the pipeline did find is kept as a private, UNVERIFIED product instead of being discarded, and
   * it appears under Produkty → Niezweryfikowane where they can finish it later. This is the only
   * path that persists an unverified product: nothing does it automatically.
   */
  const saveUnverified = (session: DiscoverySession) =>
    withBusy(async () => {
      const ctx = contextFor(await getScanImportV2AccountId());
      await finalize(
        session,
        { customerFamily: family, confirmations: confirmationsFromFields(values) },
        ctx,
        codeRef.current ?? '',
        true,
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

  const recognizedLine = recognized ? (
    <p className="text-xs text-stone-600" data-testid="scan-flow-recognized">
      Rozpoznano po kodzie: <span className="font-semibold text-ink">{recognized.displayName}</span>
      {recognized.brand ? ` · ${recognized.brand}` : ''}
      {recognized.quantity ? ` · ${recognized.quantity}` : ''}
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

  // live feedback over the camera image
  const video = videoRef.current;
  const position = frame ? positionHint(frame.roi, frame.sourceW, frame.sourceH) : null;
  const feedback =
    phase.kind === 'camera'
      ? phase.error
        ? phase.error
        : phase.status === 'confirmed'
          ? 'Odczytano'
          : frame && phase.status !== 'starting'
            ? scanFeedbackText({
                state: frame.state,
                guidance: frame.guidance,
                timedOut: frame.timedOut,
                position,
                // a camera the customer cannot pick up: the PRODUCT is what moves
                fixedCamera: mirrorPreview,
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
  const success = phase.kind === 'camera' && phase.status === 'confirmed';
  /*
    The customer is told BEFORE any photo action that the picture leaves their phone, and what does
    NOT. It used to be said only on the deleted second scanner; it belongs on whichever surface
    actually uploads — and there are two of them, so it is one fragment rendered in both.
  */
  const photoPrivacyNote = (
    <p className="text-xs text-stone-600">
      Zdjęcie zostanie przesłane do analizy etykiety. Twoje ceny, dostawcy, notatki i stan
      magazynowy pozostają prywatne.
    </p>
  );
  const engaged = frame ? frame.state !== 'SEARCHING' && frame.state !== 'LOST' : false;

  return (
    <section className="space-y-4" data-testid="scan-flow" data-scan-flow-mode={mode}>
      {phase.kind === 'camera' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            {intro ?? 'Pokaż kod kreskowy produktu aparatowi.'}
          </p>
          <div
            /*
              SOL-045: the camera block had no max-width and a hard-coded PORTRAIT 3:4 aspect, so on
              the products destination it stretched to the full 1280 px canvas — a 1280x1706 video,
              taller than any desktop screen, with object-cover throwing ~58% of a 16:9 webcam frame
              out of view while the decoder analysed the whole uncropped frame. The customer aimed
              inside a box that meant nothing to the engine.
            */
            className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-black"
            hidden={phase.status === 'unavailable'}
            data-testid="scan-flow-camera"
            data-mirrored={mirrorPreview ? 'true' : 'false'}
          >
            <video
              ref={videoRef}
              className="aspect-[3/4] w-full object-cover sm:aspect-video"
              style={mirrorPreview ? { transform: 'scaleX(-1)' } : undefined}
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
            {roiBox ? (
              /*
                The engine reports the code's position in RAW frame coordinates. When the preview is
                mirrored the picture no longer matches those coordinates, so the overlay LAYER is
                mirrored with it — flipping the layer, not the box, is what moves the box's POSITION
                to the other side. Otherwise the one element that says "the code is HERE" would point
                at the opposite edge of the screen.
              */
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={mirrorPreview ? { transform: 'scaleX(-1)' } : undefined}
              >
                <div
                  className={`absolute rounded-md border-2 ${
                    success ? 'border-emerald-400 bg-emerald-400/20' : 'border-amber-300'
                  }`}
                  style={roiBox}
                />
              </div>
            ) : null}
            <div
              className={`absolute inset-x-0 bottom-0 px-3 py-2 text-center text-sm font-semibold ${
                success ? 'bg-emerald-600 text-white' : 'bg-black/55 text-white'
              }`}
              aria-live="polite"
              data-testid="scan-flow-feedback"
            >
              {/*
                The raw device zoom factor used to be printed here as „×10". It is a diagnostic
                number, it means nothing to a customer, and by the time it appeared the camera had
                already zoomed itself past the point of reading anything. Both the number and the
                zoom that produced it are gone (owner ruling 2026-09-06).
              */}
              {success ? 'Odczytano ✓' : feedback}
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
          {phase.status === 'unavailable' ? (
            <p className="text-xs text-stone-600" aria-live="polite">
              {phase.error}
            </p>
          ) : null}
          {resumedCode ? (
            <p className="text-xs text-stone-600" data-testid="scan-flow-resumed-code">
              Zaczęliśmy już skan kodu {resumedCode}. Naciśnij „Sprawdź", żeby go dokończyć — albo
              zeskanuj inny produkt.
            </p>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setResumedCode(null);
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
              onChange={(event) => {
                setManual(event.target.value);
                setResumedCode(null);
              }}
            />
            <button type="submit" className={btnSecondary} disabled={busy || !manual.trim()}>
              Sprawdź
            </button>
          </form>
        </div>
      ) : null}

      {phase.kind === 'resolving' ? (
        <div className="space-y-2" aria-live="polite">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            Odczytano ✓ <span className="font-mono font-normal">{phase.code}</span>
          </p>
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

      {/*
        A guest scanned a code nobody has yet. Nothing technical is shown — no missing fields, no
        readiness, no Product Registry — because none of it is the customer's problem here. This is
        simply where HOME and PRO are worth having.
      */}
      {phase.kind === 'guest_offer' ? (
        <div className="space-y-3" data-testid="scan-flow-guest-offer">
          <p className="text-sm font-semibold text-ink">Tego produktu jeszcze nie mamy.</p>
          <p className="text-sm text-stone-700">
            W HOME lub PRO możesz dodać własny produkt jednym skanem.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              data-testid="scan-flow-choose-home"
              onClick={() => choosePlan('home')}
            >
              Wybierz HOME
            </button>
            <button
              type="button"
              className={btnPrimary}
              data-testid="scan-flow-choose-pro"
              onClick={() => choosePlan('pro')}
            >
              Wybierz PRO
            </button>
            <button
              type="button"
              className={btnSecondary}
              data-testid="scan-flow-back-to-demo"
              onClick={() => onReturn?.()}
            >
              Wróć do demo
            </button>
          </div>
        </div>
      ) : null}

      {/*
        The one question a recipe entry asks. "Nie" returns exactly where the customer was adding
        from; "Tak" continues THIS scan — same session, same photos, no second camera run.
      */}
      {phase.kind === 'ask_add' ? (
        <div className="space-y-3" data-testid="scan-flow-ask-add">
          {recognizedLine}
          <p className="text-sm text-stone-700">
            Nie mamy jeszcze tego produktu. Czy chcesz go dodać?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              data-testid="scan-flow-ask-add-yes"
              onClick={() =>
                void withBusy(async () => {
                  addConfirmedRef.current = true;
                  const ctx = contextFor(await getScanImportV2AccountId());
                  await continueUnknownRef.current(
                    phase.session,
                    phase.web,
                    phase.next,
                    phase.note,
                    ctx,
                    phase.code,
                  );
                })
              }
            >
              Tak
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              data-testid="scan-flow-ask-add-no"
              onClick={() => onReturn?.()}
            >
              Nie
            </button>
          </div>
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
          {recognizedLine}
          <p className="text-sm text-stone-700">
            {recognized
              ? labelPhotoRequest(phase.session.missingCritical)
              : 'Nie znam jeszcze tego produktu. Zrób zdjęcie etykiety ze składem i tabelą wartości odżywczych.'}
          </p>
          {safeNote(phase.note) ? (
            <p className="text-xs text-stone-600">{safeNote(phase.note)}</p>
          ) : null}
          {photoPrivacyNote}
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
              : 'Uzupełnij brakujące dane z etykiety. Produkt zapiszemy prywatnie na Twoim koncie.'}
          </p>
          {safeNote(phase.note) ? (
            <p className="text-xs text-red-700">{safeNote(phase.note)}</p>
          ) : null}
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
              {recognized
                ? 'Produkt rozpoznany, ale nie jest jeszcze gotowy do receptury — brakuje danych, których nie da się odczytać z etykiety. Zgłoś go do weryfikacji.'
                : 'Z etykiety nie da się uzupełnić brakujących danych. Możesz zgłosić produkt do weryfikacji.'}
            </p>
          ) : null}
          {photoPrivacyNote}
          <div className="flex flex-wrap gap-2">
            {phase.fields.length > 0 ? (
              <button type="submit" className={btnPrimary} disabled={busy}>
                Zapisz jako mój produkt
              </button>
            ) : null}
            {/*
              The customer may not have the pack in front of them, or may simply not want to type.
              Their scan is not thrown away: what we did find is kept privately and listed under
              Produkty → Niezweryfikowane, where they can finish it whenever they like.
            */}
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => void saveUnverified(phase.session)}
              data-testid="scan-flow-save-unverified"
            >
              Zapisz i uzupełnij później
            </button>
            <label className={btnSecondary}>
              Zrób zdjęcie etykiety
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
          <p className="text-sm font-semibold text-ink">{savedProductNotice(phase.product)}</p>
          {recognizedLine}
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
