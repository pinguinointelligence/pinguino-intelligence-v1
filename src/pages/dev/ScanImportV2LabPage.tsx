/**
 * SCAN IMPORT 2.0 — isolated QA harness (owner step 7). NOT HOME. NOT the legacy scanner.
 *
 * Runs: confirmed scan (a fixture observation from the Scan Core engine, or a typed code as if Scan Core
 * had confirmed it) → shared ConfirmedScan contract → Scan Import 2.0 → REAL adapters (this account's
 * backend session; guests get the read-only public path) → a plain-language outcome. Label photos,
 * family confirmation and the durable discovery request drive the unknown-product lifecycle through the
 * SAME authorities the product flow uses. No business logic lives here.
 *
 * Gated: registered only under import.meta.env.DEV or VITE_SCAN_IMPORT_LAB === '1' (staging QA env).
 */
import { useEffect, useMemo, useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { createScanImportV2AppPorts, getScanImportV2AccountId } from '@/services/scanImportV2';
import {
  fromScanCoreObservation,
  type ConfirmedScan,
  type ScanCoreObservationLike,
} from '@/scan-contract/confirmedScan';
import {
  createIndexedDbStore,
  createOfflineCache,
  runScanImportV2,
  continueDiscovery,
  type DiscoverySession,
  type LabelImage,
  type RequestContext,
  type ScanImportV2Result,
} from '@/scan-import-v2';
import fixtures from '@/scan-import-v2/__fixtures__/scanCoreObservations.json';

const LAB_ENABLED = import.meta.env.DEV || import.meta.env.VITE_SCAN_IMPORT_LAB === '1';
/** the dedicated exact-identity RPC exists only once migration 20260905090000 is deployed; until then the interim search authority */
const EXACT_AUTHORITY =
  import.meta.env.VITE_SCAN_IMPORT_GTIN_RPC === '1' ? 'gtin_rpc' : 'search_rpc';
const FIXTURES = fixtures as Record<string, ScanCoreObservationLike>;
const FAMILIES = [
  'dairy',
  'fruit',
  'cocoa_chocolate',
  'nut_paste',
  'alcohol',
  'sweetener',
  'beverage',
  'technical',
  'other',
] as const;

function typedScan(value: string, symbology: ConfirmedScan['symbology']): ConfirmedScan {
  const now = Date.now();
  return {
    symbology,
    value: value.replace(/\s+/g, ''),
    rawValue: value,
    confirmation: { lane: 'consensus', agreeingFrames: 4, sources: ['manual_qa'] },
    evidence: { moduleNative: null, fill: null, mixedFormats: false },
    timing: { firstSeenAt: now, completedAt: now },
    provenance: { trackId: 'qa-typed', harnessBuild: 'scan-import-v2-lab' },
  };
}

const STAGE_PL: Record<string, string> = {
  code_known: 'Znamy kod, produktu jeszcze nie',
  commercial_identity_hypothesis: 'Mamy hipotezę, jaki to produkt (źródła zewnętrzne)',
  evidence_collected: 'Zebrane dowody z etykiety i źródeł',
  exact_sku_created: 'Nowy dokładny produkt zapisany (profil niekompletny)',
  technical_data_known: 'Dane techniczne znane',
  behaviour_bound: 'Zachowanie produktu ustalone przez autorytet',
  engine_ready: 'Gotowy do użycia w silniku',
};

function describeResult(r: ScanImportV2Result): { headline: string; lines: string[] } {
  switch (r.kind) {
    case 'resolved_exact':
      return {
        headline: `Znany produkt: ${r.product.displayName}`,
        lines: [
          `Marka: ${r.product.brand ?? '—'}`,
          `Kod produktu: ${r.product.productCode ?? '—'}`,
          `Kraj produktu: ${r.product.country ?? 'globalny'}`,
          `Źródło: ${r.provenance === 'local_cache' ? 'pamięć podręczna (offline)' : r.provenance}`,
          `Gotowość silnika: ${r.behaviour.outcome === 'classified' ? 'tak' : 'nie'}`,
          `Cena: ${r.price.state === 'known' ? `${r.price.pricePerKg} ${r.price.currency}/kg` : 'brak (koszt niekompletny, produkt ważny)'}`,
          `Zapis na koncie: ${r.import ? 'powiązany' : r.importSkipped === 'guest' ? 'gość — tylko odczyt' : r.importSkipped === 'offline' ? 'offline — bez zapisu' : '—'}`,
        ],
      };
    case 'needs_confirmation':
      return {
        headline: r.product
          ? `Produkt znany, wymaga potwierdzenia: ${r.product.displayName}`
          : 'Wymaga potwierdzenia rodziny produktu',
        lines: [`Powód: ${r.reason}`, ...(r.options ? [`Opcje: ${r.options.join(', ')}`] : [])],
      };
    case 'ambiguous':
      return {
        headline: 'Niejednoznaczny kod — kilka produktów o tym samym kodzie',
        lines: r.candidates.map(
          (c) => `${c.displayName} (${c.productCode ?? c.productId}) · ${c.strength}`,
        ),
      };
    case 'discovered_pending':
      return {
        headline: `Nieznany produkt — trwa rozpoznawanie (${STAGE_PL[r.stage] ?? r.stage})`,
        lines: [
          `Hipoteza: ${r.ledger.identity.name ?? '—'} / ${r.ledger.identity.brand ?? '—'}`,
          `Fakty: ${r.ledger.facts.length} (źródła: ${r.ledger.sourcesUsed.join(', ')})`,
          `Konflikty: ${r.ledger.conflicts.length}`,
          `Brakuje: ${r.ledger.missingCritical.join(', ') || 'nic'}`,
          `Następny krok: ${r.next === 'label_photo' ? 'zdjęcie etykiety' : 'zapis produktu'}`,
          ...(r.evidenceError ? [`Źródła zewnętrzne: ${r.evidenceError}`] : []),
          ...(r.note ? [r.note] : []),
        ],
      };
    case 'discovered_exact':
      return {
        headline: `Nowy dokładny produkt: ${r.product.displayName}`,
        lines: [
          `Etap: ${STAGE_PL[r.stage] ?? r.stage}`,
          `Gotowość silnika: ${r.engineReady ? 'tak' : 'nie (identyczność zachowana)'}`,
          `Kod produktu: ${r.product.productCode ?? '—'}`,
          ...(r.readiness.note ? [r.readiness.note] : []),
        ],
      };
    case 'discovery_requested':
      return {
        headline: 'Nieznany produkt zgłoszony do weryfikacji',
        lines: [
          `Status zgłoszenia: ${r.status}`,
          `Etap: ${STAGE_PL[r.stage] ?? r.stage}`,
          'Produkt nie jest jeszcze kanoniczny ani gotowy do silnika',
        ],
      };
    case 'unknown':
      return {
        headline: 'Nieznany kod',
        lines: ['Rozpoznawanie dostępne tylko po zalogowaniu', `Następny krok: ${r.next}`],
      };
    case 'invalid_code':
      return { headline: 'Nieprawidłowy kod', lines: [`Powód: ${r.reason}`] };
    case 'offline':
      return {
        headline: 'Brak połączenia — produkt nieznany lokalnie',
        lines: ['Zeskanuj ponownie po odzyskaniu sieci'],
      };
    case 'failed':
      return {
        headline: r.code === 'connection' ? 'Brak połączenia' : 'Nie udało się sprawdzić produktu',
        lines: [`Kod: ${r.code}`],
      };
  }
}

async function fileToLabelImage(file: File): Promise<LabelImage> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return {
    assetId: globalThis.crypto.randomUUID(),
    mime: file.type || 'image/jpeg',
    base64: btoa(binary),
    source: 'gallery',
    originalMime: file.type || 'image/jpeg',
    transformations: [],
    qualityScore: null,
  };
}

export function ScanImportV2LabPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [symbology, setSymbology] = useState<ConfirmedScan['symbology']>('EAN-13');
  const [offline, setOffline] = useState(false);
  const [country, setCountry] = useState('PL');
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>('other');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanImportV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DiscoverySession | null>(null);

  const cache = useMemo(() => createOfflineCache({ store: createIndexedDbStore() }), []);
  const ports = useMemo(
    () => createScanImportV2AppPorts({ exactAuthority: EXACT_AUTHORITY, offlineCache: cache }),
    [cache],
  );

  useEffect(() => {
    void getScanImportV2AccountId().then(setAccountId);
  }, []);

  if (!LAB_ENABLED) return <NotFoundPage />;

  const context = (): RequestContext => ({
    accountId,
    productCountry: country || null,
    online: !offline,
    surface: 'TEST',
    now: Date.now(),
  });

  const run = async (scan: ConfirmedScan) => {
    if (!ports) {
      setError('Backend nie jest skonfigurowany');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await runScanImportV2(scan, context(), ports);
      setResult(r);
      setSession(
        r.kind === 'discovered_pending'
          ? {
              sessionId: r.sessionId,
              identity: r.identity,
              result: null,
              overlayState: null,
              missingCritical: r.ledger.missingCritical,
              usage: { visionCalls: 0, webCalls: 0 },
            }
          : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const step = async (action: Parameters<typeof continueDiscovery>[1]) => {
    if (!ports?.discovery || !session) return;
    setBusy(true);
    setError(null);
    try {
      const r = await continueDiscovery(session, action, context(), ports.discovery);
      setResult(r);
      if (r.kind === 'discovered_pending')
        setSession({ ...session, missingCritical: r.ledger.missingCritical });
      if (r.kind === 'discovered_exact' || r.kind === 'discovery_requested') setSession(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = result ? describeResult(result) : null;
  return (
    <main
      style={{ maxWidth: 720, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}
    >
      <h1 style={{ fontSize: 20 }}>Scan Import 2.0 — stanowisko testowe</h1>
      <p style={{ color: '#555' }}>
        {accountId
          ? 'Zalogowano — pełna ścieżka (rozpoznawanie, zapis)'
          : 'Gość — tylko odczyt znanych produktów'}{' '}
        · autorytet dokładnego dopasowania:{' '}
        {EXACT_AUTHORITY === 'gtin_rpc'
          ? 'dedykowany (gtin)'
          : 'tymczasowy (search) — goście nie widzą znanych produktów do czasu wdrożenia migracji'}
      </p>
      <section style={{ display: 'grid', gap: 8 }}>
        <label>
          Kod (jak potwierdzony przez Scan Core)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="8402001047251"
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Symbologia
          <select
            value={symbology}
            onChange={(e) => setSymbology(e.target.value as ConfirmedScan['symbology'])}
          >
            {(['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kraj produktu (z konta, nie z języka)
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
          />
        </label>
        <label>
          <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />{' '}
          Symuluj brak sieci
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled={busy || !code} onClick={() => void run(typedScan(code, symbology))}>
            Sprawdź kod
          </button>
          {Object.entries(FIXTURES).map(([name, obs]) => (
            <button
              key={name}
              disabled={busy}
              onClick={() => {
                const c = fromScanCoreObservation(obs, 'fixture');
                if (c) void run(c);
              }}
            >
              Obserwacja Scan Core: {name}
            </button>
          ))}
        </div>
      </section>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
      {shown && (
        <section style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h2 style={{ fontSize: 17 }}>{shown.headline}</h2>
          <ul>
            {shown.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {result?.kind === 'discovered_pending' && session && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                Zdjęcie etykiety
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void fileToLabelImage(f).then((img) =>
                        step({ type: 'label', images: [img] }),
                      );
                  }}
                />
              </label>
              <label>
                Rodzina produktu
                <select
                  value={family}
                  onChange={(e) => setFamily(e.target.value as (typeof FAMILIES)[number])}
                >
                  {FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={busy}
                  onClick={() =>
                    void step({
                      type: 'finalize',
                      input: { customerFamily: family, privateOverlay: {} },
                    })
                  }
                >
                  Zapisz jako nowy produkt (przez autorytet profilu)
                </button>
                <button disabled={busy} onClick={() => void step({ type: 'request' })}>
                  Zgłoś do weryfikacji
                </button>
              </div>
            </div>
          )}
          <details style={{ marginTop: 8 }}>
            <summary>Szczegóły techniczne</summary>
            <pre style={{ fontSize: 11, overflowX: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      )}
    </main>
  );
}
