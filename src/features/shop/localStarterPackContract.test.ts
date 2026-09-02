import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localStarterPackTotals } from './shopShipping';
import { starterPackModeFor, type ShopCountry } from '@/services/shopCountries';

/**
 * THE LOCAL STARTER PACK INVARIANTS.
 *
 * These are the rules that make a free order safe to ship: no payment, no
 * invented links, no commission, and no country going live on a client's word.
 * Each one is cheap to break in a future edit and expensive to notice in
 * production, which is exactly what a contract test is for.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const edge = read('supabase', 'functions', 'shop-local-pack', 'index.ts');
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const country = (over: Partial<ShopCountry>): ShopCountry => ({
  iso2: 'US',
  name: 'United States',
  physicalAvailable: false,
  localIntended: true,
  localLive: false,
  missingComponents: [],
  componentsRequired: 7,
  componentsReady: 7,
  ...over,
});

describe('a 0 EUR order is free, and stays free', () => {
  it('charges nothing at all', () => {
    expect(localStarterPackTotals()).toEqual({
      subtotalCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
  });

  it('never reaches a payment provider', () => {
    const code = strip(edge);
    // No 1 EUR placeholder, no fabricated session, no provider import.
    expect(code).not.toMatch(/stripe/i);
    expect(code).not.toMatch(/checkout\.sessions/i);
    expect(code).not.toMatch(/payment_intent/i);
  });

  it('writes a zero settlement total rather than leaving it pending', () => {
    expect(edge).toContain('total_cents: 0');
    expect(edge).toContain('expected_total_cents: 0');
  });
});

describe('the country gate cannot be talked around', () => {
  it('is only live when intent AND a complete mapping agree', () => {
    expect(starterPackModeFor(country({ localLive: true }))).toBe('local');
    // Intent without completeness is NOT an offer.
    expect(starterPackModeFor(country({ localIntended: true, localLive: false }))).toBe('none');
    expect(starterPackModeFor(null)).toBe('none');
  });

  it('prefers a real parcel when one is available', () => {
    expect(starterPackModeFor(country({ physicalAvailable: true, localLive: true }))).toBe(
      'physical',
    );
  });

  it('the server re-reads readiness instead of trusting the caller', () => {
    expect(edge).toContain('shop_country_local_readiness');
    expect(edge).toContain('local_starter_pack_live');
    expect(edge).toContain('local_pack_not_available');
    // The client may name a country; it may never name components or links.
    const code = strip(edge);
    expect(code).not.toMatch(/body\.components/);
    expect(code).not.toMatch(/body\.purchaseUrl/);
    expect(code).not.toMatch(/body\.supplier/);
  });

  it('requires an address, because it is reused for a later physical pack', () => {
    expect(edge).toContain('address_incomplete');
    expect(edge).toContain('shop_customer_addresses');
  });
});

describe('the PDF is reproducible, not live', () => {
  it('freezes the exact rows used into the order', () => {
    expect(edge).toContain('local_pack_snapshot');
    expect(edge).toContain('snapshot');
  });

  it('generates from the snapshot, never from current Admin rows', () => {
    const pdf = read('src', 'features', 'shop', 'localStarterPackPdf.ts');
    expect(pdf).toContain('LocalPackSnapshot');
    expect(strip(pdf)).not.toMatch(/from\s+['"]@\/lib\/supabase/);
    // The document must carry the brand address the owner asked for.
    expect(pdf).toContain('www.gellatti.com');
  });
});

describe('a free order earns no commission', () => {
  /**
   * P: acquisition attribution is PRESERVED so we can learn which partner
   * brought the user, but a 0 EUR order is not a sale and must never book the
   * 9 EUR / 19 EUR Starter Pack commission. Nothing books shop commission
   * today; this guard exists so the day something does, it cannot do it here.
   */
  it('records attribution without a payable amount', () => {
    expect(edge).toContain('LOCAL_STARTER_PACK');
    const code = strip(edge);
    expect(code).not.toMatch(/commission/i);
    expect(code).not.toMatch(/\b900\b|\b1900\b/);
  });

  it('keeps the quotable rates untouched', async () => {
    const { publicStarterPackRate, PUBLIC_STARTER_PACK_RETAIL_CENTS } =
      await import('@/features/affiliate/publicRateAuthority');
    expect(PUBLIC_STARTER_PACK_RETAIL_CENTS).toBe(5_900);
    expect(publicStarterPackRate('standard')).toBe(900);
    expect(publicStarterPackRate('gold')).toBe(1_900);
  });
});
