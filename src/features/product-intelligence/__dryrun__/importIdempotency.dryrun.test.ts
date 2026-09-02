/**
 * §16 second-import idempotency, on a controlled subset of the REAL Polish file.
 *
 * WHAT THIS PROVES: the real client path — parseINTIMPORT → local intelligence →
 * planIntimportImport → planIntimportDedup → importProductCatalog — run TWICE
 * against a faithful model of the canonical ingest creates nothing the second
 * time. The model is transcribed from the ingest migration itself:
 *
 *   • identity is `ean:<digits>` when an EAN is present, otherwise
 *     `identity:sha256(brand|name|category|packageSize)`;
 *   • `duplicateDecision='different'` appends `:variant:<first 16 of the payload
 *     fingerprint>`, so a CONFIRMED distinct product gets its own identity;
 *   • the payload fingerprint is sha256 over {source, input, evidence,
 *     privateOverlay} — no clock, no random, so it is stable across runs;
 *   • an ingest event keyed by (actor, source, idempotencyKey) REPLAYS its
 *     original snapshot, which still says kind='created', plus idempotent=true.
 *
 * WHAT THIS DOES NOT PROVE: the live Postgres. Reading staging's actor table is
 * blocked (it is user PII), so a real double-import needs the owner to run it
 * signed in. This covers the client contract and the documented server rules,
 * not the deployed database.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const h = vi.hoisted(() => ({ createWithIdentityResult: vi.fn(), matchAndSave: vi.fn() }));
vi.mock('@/services/products', () => ({
  createProductWithIdentityResult: h.createWithIdentityResult,
}));
vi.mock('@/services/productMapper', () => ({ matchAndSaveProduct: h.matchAndSave }));

import { parseINTIMPORT, type IntimportCandidate } from '@/data/products/intimport';
import { canonicalIngestFromLegacyProduct } from '@/services/productIngest';
import { importProductCatalog } from '@/services/productCatalogImport';
import { runIntimportLocalIntelligence, planIntimportImport } from '../intimportIntelligence';
import { planIntimportDedup } from '../intimportDedup';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';
import { buildMapperKnowledge } from '../mapperValueInference';
import type { ProductInsert } from '@/data/products/productRow';

const CSV = join(homedir(), 'Desktop', 'PL_Poland.csv');
const REPORT = resolve(__dirname, '../../../../docs/products/import_idempotency.json');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const norm = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

/** A faithful stand-in for ingest_product_v1 + the product_ingest_events table. */
function canonicalIngestModel() {
  const productsByIdentity = new Map<string, { id: string; product_code: string }>();
  const events = new Map<string, { snapshot: { kind: string; productId: string } }>();
  let seq = 0;

  return {
    productsByIdentity,
    events,
    async submit(
      input: ProductInsert,
      options: { duplicateDecision?: 'same' | 'different' | null },
    ) {
      const request = canonicalIngestFromLegacyProduct(input);
      const canonicalInput = options.duplicateDecision
        ? { ...request.input, duplicateDecision: options.duplicateDecision }
        : request.input;
      // Idempotency key: sha256 over {source, scope, input} — same shape the
      // client uses, so a replay is recognised exactly as the server would.
      const idempotencyKey = sha256(
        JSON.stringify({ source: request.source, scope: 'upsert', input: canonicalInput }),
      );
      const prior = events.get(idempotencyKey);
      if (prior) {
        // The server returns the ORIGINAL snapshot plus idempotent=true.
        return {
          product: productsById(prior.snapshot.productId),
          ingest: { ...prior.snapshot, idempotent: true },
        };
      }

      const facts = (canonicalInput as Record<string, unknown>).facts as
        | Record<string, unknown>
        | undefined;
      const ean = String((canonicalInput as Record<string, unknown>).ean ?? '').replace(/\D/g, '');
      let identity =
        ean.length >= 8
          ? `ean:${ean}`
          : `identity:${sha256(
              [
                norm((canonicalInput as Record<string, unknown>).brand),
                norm((canonicalInput as Record<string, unknown>).displayName),
                norm((canonicalInput as Record<string, unknown>).category),
                norm(facts?.packageSize),
              ].join('|'),
            )}`;
      if (options.duplicateDecision === 'different') {
        const fingerprint = sha256(
          JSON.stringify({
            source: request.source,
            input: canonicalInput,
            evidence: {},
            privateOverlay: request.privateOverlay ?? {},
          }),
        );
        identity = `${identity}:variant:${fingerprint.slice(0, 16)}`;
      }

      const existing = productsByIdentity.get(identity);
      if (existing) {
        events.set(idempotencyKey, { snapshot: { kind: 'existing', productId: existing.id } });
        return { product: existing, ingest: { kind: 'existing', productId: existing.id } };
      }
      seq += 1;
      const product = { id: `id-${seq}`, product_code: `PR-ING-${String(seq).padStart(6, '0')}` };
      productsByIdentity.set(identity, product);
      events.set(idempotencyKey, { snapshot: { kind: 'created', productId: product.id } });
      return { product, ingest: { kind: 'created', productId: product.id } };
    },
  };

  function productsById(id: string) {
    for (const product of productsByIdentity.values()) if (product.id === id) return product;
    throw new Error(`unknown product ${id}`);
  }
}

describe.runIf(existsSync(CSV) && existsSync(MAPPER_FILE))(
  'INTIMPORT second-import idempotency',
  () => {
    let model: ReturnType<typeof canonicalIngestModel>;
    beforeEach(() => {
      vi.clearAllMocks();
      model = canonicalIngestModel();
      h.createWithIdentityResult.mockImplementation((input: ProductInsert, options = {}) =>
        model.submit(input, options as { duplicateDecision?: 'same' | 'different' | null }),
      );
      h.matchAndSave.mockResolvedValue({});
    });

    it('creates nothing on the second import of the same controlled subset', async () => {
      const parsed = parseINTIMPORT(readFileSync(CSV, 'utf8'));
      const mapper = loadMapperKnowledgeRows();
      const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);

      const byId = new Map<string, IntimportCandidate>();
      for (const candidate of parsed.candidates) {
        if (candidate.sourceProductId) byId.set(candidate.sourceProductId, candidate);
      }
      // The subset the owner asked for: EAN and non-EAN, a Comprital collision
      // group, and both a composition-ready and a review product.
      const withEan = parsed.candidates
        .filter((c) => (c.ean ?? '').replace(/\D/g, '').length >= 8)
        .slice(0, 3);
      const collision = ['PL-COM-P307B', 'PL-COM-P1237']
        .map((id) => byId.get(id))
        .filter(Boolean) as IntimportCandidate[];
      const withoutEan = parsed.candidates
        .filter((c) => (c.ean ?? '').replace(/\D/g, '').length < 8 && !collision.includes(c))
        .slice(0, 5);
      const subset = [...withEan, ...withoutEan, ...collision];

      const analysed = runIntimportLocalIntelligence(subset, {}, knowledge);
      const plan = planIntimportImport(analysed.rows);
      const dedup = planIntimportDedup(subset);
      const forceDistinct = new Set(
        dedup.rows.filter((r) => r.forceDistinct).map((r) => r.rowIndex),
      );
      const insertByRow = new Map(plan.rows.map((entry) => [entry.rowIndex, entry.insert]));

      const candidates = subset.map((candidate) => ({
        rowIndex: candidate.rowIndex,
        status: 'valid' as const,
        insert: insertByRow.get(candidate.rowIndex) ?? candidate.insert,
        warnings: [],
        skipReason: null,
        forceDistinctIdentity: forceDistinct.has(candidate.rowIndex),
      }));

      const first = await importProductCatalog(candidates);
      const second = await importProductCatalog(candidates);

      const report = {
        note: 'Model kanonicznego ingestu wg migracji; NIE dowód na żywej bazie.',
        subsetSize: subset.length,
        states: plan.byState,
        forceDistinctRows: forceDistinct.size,
        firstRun: {
          created: first.created,
          existing: first.existingDuplicates,
          inBatch: first.inBatchDuplicates,
          failed: first.failed,
        },
        secondRun: {
          created: second.created,
          existing: second.existingDuplicates,
          inBatch: second.inBatchDuplicates,
          failed: second.failed,
        },
        distinctCanonicalProducts: model.productsByIdentity.size,
      };
      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

      expect(first.failed).toBe(0);
      // Every row became its own canonical product — including the collision pair.
      expect(first.created).toBe(subset.length);
      // The whole point of §16.
      expect(second.created).toBe(0);
      expect(second.existingDuplicates).toBe(subset.length);
    });
  },
);
