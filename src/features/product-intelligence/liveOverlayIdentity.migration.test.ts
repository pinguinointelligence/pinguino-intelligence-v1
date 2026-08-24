/**
 * Migration 20260824150000 — the last hop from a scanned or imported product to a recipe.
 *
 * Owner decision (2026-08-24 §1): do NOT put EANs on the 2088 Mapper rows to make
 * Scanner → Recipe work. Implement it through the existing Product Intelligence /
 * Catalog / Live Overlay authority instead.
 *
 * The rule this pins: a product may enter a recipe when it RESOLVES to a verified Mapper
 * identity, not only when it IS a Mapper Basement row. The Engine still runs on the
 * Mapper row's composition; nothing here writes to `mapper_basement`, nothing is
 * scanner-specific, and anything ambiguous, high-risk, technical or incompletely
 * declared is refused and left for review.
 *
 * The A–D matrix is proved against the live authority in
 * `reports/LIVE_OVERLAY_ENGINE_IDENTITY_2026-08-24.md`; this file pins the contract the
 * proofs relied on so it cannot drift silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260824150000_live_overlay_engine_identity.sql'),
  'utf8',
);
const BODY = SQL.replace(/--.*$/gm, '');
const fn = (name: string) => {
  const start = BODY.indexOf(`create or replace function public.${name}`);
  const end = BODY.indexOf('$$;', start);
  return BODY.slice(start, end);
};
const PROPOSE = fn('propose_live_overlay_mapper_identity_v1');
const AUTHORIZE = fn('authorize_live_overlay_mapper_identity_v1');

describe('the identity is proposed from evidence, never from a name', () => {
  it('requires agreement on every declared macro, within a published tolerance', () => {
    for (const field of ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt']) {
      expect(PROPOSE).toContain(`public.live_overlay_macro_tolerance_v1('${field}')`);
    }
    expect(SQL).toContain("when 'fat' then 1.5");
    expect(SQL).toContain("when 'salt' then 0.2");
    expect(SQL).toContain("when 'energyKcal' then 20");
  });

  it('B refuses to guess between two ingredients the product could equally be', () => {
    expect(PROPOSE).toContain('ambiguous_mapper_identity');
    expect(PROPOSE).toContain('if v_count > 1 then');
    expect(PROPOSE).toContain('no_agreeing_mapper_identity');
  });

  it('B requires a complete ordinary label before it decides anything', () => {
    expect(PROPOSE).toContain('ingredients_missing');
    expect(PROPOSE).toContain('allergens_missing');
    expect(PROPOSE).toContain('nutrition_per_100g_missing');
    expect(PROPOSE).toContain('declared_macros_incomplete');
  });

  it('C keeps high-risk, technical and dosage-sensitive products out of the automatic route', () => {
    expect(PROPOSE).toContain('high_risk_additive_requires_authority');
    expect(PROPOSE).toContain('technical_or_dosage_product');
    expect(PROPOSE).toContain("coalesce(m.alcohol_percent,0) = 0");
    // The vocabulary is the same list the Scanner's own validator calls high-risk.
    for (const term of ['aspartame', 'acesulfame', 'karagen', 'carrageenan', 'guma tara', 'guar']) {
      expect(SQL).toContain(`'${term}'`);
    }
  });

  it('only ever proposes a Mapper row the Engine is allowed to use', () => {
    expect(PROPOSE).toContain('m.is_active and m.approved_for_base and m.approved_for_engines');
    // The v1.0 dataset vocabulary. An exact 'verified' matches zero of 2088 rows.
    expect(PROPOSE).toContain("m.verification_status ilike 'Verified%'");
    expect(PROPOSE).not.toContain("verification_status = 'verified'");
  });

  it('writes nothing — the decision can be shown before it is taken', () => {
    expect(PROPOSE).toContain('stable security definer');
    expect(PROPOSE).not.toMatch(/\b(insert|update|delete)\s+/i);
  });
});

describe('authorization is the shared authority, not a scanner door', () => {
  it('takes a product id and computes everything else itself', () => {
    expect(AUTHORIZE).toContain('p_actor_user_id uuid,\n  p_product_id uuid');
    expect(AUTHORIZE).toContain('public.propose_live_overlay_mapper_identity_v1');
    // No client-supplied candidate, no client-supplied evidence.
    expect(AUTHORIZE).not.toContain('p_proposal');
  });

  it('never overwrites an identity somebody already decided', () => {
    expect(AUTHORIZE).toContain('mapper_identity_already_authorized');
  });

  it('re-checks Engine eligibility instead of trusting the proposal it just made', () => {
    expect(AUTHORIZE).toContain('mapper_identity_not_engine_eligible');
  });

  it('versions the identity and lets the ordinary classifier decide capability', () => {
    expect(AUTHORIZE).toContain('update public.product_behavior_bindings set is_current=false');
    expect(AUTHORIZE).toContain('public.classify_catalog_product_behavior_v2');
    expect(AUTHORIZE).toContain('behavior_reclassification_required');
    expect(AUTHORIZE).toContain('liveOverlayAuthorization');
    // The provisional row must not collide with the classified one.
    expect(AUTHORIZE).toContain("'live-overlay-provisional:'");
    expect(AUTHORIZE).toContain("'live-overlay-identity:'");
  });

  it('records the decision in the vocabulary the products table already has', () => {
    expect(AUTHORIZE).toContain("match_method='category_composition_similarity'");
    expect(AUTHORIZE).toContain("match_confidence='high'");
  });

  it('never writes to the Mapper dataset', () => {
    expect(SQL).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+)?public\.mapper_basement/i);
  });

  it('D is reachable only from the server, so both entry points share it', () => {
    expect(SQL).toContain(
      'revoke all on function public.authorize_live_overlay_mapper_identity_v1(uuid,uuid)\n  from public,anon,authenticated',
    );
    expect(SQL).toContain(
      'grant execute on function public.authorize_live_overlay_mapper_identity_v1(uuid,uuid) to service_role',
    );
  });
});

describe('both ingestion paths call the same authority', () => {
  const scanner = readFileSync(
    join(REPO, 'supabase', 'functions', 'product-scan-finalize', 'index.ts'),
    'utf8',
  );
  const catalog = readFileSync(
    join(REPO, 'supabase', 'functions', 'catalog-submit', 'index.ts'),
    'utf8',
  );
  const shared = readFileSync(
    join(REPO, 'supabase', 'functions', '_shared', 'liveOverlayIdentity.ts'),
    'utf8',
  );

  it('D: the Scanner and INTIMPORT reach it through one shared helper', () => {
    expect(scanner).toContain("from '../_shared/liveOverlayIdentity.ts'");
    expect(catalog).toContain("from '../_shared/liveOverlayIdentity.ts'");
    expect(shared).toContain('authorize_live_overlay_mapper_identity_v1');
  });

  it('a refused identity never rolls back the product that was just saved', () => {
    expect(shared).toContain('live_overlay_authorization_unavailable');
    expect(shared).toContain('catch');
  });
});
