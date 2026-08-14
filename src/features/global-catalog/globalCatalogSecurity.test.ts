import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260813110000_global_product_catalog.sql'),
  'utf8',
);
const hardening = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260813110100_global_product_catalog_trust_hardening.sql'),
  'utf8',
);
const canonicalRoot = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260813110300_canonical_product_root_and_ingest.sql'),
  'utf8',
);
const edge = fs.readFileSync(path.join(ROOT, 'supabase/functions/catalog-submit/index.ts'), 'utf8');
const picker = fs.readFileSync(
  path.join(ROOT, 'src/features/ingredient-builder/ProductPickerPopover.tsx'),
  'utf8',
);
const ingredientService = fs.readFileSync(path.join(ROOT, 'src/services/ingredients.ts'), 'utf8');
const productionFiles = fs
  .readdirSync(path.join(ROOT, 'src/features/production-workspace'))
  .map((file) =>
    fs.readFileSync(path.join(ROOT, 'src/features/production-workspace', file), 'utf8'),
  )
  .join('\n');

describe('global catalog RLS and trust boundaries', () => {
  it('keeps shared facts read-only and verification fields service-controlled', () => {
    expect(migration).toContain('global_catalog_products_read');
    expect(migration).toContain('grant select on public.global_catalog_products');
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*global_catalog_products/i);
    expect(migration).toContain("status in ('verified','manual_unverified','blocked')");
    expect(migration).toContain(
      'revoke all on function public.submit_owned_product_to_global_catalog',
    );
    expect(migration).toContain(
      'grant execute on function public.submit_owned_product_to_global_catalog',
    );
    expect(migration).toContain('to service_role');
  });

  it('owner-scopes favorites, recent use, market preferences and submissions', () => {
    expect(migration).toContain('global_catalog_favorites_own');
    expect(migration).toContain('global_catalog_recent_own');
    expect(migration).toContain('account_product_market_preferences_own');
    expect(migration).toContain('global_catalog_submissions_own_read');
    expect(migration.match(/auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration).toContain("entity_kind='commercial_product' and exists");
    expect(migration).toContain("entity_kind='pi_base' and exists");
  });

  it('keeps private price/supplier/notes/stock out of the shared schema', () => {
    const sharedCore = migration.slice(
      migration.indexOf('create table if not exists public.global_catalog_products'),
      migration.indexOf('create table if not exists public.global_catalog_favorites'),
    );
    expect(sharedCore).not.toMatch(
      /customer_price|private_price|supplier|internal_notes|purchase_history|stock|negotiated/i,
    );
    expect(hardening).toContain('private_data.user_id=auth.uid()');
    expect(hardening).toContain('private_data.private_price,private_data.currency');
  });

  it('enforces rate and risk signals server-side, not through UI assumptions', () => {
    expect(edge).toContain('Deno.serve');
    expect(edge).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(edge).toContain('auth.getUser');
    expect(edge).toContain('x-forwarded-for');
    expect(edge).toContain('HMAC');
    expect(edge).toContain('TURNSTILE_SECRET_KEY');
    expect(edge).toContain("service.rpc('ingest_product_v1'");
    expect(edge).not.toContain("service.rpc('begin_global_catalog_submission'");
    expect(edge).not.toContain("service.rpc('submit_owned_product_to_global_catalog_v2'");
    expect(migration).toContain('reserve_global_catalog_rate_slot');
    expect(migration).toContain("'ip_risk'");
    expect(migration).toContain("'device_risk'");
    expect(migration).toContain("'duplicate_payload'");
    expect(migration).toContain('p_risk_challenge_passed');
    expect(migration).toContain("'challengeRequired'");
  });

  it('derives image evidence server-side and archives originals without trusting browser pHashes', () => {
    expect(edge).toContain("from('ocr_intake_images')");
    expect(edge).toContain("from('product-intake-images')");
    expect(edge).toContain("from('global-catalog-evidence')");
    expect(edge).toContain('perceptualHash(bytes');
    expect(edge).toContain('imagePhashes: evidence.imagePhashes');
    expect(edge).not.toMatch(/body\.imagePhashes/);
    expect(migration).toContain('global_catalog_phash_distance');
    expect(migration).toContain('archivedImagePaths');
    expect(migration).toContain("'global-catalog-evidence'");
  });

  it('never trusts a customer-writable private matched_basement_id as Engine authority', () => {
    expect(migration).toContain('join public.verification_signoffs');
    expect(migration).toContain('join public.mapper_basement');
    expect(migration).toContain('m.approved_for_engines');
    expect(migration).not.toContain('mapped_ingredient_id,v_product.matched_basement_id');
    expect(migration).toContain('v_mapped_ingredient_id');
  });

  it('binds Engine mapping to an exact signoff, source product and current verified Mapper row', () => {
    expect(hardening).toContain('global_catalog_engine_mappings');
    expect(hardening).toContain('signoff is not bound to this catalog product source');
    expect(hardening).toContain("s.status='pi_verified'");
    expect(hardening).toContain("c.state='verified'");
    expect(hardening).toContain('s.revision=c.revision');
    expect(hardening).toContain('s.policy_version=c.policy_version');
    expect(hardening).toContain(
      'catalog_version_id uuid references public.global_catalog_product_versions',
    );
    expect(hardening).toContain('gm.catalog_version_id=p.current_version_id');
    expect(hardening).toContain("m.verification_status='verified'");
    expect(hardening).toContain('revoke all on public.global_catalog_server_ocr_attestations');
    expect(ingredientService).toContain('getEngineApprovedIngredientById');
    expect(ingredientService).toContain(".eq('approved_for_engines', true)");
    expect(ingredientService).toContain(".eq('verification_status', 'verified')");
  });

  it('requires field-bound immutable server OCR evidence before automatic GREEN', () => {
    expect(hardening).toContain('global_catalog_server_ocr_attestations');
    expect(hardening).toContain('a.verified_fields=v_expected_public_facts');
    expect(hardening).toContain("'explicitlyUnbranded',v_explicitly_unbranded");
    expect(hardening).toContain('a.overall_confidence>=85');
    expect(hardening).toContain('source_session_key,evidence_sha256');
    expect(edge).toMatch(/\.upsert\(\s*\{/);
    expect(edge).toContain("onConflict: 'source_session_key,evidence_sha256'");
    expect(edge).toContain('typeof result.verifiedFields');
    expect(edge).toContain('if (!response.ok) return null');
  });

  it('serializes account, IP and device limits before evidence processing', () => {
    expect(hardening).toContain(
      "pg_advisory_xact_lock(hashtext(p_actor_user_id::text||':'||p_action))",
    );
    expect(hardening).toContain("pg_advisory_xact_lock(hashtext('catalog-ip:'||p_ip_hash))");
    expect(hardening).toContain(
      "pg_advisory_xact_lock(hashtext('catalog-device:'||p_device_hash))",
    );
    expect(hardening).toContain("'manual_candidate'");
    expect(hardening).toContain("'review_escalation'");
    expect(hardening).toContain("'duplicate_dispute'");
    expect(edge).not.toContain("service.rpc('begin_global_catalog_submission'");
    const preflightIndex = edge.indexOf("'preflight_product_ingest_v1'");
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(preflightIndex).toBeLessThan(edge.indexOf('evidence = await captureOwnedEvidence'));
    expect(edge).toContain('cleanupUnfinalizedEvidence');
    expect(edge).toContain('newlyArchivedImagePaths');
    expect(edge).toContain(".from('global-catalog-evidence')");
    expect(edge).toContain('.remove(input.evidence.newlyArchivedImagePaths)');
    expect(canonicalRoot).toContain(
      'create or replace function public.preflight_product_ingest_v1',
    );
    expect(canonicalRoot).toContain('Durable, cheap reservation before an adapter downloads');
    expect(edge).toContain(
      "if (!riskSecret) return json({ error: 'catalog_risk_control_unavailable' }, 503)",
    );
    expect(hardening).toContain("raise exception 'idempotency key payload mismatch'");
    expect(hardening).toContain("min(created_at)+interval '24 hours' into v_retry");
    expect(migration).toContain("raise exception 'valid pre-reserved catalog rate slot required'");
    expect(hardening).toContain(
      'p_rate_reservation_id,\n    case when v_resuming_blocked then v_prior.catalog_product_id else null end',
    );
    expect(hardening).toContain(
      "payload_hash=encode(extensions.digest(convert_to(p_actor_user_id::text||':'||p_private_product_id::text||':'||p_ocr_session_id::text",
    );
    expect(
      hardening.indexOf("pg_advisory_xact_lock(hashtext(\n    'catalog-identity:'"),
    ).toBeLessThan(hardening.indexOf('v_result:=public.submit_owned_product_to_global_catalog('));
  });

  it('keeps preprocessing and dispute reservations bound to executable function signatures', () => {
    const rateDeclaration = migration.slice(
      migration.indexOf('create or replace function public.reserve_global_catalog_rate_slot('),
      migration.indexOf(
        ') returns jsonb language plpgsql',
        migration.indexOf('create or replace function public.reserve_global_catalog_rate_slot('),
      ),
    );
    const submitDeclaration = migration.slice(
      migration.indexOf(
        'create or replace function public.submit_owned_product_to_global_catalog(',
      ),
      migration.indexOf(
        ') returns jsonb language plpgsql',
        migration.indexOf(
          'create or replace function public.submit_owned_product_to_global_catalog(',
        ),
      ),
    );
    expect(rateDeclaration).not.toContain('p_rate_reservation_id');
    expect(submitDeclaration).toContain('p_rate_reservation_id uuid default null');
    expect(submitDeclaration).toContain('p_resume_catalog_product_id uuid default null');
    expect(migration).toContain("e.action='ocr_scan' and e.idempotency_key=p_idempotency_key");
    expect(migration).toContain(
      'if p_rate_reservation_id is null then\n    select coalesce(max(version),0)+1',
    );
    expect(hardening).toContain(
      "p_actor_user_id,'duplicate_dispute',left('duplicate:'||p_idempotency_key,160)",
    );
    expect(hardening.indexOf("p_actor_user_id,'duplicate_dispute'")).toBeLessThan(
      hardening.indexOf('v_result:=public.submit_owned_product_to_global_catalog('),
    );
  });

  it('forces every newly resolved unattested candidate through the strict BLUE/RED gate', () => {
    expect(hardening).toContain(
      "if not v_attested and ((v_result->>'kind')='created' or v_resuming_blocked) then",
    );
    expect(hardening).toMatch(/verified_source_version=null\s+where id=v_catalog_id;/);
    expect(hardening).not.toContain(
      "where id=v_catalog_id and (verification_method='automatic' or v_resuming_blocked)",
    );
    expect(hardening).toContain(
      "case when v_attested then 'automatic_verified' when v_manual_complete then 'manual_completion' else 'ocr_automatic' end",
    );
    expect(hardening).toContain(
      "case when v_attested then 'automatic' when v_manual_complete then 'manual_unverified' else 'blocked' end",
    );
    expect(hardening).toContain('where id=v_variant_id');
    expect(hardening).toContain("'proposedPublicFacts',v_expected_public_facts");
  });

  it('keeps an existing GREEN immutable under unattested repeat scans and versions attested corrections', () => {
    expect(hardening).toContain("((v_result->>'kind')='created' or v_resuming_blocked)");
    expect(hardening).toContain('v_existing_fact_change and not v_resuming_blocked and v_attested');
    expect(hardening).toContain("'automatic_verified','automatic',v_version");
    expect(hardening).toContain('existingFactsChanged');
    expect(hardening).toContain('p.display_name is distinct from v_product.product_name_display');
    expect(hardening).toContain('v.net_quantity is distinct from v_quantity');
    expect(hardening).toContain("when v_existing_fact_change and not v_attested then 'correction'");
    expect(hardening).not.toMatch(/update public\.global_catalog_product_versions set/i);
    expect(hardening).toContain('global_catalog_product_session_binding_history');
    expect(migration).toContain("if p_rate_reservation_id is null and v_existing.status='blocked'");
    expect(hardening).toContain(
      'elsif v_attested then\n    update public.global_catalog_products set verified_at',
    );
    expect(hardening).toContain(
      "jsonb_build_object('basis',v_expected_public_facts->'nutritionBasis')",
    );
    expect(hardening).toContain("and v_quantity>0 and v_unit in ('g','kg','ml','l')");
    expect(hardening).toContain("and nullif(trim(coalesce(v_ingredients,'')),'') is not null");
    expect(hardening).toContain("and nullif(trim(coalesce(v_allergens,'')),'') is not null");
    expect(hardening).toContain('and (v_ean is null or public.global_catalog_valid_gtin(v_ean))');
    expect(hardening).toContain("i.state='ready' and i.role='front'");
    expect(hardening).toContain("i.role in ('nutrition_table','back')");
    expect(hardening.indexOf("p_actor_user_id,'duplicate_dispute'")).toBeLessThan(
      hardening.indexOf('select * into v_prior from public.global_catalog_submissions'),
    );
    expect(hardening).toContain(
      "if (select status from public.global_catalog_products where id=v_catalog_id)='blocked' then",
    );
    expect(hardening).toContain(
      'if v_existing_fact_change and not v_resuming_blocked and v_attested then',
    );
    const correctionBlock = hardening.slice(
      hardening.indexOf('if v_existing_fact_change and not v_resuming_blocked and v_attested then'),
      hardening.indexOf("'automatic_verified','automatic',v_version"),
    );
    expect(correctionBlock).toContain('normalized_identity=v_identity');
    expect(correctionBlock).toContain('composition_fingerprint=v_composition');
    expect(correctionBlock).toContain('search_document=v_search_document');
    expect(correctionBlock).toContain('category=null');
    expect(correctionBlock).toContain('country_of_origin=null');
    expect(hardening).toContain("'[^a-zA-Z0-9|]+','','g'");
    expect(migration).toContain("coalesce(v_product.brand,'')||'|'||coalesce(v_name,'')");
    expect(migration).not.toContain(
      "coalesce(v_product.brand,'')||'|'||coalesce(v_name,'')||'|'||coalesce(p_market,'')",
    );
    expect(hardening).toContain(
      'if not v_attested and v_manual_complete and v_catalog_id is not null',
    );
    expect(hardening).toContain('if not v_manual_rate_denied and v_catalog_id is not null');
    expect(hardening).toContain("update public.global_catalog_submissions set outcome='blocked'");
    expect(hardening).toContain(
      'explicitly_unbranded=case when v_manual_complete then v_explicitly_unbranded',
    );
    expect(hardening).toContain('if v_resuming_blocked then');
    expect(migration).toContain(
      "p.id=p_resume_catalog_product_id and p.is_active and p.status='blocked'",
    );
    expect(migration).toContain(
      'if p_resume_catalog_product_id is null then\n    insert into public.global_catalog_variants',
    );
    expect(migration).toContain(
      "if v_existing.status<>'blocked' or p_rate_reservation_id is null then",
    );
    expect(migration).toContain(
      'elsif p_rate_reservation_id is null then\n    -- Legacy callers own this update.',
    );
    expect(migration).toContain('brand + explicitly_unbranded are written atomically');
    expect(migration).toContain(
      'if p_rate_reservation_id is null then\n    insert into public.global_catalog_aliases',
    );
    expect(migration).toContain(
      "if p_rate_reservation_id is not null then\n    v_status:='blocked';\n    v_method:='blocked';",
    );
    expect(hardening).toContain(
      "case when v_product.brand is not null and v_explicitly_unbranded then 'brand_unbranded_conflict' end",
    );
    expect(hardening).toContain('v_current_missing:=array_remove(array[');
    expect(hardening).toContain(
      "nullif(trim(coalesce(v_product.product_name_display,'')),'') is null then 'product_name'",
    );
    expect(hardening).toContain("v_unit is null or v_unit not in ('g','kg','ml','l')");
    expect(hardening).toContain('v_current_invalid:=array_remove(array[');
    expect(hardening).toContain(
      'missing_fields=case when v_manual_complete then missing_fields else v_current_missing end',
    );
    expect(hardening).toContain(
      'invalid_fields=case when v_manual_complete then invalid_fields else v_current_invalid end',
    );
    expect(hardening).toContain(
      'and cardinality(v_current_invalid)=0\n    and not v_variant_correction_ambiguous',
    );
    expect(hardening).toContain("session_id=p_ocr_session_id and state='ready' and role='front'");
    expect(hardening).toContain(
      "session_id=p_ocr_session_id and state='ready' and role in ('nutrition_table','back')",
    );
    expect(hardening).toContain('rate-denied retry must not mutate shared discovery metadata');
    expect(hardening).toContain('normalized_identity=v_identity');
    expect(hardening).toContain('composition_fingerprint=v_composition');
    expect(hardening).toContain('search_document=v_search_document');
    expect(hardening).toContain('v_composition:=md5(v_next_public_data::text)');
    expect(hardening).toContain(
      'else case when v_attested then null else v_product.normalized_category end end;',
    );
    expect(hardening).toContain(
      'category=case when v_attested then null else v_product.product_category end',
    );
    expect(hardening).toContain('p.composition_fingerprint is distinct from v_composition');
    expect(hardening).not.toContain(
      "v_composition:=md5(coalesce(v_product.extracted_json::text,'')",
    );
    expect(hardening).toContain('where x.family=v_family\n    on conflict do nothing;');
    expect(hardening).toContain(
      'case when v_resuming_blocked then v_prior.catalog_product_id else null end',
    );
    expect(hardening).toContain('select count(*) into v_variant_candidate_count');
    expect(hardening).toContain('v_variant_correction_ambiguous:=true');
    expect(hardening).toContain('where v.ean=v_ean and v.product_id<>v_catalog_id');
    expect(hardening).toContain('and v.ean is null;');
    expect(hardening).toContain('ean=coalesce(v_ean,ean)');
    expect(hardening).toContain("if p_duplicate_decision='same' and not v_resuming_blocked");
    expect(hardening).toContain(
      'if v_variant_correction_ambiguous then v_attested:=false; end if;',
    );
    expect(hardening).toContain(
      "if v_variant_correction_ambiguous then\n    v_result:=v_result||jsonb_build_object(\n      'kind','blocked'",
    );
    expect(hardening).toContain('and not v_variant_correction_ambiguous');
    expect(hardening).not.toContain(
      'order by v.created_at desc limit 1;\n  end if;\n  select id into v_version',
    );
  });

  it('keeps blocked products out of favorites and upserts retailer offers through a real arbiter', () => {
    expect(hardening).toContain("p.status<>'blocked'");
    expect(hardening).toContain(
      'create unique index if not exists global_catalog_offer_identity_uniq',
    );
    expect(hardening).toContain('on conflict(variant_id,market,retailer) do update');
  });

  it('uses schema-qualified crypto/search extensions and indexed partial multilingual lookup', () => {
    expect(hardening).toContain('create extension if not exists pgcrypto with schema extensions');
    expect(hardening).toContain('create extension if not exists unaccent with schema extensions');
    expect(hardening).toContain('create extension if not exists pg_trgm with schema extensions');
    expect(hardening).not.toMatch(/(?<!extensions\.)digest\(/);
    expect(hardening).toContain('normalized_alias % q.value');
    expect(hardening).toContain("regexp_replace(q.value,' +',':* & ','g')||':*'");
    expect(hardening).toContain("('strawberry','erdbeeren','de')");
  });

  it('provides immutable versions, consolidated review evidence and migration ledger', () => {
    expect(migration).toContain('global_catalog_product_versions');
    expect(migration).not.toMatch(/grant\s+update[^;]*global_catalog_product_versions/i);
    expect(migration).toContain('global_catalog_review_cases');
    expect(migration).toContain('submission_count=global_catalog_review_cases.submission_count+1');
    expect(migration).toContain('global_catalog_migration_ledger');
    expect(migration).toContain("'ambiguous_report'");
    expect(migration).toContain('no status fabricated');
    expect(migration).toContain('evidence_snapshot');
    expect(migration).toContain('ocrRuns');
    expect(migration).toContain('fieldEvidence');
  });
});

describe('catalog picker scope and visual lock', () => {
  it('keeps favorites and market filters inside the existing picker geometry', () => {
    expect(picker).toContain('DESKTOP_PICKER_WIDTH = 499');
    expect(picker).toContain('DESKTOP_PICKER_HEIGHT = 480');
    expect(picker).toContain('DESKTOP_PICKER_GAP = 12');
    expect(picker).toContain('★</span> Ulubione');
    expect(picker).toContain('+ Rynek');
    expect(picker).toContain('product-picker-scroll-thumb');
    expect(picker).toContain('role="listbox"');
    expect(picker).toContain('aria-activedescendant');
  });

  it('does not add any favorite control to Production', () => {
    expect(productionFiles).not.toMatch(
      /Ulubione|toggleFavorite|global_catalog_favorites|setCatalogFavorite/,
    );
  });

  it('preserves gold/green/blue/red labels and blocked usability', () => {
    expect(picker).toContain('PINGÜINO Base');
    expect(picker).toContain('Zweryfikowany');
    expect(picker).toContain('Dodany manualnie · Niezweryfikowany');
    expect(picker).toContain('Nie można zweryfikować');
    expect(picker).toContain('disabled={!option.selectable}');
  });
});
