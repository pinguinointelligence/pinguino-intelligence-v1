/** In-memory ports for Scan Import 2.0 tests. Real Supabase adapters are a later, separate step. */
import type {
  BehaviourOutcome,
  CatalogPort,
  ExactCandidate,
  ImportOutcome,
  OfflineCacheEntry,
  PriceState,
  RequestContext,
  ScanImportV2Ports,
} from '../contracts';
import { NetworkError } from '../contracts';

export const product = (
  over: Partial<ExactCandidate> & Pick<ExactCandidate, 'productId' | 'ean'>,
): ExactCandidate => ({
  productCode: null,
  displayName: over.productId,
  brand: null,
  strength: 'canonical_shared',
  entityKind: 'commercial_product',
  engineReady: true,
  mapperSlotId: null,
  country: null,
  ...over,
});

/** Real canonical products (identities only; no invented winners beyond the EAN → row mapping). */
export const HACENDADO = product({
  productId: 'PR-HACENDADO',
  ean: '8402001047251',
  displayName: 'Hacendado',
  brand: 'Hacendado',
  country: 'ES',
  mapperSlotId: 'milk',
});
export const LACIATE = product({
  productId: 'PR-LACIATE',
  ean: '5900820012434',
  displayName: 'Łaciate',
  brand: 'Łaciate',
  country: 'PL',
  mapperSlotId: 'milk',
});
export const ALSACE = product({
  productId: 'PR-ALSACE',
  ean: '3262970109108',
  displayName: 'Alsace Lait',
  brand: 'Alsace Lait',
  country: 'FR',
  mapperSlotId: 'milk',
});

export class FakeCatalog implements CatalogPort {
  rows: ExactCandidate[] = [];
  offline = false;
  calls = 0;
  constructor(rows: ExactCandidate[] = []) {
    this.rows = rows;
  }
  async exactByKeys(
    keys: readonly string[],
    ctx: RequestContext,
  ): Promise<readonly ExactCandidate[]> {
    this.calls += 1;
    if (this.offline) throw new NetworkError('offline');
    return this.rows.filter(
      (r) =>
        keys.includes(r.ean) &&
        // a provisional row not linked to this account is invisible (audit §4)
        !(r.strength === 'provisional_linked' && r.productCode === `linked:${ctx.accountId}`
          ? false
          : r.entityKind === 'customer_provisional' && r.productCode !== `linked:${ctx.accountId}`),
    );
  }
}

export class FakePreferences {
  preferred = new Map<string, ExactCandidate>();
  country = new Map<string, { primary: ExactCandidate | null; fallbacks: ExactCandidate[] }>();
  async preferredExactForSlot(slotId: string, ctx: RequestContext) {
    return this.preferred.get(`${ctx.accountId}:${slotId}`) ?? null;
  }
  async countryDefaultsForSlot(slotId: string, productCountry: string | null) {
    return this.country.get(`${productCountry}:${slotId}`) ?? { primary: null, fallbacks: [] };
  }
}

export class FakeBehaviour {
  outcomes = new Map<string, BehaviourOutcome>();
  async classify(productId: string) {
    return {
      outcome: this.outcomes.get(productId) ?? ('classified' as const),
      bindingId: `binding:${productId}`,
    };
  }
}

export class FakeImporter {
  central = new Map<string, { productId: string; accounts: Set<string> }>();
  byKey = new Map<string, ImportOutcome>();
  calls = 0;
  fail = false;
  async importOrLink(input: {
    identity: { canonicalGtin13: string };
    idempotencyKey: string;
    ctx: RequestContext;
  }): Promise<ImportOutcome> {
    this.calls += 1;
    if (this.fail) throw new Error('customer_product_persistence_failed');
    const replay = this.byKey.get(input.idempotencyKey);
    if (replay) return { ...replay, created: false };
    const existing = this.central.get(input.identity.canonicalGtin13);
    let out: ImportOutcome;
    if (existing) {
      existing.accounts.add(input.ctx.accountId!);
      out = {
        kind: 'existing_product',
        productId: existing.productId,
        productCode: null,
        created: false,
      };
    } else {
      const productId = `CA-${input.identity.canonicalGtin13}`;
      this.central.set(input.identity.canonicalGtin13, {
        productId,
        accounts: new Set([input.ctx.accountId!]),
      });
      out = { kind: 'customer_added_product', productId, productCode: null, created: true };
    }
    this.byKey.set(input.idempotencyKey, out);
    return out;
  }
}

export class FakeOfflineCache {
  entries = new Map<string, OfflineCacheEntry>();
  async get(accountId: string | null, gtin13: string) {
    return this.entries.get(`${accountId}:${gtin13}`) ?? null;
  }
  async put(accountId: string | null, entry: OfflineCacheEntry) {
    this.entries.set(
      `${accountId}:${entry.candidate.ean.length === 13 ? entry.candidate.ean : entry.candidate.ean}`,
      entry,
    );
    // also index by the canonical GTIN-13 of UPC-A rows
    if (entry.candidate.ean.length === 12)
      this.entries.set(`${accountId}:0${entry.candidate.ean}`, entry);
  }
}

export class FakePrice {
  prices = new Map<string, PriceState>();
  async priceState(productId: string) {
    return (
      this.prices.get(productId) ??
      ({ state: 'missing', pricePerKg: null, currency: null, source: 'missing' } as const)
    );
  }
}

export function ports(over: Partial<ScanImportV2Ports> = {}): ScanImportV2Ports & {
  catalog: FakeCatalog;
  preferences: FakePreferences;
  behaviour: FakeBehaviour;
  importer: FakeImporter;
  offlineCache: FakeOfflineCache;
  price: FakePrice;
} {
  const base = {
    catalog: new FakeCatalog([HACENDADO, LACIATE, ALSACE]),
    preferences: new FakePreferences(),
    behaviour: new FakeBehaviour(),
    external: null,
    importer: new FakeImporter(),
    offlineCache: new FakeOfflineCache(),
    price: new FakePrice(),
    externalTimeoutMs: 50,
  };
  return { ...base, ...over } as never;
}

export const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  accountId: 'user-1',
  productCountry: 'PL',
  online: true,
  surface: 'TEST',
  now: 1_000,
  ...over,
});
