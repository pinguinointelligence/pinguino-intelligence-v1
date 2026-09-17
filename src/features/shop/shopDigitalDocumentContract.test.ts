/**
 * The 0 € document order: what CI can pin without a database.
 *
 * Live behaviour (availability modes, idempotency, owner-only download, finance access,
 * unchanged v1 reads, refused fulfilment) was exercised against the shared project in a
 * rolled-back transaction before the migration was applied; see the SHOP report.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/--.*$/gm, '');

const FUNCTION = stripComments(
  readFileSync('supabase/functions/shop-digital-document/index.ts', 'utf8'),
);
const MIGRATION = stripComments(
  readFileSync('supabase/migrations/20260917113631_shop_digital_document_orders.sql', 'utf8'),
);
const SERVICE = stripComments(readFileSync('src/services/shopDigitalDocument.ts', 'utf8'));

describe('shop-digital-document: a document order, not a parcel', () => {
  it('has no payment, address, shipping, stock, country or commission path', () => {
    expect(FUNCTION).not.toMatch(/stripe|checkout\.sessions|payment_intent/i);
    expect(FUNCTION).not.toMatch(/commission|attribution|partner/i);
    expect(FUNCTION).not.toMatch(/shop_customer_addresses|shipping_|address/i);
    expect(FUNCTION).not.toMatch(/shop_country_local_readiness|countryIso2|shop_shipping_rates/i);
    expect(FUNCTION).not.toMatch(/\b900\b|\b1900\b/);
  });

  it('authenticates the caller from the JWT and never reads an identity from the body', () => {
    expect(FUNCTION).toContain('userClient.auth.getUser()');
    expect(FUNCTION).toContain("json(401, { error: 'unauthorized' })");
    expect(FUNCTION).toContain('p_user_id: user.id');
    expect(FUNCTION).not.toMatch(/body\.(userId|user_id|email|price|amount|version|path)/);
  });

  it('lets the database decide entitlement, price and version for a closed list of documents', () => {
    expect(FUNCTION).toContain("new Set(['GELATO_BASE_INGREDIENTS'])");
    expect(FUNCTION).toContain("admin.rpc('gellatti_shop_document_order_v1'");
    expect(FUNCTION).toContain("admin.rpc('gellatti_shop_document_download_v1'");
  });

  it('signs only the path pinned in the order, briefly, and stores no link', () => {
    expect(FUNCTION).toContain('const SIGNED_URL_TTL_SECONDS = 300;');
    expect(FUNCTION).toContain(
      '.createSignedUrl(row.path, SIGNED_URL_TTL_SECONDS, { download: row.fileName })',
    );
    expect(FUNCTION).not.toMatch(/signedUrl[^\n]*\.(insert|update)\(/);
    expect(SERVICE).not.toMatch(/localStorage|sessionStorage/);
  });

  it('confirms an order only together with a working link', () => {
    expect(FUNCTION).toMatch(
      /const link = await signedDownload\(admin, user\.id, order\.orderId\);\s*if \('error' in link\)/,
    );
  });

  it('queues mail after the order, idempotently, to a closed list of app origins, never to QA addresses', () => {
    expect(FUNCTION).toContain(
      'p_idempotency_key: `digital-document:${app.environment}:${order.orderId}`',
    );
    expect(FUNCTION).toMatch(/'https:\/\/staging\.pinguinoai\.com':\s*\{\s*environment: 'staging'/);
    expect(FUNCTION).toMatch(/'https:\/\/www\.gellatti\.com':\s*\{\s*environment: 'production'/);
    expect(FUNCTION).toContain(
      'const recipient = order.qaAccount ? order.qaRecipient : customerEmail;',
    );
    expect(FUNCTION).toContain("if (!app) return { queued: false, reason: 'unknown_app_origin' };");
    expect(FUNCTION).not.toMatch(/APP_PUBLIC_ORIGIN|\?\? 'https:\/\/staging/);
  });
});

describe('migration: compatible with clients that predate the type', () => {
  it('adds the type without narrowing the existing ones', () => {
    expect(MIGRATION).toContain(
      "check (order_type in ('PHYSICAL', 'LOCAL_STARTER_PACK', 'DIGITAL_DOCUMENT'))",
    );
  });

  it('keeps document orders out of the v1 customer list, the admin parcel list and the revenue summary', () => {
    const excluded = MIGRATION.match(/o\.order_type <> 'DIGITAL_DOCUMENT'/g) ?? [];
    expect(excluded.length).toBe(3);
    for (const fn of [
      'gellatti_my_shop_orders_v1',
      'gellatti_admin_shop_orders_v1',
      'gellatti_shop_revenue_summary_v1',
    ]) {
      expect(MIGRATION).toContain(`create or replace function public.${fn}(`);
    }
  });

  it('refuses fulfilment for a document in both action overloads', () => {
    expect(
      (MIGRATION.match(/raise exception 'digital_document_has_no_fulfilment'/g) ?? []).length,
    ).toBe(2);
  });

  it('makes a document order a 0 € delivered row that can never look like a parcel', () => {
    expect(MIGRATION).toContain('constraint shop_orders_document_is_not_a_parcel');
    expect(MIGRATION).toMatch(
      /subtotal_cents = 0 and shipping_cents = 0 and tax_cents = 0 and total_cents = 0/,
    );
    expect(MIGRATION).toMatch(
      /shipping_name is null and shipping_line1 is null and shipping_country is null/,
    );
    expect(MIGRATION).toContain(
      'stripe_checkout_session_id is null and stripe_payment_intent_id is null',
    );
  });

  it('is idempotent per account per document version', () => {
    expect(MIGRATION).toMatch(
      /create unique index if not exists shop_orders_document_once_per_user_idx\s+on public\.shop_orders \(user_id, document_id\)\s+where order_type = 'DIGITAL_DOCUMENT' and status <> 'cancelled';/,
    );
  });

  it('pins orders to an immutable, undeletable registry row', () => {
    expect(MIGRATION).toContain("raise exception 'shop_document_version_is_immutable'");
    expect(MIGRATION).toMatch(/references public\.shop_digital_documents\(id\) on delete restrict/);
  });

  it('keeps availability server-side with the three states', () => {
    expect(MIGRATION).toContain("check (availability in ('OFF', 'TEST_ACCOUNTS_ONLY', 'ON'))");
    expect(MIGRATION).toContain(
      "when 'TEST_ACCOUNTS_ONLY' then auth.uid() is not null and auth.uid() = any(d.qa_user_ids)",
    );
  });

  it('gives order and download to the service role only, and the registry to nobody in the browser', () => {
    for (const signature of [
      'gellatti_shop_document_order_v1(uuid, text, text)',
      'gellatti_shop_document_download_v1(uuid, uuid)',
    ]) {
      expect(MIGRATION).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated;`,
      );
      expect(MIGRATION).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(MIGRATION).toContain(`revoke all on public.shop_digital_documents from ${role};`);
    }
    expect(MIGRATION).toContain(
      "values ('shop-documents', 'shop-documents', false, 20971520, array['application/pdf'])",
    );
  });

  it('never turns the guide into a catalogue product', () => {
    expect(MIGRATION).not.toMatch(/insert\s+into\s+public\.shop_products/i);
  });
});
