/**
 * REAL STAGING LABEL PROOF — phase 2 (finalize + rescan) on the sessions analysed in phase 1
 * (STAGING_LABEL_PROOF_2026-09-05.json). Never re-runs research or label analysis for a session that
 * already has them; analyses the one candidate whose label step was refused by the burst limit.
 * Gated by SCAN_IMPORT_V2_STAGING_LABEL=1 plus the usual env. Writes the phase-2 results into the same proof.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import { identifyCode } from '../codeIdentity';
import type { ScanImportV2Result } from '../contracts';
import { continueDiscovery } from '../discovery/discovery';
import type { CustomerFamily, DiscoverySession, LabelImage } from '../discovery/contracts';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_LABEL'] === '1';
const FAMILY: Record<string, CustomerFamily> = {
  '7622201492786': 'cocoa_chocolate',
  '8426617014032': 'other',
  '8411902004089': 'beverage',
  '8411092731130': 'beverage',
};
const PHOTO: Record<string, string> = {
  '7622201492786': 'milka-choco-mini-wafers_7622201492786.jpg',
  '8426617014032': 'haribo-favoritos_8426617014032.jpg',
  '8411902004089': 'cabreiroa-50cl_8411902004089.jpg',
  '8411092731130': 'nestea-can_8411092731130.jpg',
};

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
        note: r.note,
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

describe.skipIf(!RUN)('Scan Import 2.0 — real label proof, phase 2 (finalize + rescan)', () => {
  it('finalizes the analysed sessions through the authorities and rescans', async () => {
    const url = process.env['SUPABASE_URL']!;
    const key = process.env['SUPABASE_ANON_KEY']!;
    const dir = process.env['SCAN_IMPORT_V2_LABELS_DIR']!;
    const proofPath = join(
      process.cwd(),
      'reports',
      'scan-import-v2',
      'STAGING_LABEL_PROOF_2026-09-05.json',
    );
    const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as {
      candidates: Record<string, Record<string, unknown>>;
    };
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
    const ports = {
      ...createSupabaseV2Ports(auth as never, { exactAuthority: 'search_rpc' }),
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
    for (const [name, rec] of Object.entries(proof.candidates)) {
      const ean = String(rec['ean']);
      const idr = identifyCode(scan(ean));
      if (!idr.ok) throw new Error(idr.reason);
      const s2 = rec['step2_labelAnalysis'] as
        | { sessionId?: string; missingCritical?: string[]; next?: string }
        | undefined;
      const s1 = rec['step1_exactOrDiscovery'] as
        | { sessionId?: string; missingCritical?: string[] }
        | undefined;
      const fresh = (process.env['SCAN_IMPORT_V2_FRESH_FOR'] ?? '').split(',').includes(ean);
      const sessionId = fresh ? undefined : (s2?.sessionId ?? s1?.sessionId);
      if (fresh) {
        // the previous session's label upload was refused by the burst limit and left an asset row that blocks a retry:
        // open a fresh discovery (one more bounded research) and analyse the photo there
        const started = await runScanImportV2(scan(ean), c(), ports);
        rec['step1_exactOrDiscovery'] = summary(started);
        if (started.kind !== 'discovered_pending') {
          rec['phase2'] = `fresh discovery ended as ${started.kind}`;
          continue;
        }
        const fs: DiscoverySession = {
          sessionId: started.sessionId,
          identity: idr.identity,
          result: null,
          overlayState: null,
          missingCritical: started.ledger.missingCritical,
          usage: { visionCalls: 0, webCalls: 0 },
          recordedAt: Date.now(),
        };
        const bytes = readFileSync(join(dir, PHOTO[ean]!));
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
        try {
          const labelled = await continueDiscovery(
            fs,
            { type: 'label', images: [image] },
            c(),
            discovery,
          );
          rec['step2_labelAnalysis'] = summary(labelled);
          if (labelled.kind !== 'discovered_pending') {
            rec['phase2'] = `label step ended as ${labelled.kind}`;
            continue;
          }
          fs.missingCritical = labelled.ledger.missingCritical;
          const fin = await continueDiscovery(
            fs,
            { type: 'finalize', input: { customerFamily: FAMILY[ean]!, privateOverlay: {} } },
            c(),
            discovery,
          );
          rec['step3_finalize'] = summary(fin);
          const rescan = await runScanImportV2(scan(ean), c(Date.now() + 1), ports);
          rec['step4_rescan'] = summary(rescan);
          rec['rescanSameIdentity'] =
            fin.kind === 'discovered_exact'
              ? (rescan.kind === 'resolved_exact' || rescan.kind === 'needs_confirmation') &&
                rescan.product?.productId === fin.product.productId
              : rescan.kind === 'discovered_pending' && rescan.identity.canonicalGtin13 === ean;
          rec['phase2'] = 'done (fresh session)';
        } catch (error) {
          rec['error'] = error instanceof Error ? error.message : String(error);
        }
        continue;
      }
      if (!sessionId) {
        rec['phase2'] = 'no session to continue';
        continue;
      }
      const session: DiscoverySession = {
        sessionId,
        identity: idr.identity,
        result: null,
        overlayState: null,
        missingCritical: s2?.missingCritical ?? s1?.missingCritical ?? [],
        usage: { visionCalls: 0, webCalls: 0 },
        recordedAt: Date.now(),
      };
      delete rec['error'];
      try {
        if (!s2?.sessionId && process.env['SCAN_IMPORT_V2_SKIP_ANALYZE'] !== '1') {
          // label analysis never succeeded for this session (burst limit in phase 1) — one attempt
          const bytes = readFileSync(join(dir, PHOTO[ean]!));
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
          if (labelled.kind !== 'discovered_pending') {
            rec['phase2'] = `label step ended as ${labelled.kind}`;
            continue;
          }
          session.missingCritical = labelled.ledger.missingCritical;
        }
        const fin = await continueDiscovery(
          session,
          { type: 'finalize', input: { customerFamily: FAMILY[ean]!, privateOverlay: {} } },
          c(),
          discovery,
        );
        rec['step3_finalize'] = summary(fin);
        const rescan = await runScanImportV2(scan(ean), c(Date.now() + 1), ports);
        rec['step4_rescan'] = summary(rescan);
        if (fin.kind === 'discovered_exact') {
          const same =
            (rescan.kind === 'resolved_exact' || rescan.kind === 'needs_confirmation') &&
            rescan.product?.productId === fin.product.productId;
          rec['rescanSameIdentity'] = same;
          if (!same) {
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
        } else if (fin.kind === 'discovered_pending' && rescan.kind === 'discovered_pending') {
          rec['rescanSameIdentity'] =
            rescan.identity.canonicalGtin13 === fin.identity.canonicalGtin13;
        }
        rec['phase2'] = 'done';
      } catch (error) {
        rec['error'] = error instanceof Error ? error.message : String(error);
      }
      void name;
    }
    // phase 3 — durable candidates: one product request per identity (idempotent), then continuity from a NEW adapter
    // instance (a new browser session) must find the open request without re-spending anything
    if (process.env['SCAN_IMPORT_V2_SUBMIT_REQUESTS'] === '1') {
      const freshBrowser = createSupabaseDiscoveryPort(auth as never);
      for (const [, rec] of Object.entries(proof.candidates)) {
        const ean = String(rec['ean']);
        const idr = identifyCode(scan(ean));
        if (!idr.ok) continue;
        const s2 = rec['step2_labelAnalysis'] as { sessionId?: string } | undefined;
        const s1 = rec['step1_exactOrDiscovery'] as { sessionId?: string } | undefined;
        const sessionId = s2?.sessionId ?? s1?.sessionId ?? null;
        try {
          // rebuild the ledger from the server's session facts through the same adapter (no new research)
          const seed: DiscoverySession = {
            sessionId: sessionId ?? randomUUID(),
            identity: idr.identity,
            result: null,
            overlayState: null,
            missingCritical: [],
            usage: { visionCalls: 0, webCalls: 0 },
            recordedAt: Date.now(),
          };
          const current = await discovery.research(idr.identity, c());
          const session = current.kind === 'existing_product' ? seed : current.session;
          const req = await continueDiscovery(session, { type: 'request' }, c(), discovery);
          rec['step5_request'] = summary(req);
          const again = await runScanImportV2(scan(ean), c(Date.now() + 3), {
            ...ports,
            discovery: freshBrowser,
          });
          rec['step6_newSessionRescan'] = summary(again);
          rec['requestContinuity'] =
            req.kind === 'discovery_requested' &&
            again.kind === 'discovery_requested' &&
            again.requestId === req.requestId;
        } catch (error) {
          rec['phase3Error'] = error instanceof Error ? error.message : String(error);
        }
      }
    }
    (proof as Record<string, unknown>)['phase2RanAt'] = new Date().toISOString();
    writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
    expect(Object.keys(proof.candidates).length).toBeGreaterThan(0);
  }, 600_000);
});
