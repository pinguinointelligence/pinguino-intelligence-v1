/**
 * The physical shop order paths — `shop-checkout` (a paid parcel) and `shop-local-pack` (the 0 EUR local pack) — ask
 * the same Billing authority as the 0 € PDF before they create anything (owner, 2026-09-18: PUBLIC VIEW for everyone,
 * ORDER only with an active HOME or PRO plan).
 *
 * PREPARED, NOT APPLIED: these functions serve production today, so the gate is deployed with the production release,
 * after the frontend that understands `plan_required` is live (docs/deploy/SHOP_ORDER_PLAN_GATE_PHYSICAL.md).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decideShopOrderPlan,
  PLAN_CHECK_FAILED,
  PLAN_REQUIRED,
  type PlanAuthority,
} from '../../supabase/functions/_shared/shopPlanGate.ts';

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A stand-in for the service-role client that records what was asked and answers like the database would. */
const authority = (answer: { data: unknown; error: unknown }) => {
  const calls: Array<{ fn: string; args: { p_user_id: string } }> = [];
  const client: PlanAuthority = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
  };
  return { client, calls };
};

/* The three real entitlement states used for staging QA, as `gellatti_has_paid_access_v1` answers them for the QA
   accounts on the shared project: admin@ has no entitlement, home@ has home/admin_grant, pro@ has pro/admin_grant. */
const NO_PLAN = { data: false, error: null };
const HOME = { data: true, error: null };
const PRO = { data: true, error: null };

describe('one gate for every physical order, asked of the existing Billing authority', () => {
  it('asks gellatti_has_paid_access_v1 for exactly the signed-in account, nothing else', async () => {
    const { client, calls } = authority(HOME);
    await decideShopOrderPlan(client, 'user-1');
    expect(calls).toEqual([{ fn: 'gellatti_has_paid_access_v1', args: { p_user_id: 'user-1' } }]);
  });

  it('refuses an account without HOME or PRO with 403 plan_required', async () => {
    expect(await decideShopOrderPlan(authority(NO_PLAN).client, 'admin')).toEqual({
      allowed: false,
      status: 403,
      error: PLAN_REQUIRED,
    });
  });

  it('lets HOME and PRO order', async () => {
    expect(await decideShopOrderPlan(authority(HOME).client, 'home')).toEqual({ allowed: true });
    expect(await decideShopOrderPlan(authority(PRO).client, 'pro')).toEqual({ allowed: true });
  });

  it('fails closed: only a real `true` is a yes, and an unreachable authority is not one', async () => {
    for (const data of [null, undefined, 'true', 1, {}]) {
      expect(await decideShopOrderPlan(authority({ data, error: null }).client, 'x')).toMatchObject(
        { allowed: false, error: PLAN_REQUIRED },
      );
    }
    expect(
      await decideShopOrderPlan(authority({ data: true, error: { message: 'boom' } }).client, 'x'),
    ).toEqual({ allowed: false, status: 503, error: PLAN_CHECK_FAILED });
  });

  it('is pure: no IO of its own, no Deno APIs, no second subscription rule', () => {
    const gate = stripComments(readFileSync('supabase/functions/_shared/shopPlanGate.ts', 'utf8'));
    expect(gate).not.toMatch(/\bimport\b|Deno\.|fetch\(/);
    expect(gate).not.toMatch(/entitlements|customer_subscriptions|price|plan_name|email|stripe/i);
  });
});

describe.each([
  {
    name: 'shop-checkout',
    firstEffects: [
      'req.json()',
      ".from('shop_products')",
      ".from('shop_orders')",
      '.insert(',
      'checkout.sessions',
    ],
  },
  {
    name: 'shop-local-pack',
    firstEffects: [
      'req.json()',
      ".from('shop_country_local_readiness')",
      ".from('shop_customer_addresses')",
      ".from('shop_orders')",
      '.insert(',
      'gellatti_enqueue_email_v1',
    ],
  },
])('$name asks for the plan before it creates anything', ({ name, firstEffects }) => {
  const source = stripComments(readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'));
  const gate = source.indexOf('const plan = await decideShopOrderPlan(admin, user.id);');

  it('imports the shared gate and answers its refusal as is', () => {
    expect(source).toContain("import { decideShopOrderPlan } from '../_shared/shopPlanGate.ts';");
    expect(gate).toBeGreaterThan(-1);
    expect(source).toContain('if (!plan.allowed) return json(plan.status, { error: plan.error });');
  });

  it('checks right after authenticating the caller from the JWT', () => {
    expect(source.indexOf('auth.getUser()')).toBeGreaterThan(-1);
    expect(source.indexOf('auth.getUser()')).toBeLessThan(gate);
  });

  it('checks before the body, the catalogue, any write, any mail or any payment session', () => {
    for (const effect of firstEffects) {
      const at = source.indexOf(effect);
      expect(at, effect).toBeGreaterThan(-1);
      expect(gate, effect).toBeLessThan(at);
    }
  });

  it('keeps one service-role client and no subscription logic of its own', () => {
    expect(source.match(/SUPABASE_SERVICE_ROLE_KEY/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(
      /from\('entitlements'\)|customer_subscriptions|price_id|plan_name|hasHome|hasPro|qa_user_ids/,
    );
  });
});
