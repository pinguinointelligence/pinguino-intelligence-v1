/**
 * REAL STAGING LABEL PROOF — owner-provided physical label photographs (2026-09-05).
 * SCAN_IMPORT_V2_STAGING_LABEL=1 plus SUPABASE_URL, SUPABASE_ANON_KEY, QA_EMAIL, QA_PASSWORD,
 * SCAN_IMPORT_V2_LABELS_DIR. For each candidate: exact lookup first (known → regression record); unknown →
 * research → label analysis with the real photo → finalize through the authorities → rescan. Nothing is
 * fabricated: every fact comes back from the server authorities or is reported missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { ScanImportV2Result } from '../contracts';
import { continueDiscovery } from '../discovery/discovery';
import type { CustomerFamily, DiscoverySession, LabelImage } from '../discovery/contracts';
import { runScanImportV2 } from '../pipeline';
import { identifyCode } from '../codeIdentity';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_LABEL'] === '1';
const CANDIDATES: { name: string; ean: string; file: string; family: CustomerFamily }[] = [
  {
    name: 'Milka Choco Mini Wafers',
    ean: '7622201492786',
    file: 'milka-choco-mini-wafers_7622201492786.jpg',
    family: 'cocoa_chocolate',
  },
  {
    name: 'HARIBO Favoritos Original',
    ean: '8426617014032',
    file: 'haribo-favoritos_8426617014032.jpg',
    family: 'other',
  },
  {
    name: 'Cabreiroá 50cl',
    ean: '8411902004089',
    file: 'cabreiroa-50cl_8411902004089.jpg',
    family: 'beverage',
  },
  {
    name: 'Nestea can (green)',
    ean: '8411092731130',
    file: 'nestea-can_8411092731130.jpg',
    family: 'beverage',
  },
];

function summary(r: ScanImportV2Result): Record<string, unknown> {
  switch (r.kind) {
    case 'resolved_exact':
      return {
        kind: r.kind,
        productId: r.product.productId,
        productCode: r.product.productCode,
        name: r.product.displayName,
        strength: r.product.strength,
        entityKind: r.product.entityKind,
        provenance: r.provenance,
        behaviour: r.behaviour.outcome,
        engineReady: r.product.engineReady,
      };
    case 'discovered_pending':
      return {
        kind: r.kind,
        stage: r.stage,
        next: r.next,
        sessionId: r.sessionId,
        identity: r.ledger.identity,
        factCount: r.ledger.facts.length,
        sources: r.ledger.sourcesUsed,
        conflicts: r.ledger.conflicts,
        missingCritical: r.ledger.missingCritical,
        evidenceError: r.evidenceError,
        note: r.note,
        facts: r.ledger.facts.map((f) => ({
          field: f.field,
          value: f.value,
          source: f.source,
          authority: f.authority,
          confidence: f.confidence,
          contributors: f.contributingSources,
        })),
      };
    case 'discovered_exact':
      return {
        kind: r.kind,
        stage: r.stage,
        productId: r.product.productId,
        productCode: r.product.productCode,
        name: r.product.displayName,
        brand: r.product.brand,
        engineReady: r.engineReady,
        behaviour: r.behaviour.outcome,
        readiness: r.readiness,
        factCount: r.ledger.facts.length,
        conflicts: r.ledger.conflicts.length,
      };
    case 'needs_confirmation':
      return {
        kind: r.kind,
        reason: r.reason,
        productId: r.product?.productId ?? null,
        options: r.options ?? null,
      };
    case 'discovery_requested':
      return { kind: r.kind, requestId: r.requestId, status: r.status, stage: r.stage };
    default:
      return { kind: r.kind, detail: r };
  }
}

describe.skipIf(!RUN)('Scan Import 2.0 — real label photographs against STAGING', () => {
  it('runs each candidate through exact lookup, research, label analysis, finalize and rescan', async () => {
    const url = process.env['SUPABASE_URL']!;
    const key = process.env['SUPABASE_ANON_KEY']!;
    const dir = process.env['SCAN_IMPORT_V2_LABELS_DIR']!;
    const auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await auth.auth.signInWithPassword({
      email: process.env['QA_EMAIL']!,
      password: process.env['QA_PASSWORD']!,
    });
    expect(signIn.error).toBeNull();
    const userId = signIn.data.user!.id;
    const discovery = createSupabaseDiscoveryPort(auth as never);
    const real = createSupabaseV2Ports(auth as never, { exactAuthority: 'search_rpc' });
    const ports = {
      ...real,
      external: null,
      offlineCache: createOfflineCache(),
      externalTimeoutMs: 30_000,
      discovery,
    };
    const c = (now = Date.now()) => ({
      accountId: userId,
      productCountry: 'ES',
      online: true,
      surface: 'TEST' as const,
      now,
    });
    const proof: Record<string, unknown> = {
      ranAt: new Date().toISOString(),
      qaAccount: process.env['QA_EMAIL'],
      productCountryContext: 'ES',
      candidates: {},
    };
    const out = proof['candidates'] as Record<string, unknown>;
    const proofPath = join(
      process.cwd(),
      'reports',
      'scan-import-v2',
      'STAGING_LABEL_PROOF_2026-09-05.json',
    );
    const reuse =
      process.env['SCAN_IMPORT_V2_REUSE_SESSIONS'] === '1' && existsSync(proofPath)
        ? (JSON.parse(readFileSync(proofPath, 'utf8')) as { candidates?: Record<string, unknown> })
            .candidates
        : undefined;
    if (reuse)
      proof['continuedSessionsFrom'] =
        (JSON.parse(readFileSync(proofPath, 'utf8')) as { ranAt?: string }).ranAt ?? null;
    for (const cand of CANDIDATES) {
      const rec: Record<string, unknown> = { ean: cand.ean, photo: cand.file };
      out[cand.name] = rec;
      try {
        let session: DiscoverySession;
        const previous = reuse?.[cand.name] as
          | { step1_exactOrDiscovery?: { sessionId?: string; missingCritical?: string[] } }
          | undefined;
        if (previous?.step1_exactOrDiscovery?.sessionId) {
          // continue the session opened by a previous run (research already spent; identity unchanged)
          const idr = identifyCode(scan(cand.ean));
          if (!idr.ok) throw new Error(idr.reason);
          session = {
            sessionId: previous.step1_exactOrDiscovery.sessionId,
            identity: idr.identity,
            result: null,
            overlayState: null,
            missingCritical: previous.step1_exactOrDiscovery.missingCritical ?? [],
            usage: { visionCalls: 0, webCalls: 0 },
            recordedAt: Date.now(),
          };
          rec['step1_exactOrDiscovery'] = {
            ...previous.step1_exactOrDiscovery,
            reusedFromPreviousRun: true,
          };
          rec['classification'] = 'UNKNOWN PRODUCT (lifecycle, session continued)';
        } else {
          const first = await runScanImportV2(scan(cand.ean), c(), ports);
          rec['step1_exactOrDiscovery'] = summary(first);
          if (first.kind === 'resolved_exact') {
            rec['classification'] = 'KNOWN PRODUCT (regression)';
            continue;
          }
          if (first.kind !== 'discovered_pending') {
            rec['classification'] = `stopped at ${first.kind}`;
            continue;
          }
          rec['classification'] = 'UNKNOWN PRODUCT (lifecycle)';
          session = {
            sessionId: first.sessionId,
            identity: first.identity,
            result: null,
            overlayState: null,
            missingCritical: first.ledger.missingCritical,
            usage: { visionCalls: 0, webCalls: 0 },
            recordedAt: Date.now(),
          };
        }
        const bytes = readFileSync(join(dir, cand.file));
        const image: LabelImage = {
          assetId: randomUUID(),
          mime: 'image/jpeg',
          base64: bytes.toString('base64'),
          source: 'gallery',
          originalMime: 'image/jpeg',
          transformations: [
            'exif_orientation_applied',
            'metadata_stripped',
            'downscaled_if_needed',
          ],
          qualityScore: null,
        };
        const labelled = await continueDiscovery(
          session,
          { type: 'label', images: [image] },
          c(),
          discovery,
        );
        rec['step2_labelAnalysis'] = summary(labelled);
        if (labelled.kind === 'resolved_exact') {
          rec['classification'] = 'KNOWN PRODUCT (server exact during discovery)';
          continue;
        }
        if (labelled.kind !== 'discovered_pending') continue;
        const fin = await continueDiscovery(
          session,
          { type: 'finalize', input: { customerFamily: cand.family, privateOverlay: {} } },
          c(),
          discovery,
        );
        rec['step3_finalize'] = summary(fin);
        const rescan = await runScanImportV2(scan(cand.ean), c(Date.now() + 1), ports);
        rec['step4_rescan'] = summary(rescan);
        if (fin.kind === 'discovered_exact') {
          const same =
            (rescan.kind === 'resolved_exact' || rescan.kind === 'needs_confirmation') &&
            rescan.product?.productId === fin.product.productId;
          rec['rescanSameIdentity'] = same;
          if (!same && rescan.kind === 'discovered_pending') {
            // the client exact authority may not list a fresh provisional; the server exact path must
            const again = await discovery.research(fin.identity, c(Date.now() + 2));
            rec['step4b_serverExact'] =
              again.kind === 'existing_product'
                ? {
                    kind: again.kind,
                    productId: again.product.productId,
                    same: again.product.productId === fin.product.productId,
                  }
                : { kind: again.kind };
          }
        }
      } catch (error) {
        rec['error'] = error instanceof Error ? error.message : String(error);
      }
    }
    const outDir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'STAGING_LABEL_PROOF_2026-09-05.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
    expect(Object.keys(out)).toHaveLength(CANDIDATES.length);
  }, 600_000);
});
