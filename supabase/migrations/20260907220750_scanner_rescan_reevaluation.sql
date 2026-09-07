-- SCANNER RESCAN RE-EVALUATION + LOOKUP RESERVATION RELEASE — owner contract 2026-09-07.
--
-- ============================================================================================
-- DEFECT 1. "Ponowny skan istniejącego PM nie może kończyć się natychmiastowym zwrotem starego
-- PM. Musi ponownie ocenić produkt na aktualnym evidence i, jeśli spełnia warunki, awansować go
-- do PR-ING bez duplikatu."
--
-- `product-scan-analyze` answers a rescan from `exactProductForBarcode` and returns the stored
-- row. That zero-cost path is correct and stays — it is what makes a rescan free. What was
-- missing is the CONSEQUENCE: a product saved earlier with weaker evidence was handed back
-- forever, because the evaluation that could promote it was never reached again.
--
-- The evaluation itself is not duplicated here. The edge function now re-seeds the rescan session
-- from the product's own stored scan result and lets the NORMAL finalize path re-derive
-- recognition → Mapper → rescue → behaviour → readiness, so the routing rule added by
-- 20260907030000 decides the route exactly as it does on a first save. Nothing in that rule is
-- touched by this migration: `v_route` is still
--     case when v_ready and v_conf>85 then 'PR' when v_ready then 'PM_READY' else 'PM_UNVERIFIED' end
-- and this file contains no second copy of it.
--
-- What this migration adds is the missing HALF of that rule's PR verdict. `gellatti_upsert_
-- customer_added_product_v1` could only express 'PR' on a row it was CREATING: the kind,
-- visibility, ownership and article prefix were chosen in the INSERT. Reaching the PR verdict on
-- a product that already exists as the caller's private PM did something worse than nothing:
--
--   * the shared-PR probe at the top requires product_kind='commercial_product' AND
--     visibility='shared' AND product_code like 'PR-ING-%' — a PM row matches none of them;
--   * the demand-row probe then looked for `owner_user_id is not distinct from null` on the PR
--     route, so it could not see the caller's OWN demand row, whose owner is the caller;
--   * so the function fell through to the CREATE branch and inserted a SECOND product for an EAN
--     that already had one. (No constraint stops it: the per-owner unique index makes
--     (ean, null) a different key from (ean, caller), and the variant insert is guarded by
--     `if not exists (... where ean=v_ean)`.)
--
-- Both probes are corrected below and the PR verdict is carried out as an in-place promotion of
-- the SAME product id. The "no duplicate" guarantee is therefore structural, not a convention:
-- on the promotion path the create branch is not reachable at all.
--
-- ============================================================================================
-- DEFECT 2. Session b414f3e6-efde-447d-9545-6f75c36db9eb, EAN 8480000804693, 18:51:13 UTC:
-- state stayed `collecting`, overlay `SCAN_DRAFT`, zero external sources, no identity.
--
-- What actually happened, from the ledgers: `reserve_product_scan_ean_lookup_v1` moved
-- web_calls 0→1 at 18:51:14, `intimport-enrich` then ran for 8152 ms and spent THREE real web
-- calls (intimport_enrichment_usage 1e1a2e21, model gpt-5.6-luna), and answered `facts: []` with
-- all twenty fields in `notFound` — the code is genuinely in no public source. Because
-- `scanResultFromLookupFacts` returns null when no external source survives,
-- `complete_product_scan_ean_lookup_v1` was never called, so:
--
--   * the three billed web calls were never booked against the session
--     (estimated_cost_usd stayed 0.000000 and product_scan_usage_ledger has no row), and
--   * web_calls stayed at 1, which makes `reserve_product_scan_ean_lookup_v1` answer
--     `session_lookup_already_used` for ever. The retry button the customer was shown could
--     never succeed on that session.
--
-- The owner's requirement is "kontrolowany wynik albo konkretny, zdiagnozowany błąd z działającym
-- retry". Those are two different outcomes and the split is the money:
--
--   * the provider ANSWERED "nothing" — a controlled result. Real web calls were spent, a retry
--     would spend three more to receive the same answer, so the reservation is NOT given back;
--     the edge function books the cost through the existing completion RPC and the flow
--     continues to the label with a specific reason.
--   * the provider NEVER ANSWERED (transport failure, non-2xx) — a diagnosed error. Nothing was
--     billed, so the reservation must be given back or the retry is theatre. That is what
--     `release_product_scan_ean_lookup_v1` below does, and it refuses to do it whenever there is
--     any evidence that money was spent.

-- ---------------------------------------------------------------------------------------------
-- 1. Give back an UNSPENT EAN-lookup reservation.
--
--    This is deliberately not a plain decrement. A reservation may only be released while every
--    independent record still says nothing was bought: no result on the session, no cost booked,
--    no external-source row, and — the authoritative one — no row in the provider's own usage
--    ledger for this session's import id. `intimport-enrich` writes that row when it calls out,
--    so a provider that billed and then failed to answer cleanly cannot be mistaken for a
--    provider that never ran.
-- ---------------------------------------------------------------------------------------------
create or replace function public.release_product_scan_ean_lookup_v1(
  p_actor_user_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_session public.product_scan_sessions%rowtype;
begin
  if p_actor_user_id is null or p_session_id is null then
    raise exception 'invalid product scan lookup release';
  end if;
  perform pg_advisory_xact_lock(hashtext('product-scan-lookup:'||p_session_id::text));
  select * into v_session from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id for update;
  if not found then
    return jsonb_build_object('released',false,'reason','owned_scan_session_not_found');
  end if;
  if v_session.state in ('expired','finalized') or v_session.expires_at<=now() then
    return jsonb_build_object('released',false,'reason','session_not_active');
  end if;
  if v_session.web_calls<1 then
    return jsonb_build_object('released',false,'reason','no_reservation_held');
  end if;
  -- Anything that says the lookup produced or cost something keeps the reservation spent.
  if v_session.result_json is not null or coalesce(v_session.estimated_cost_usd,0)>0 then
    return jsonb_build_object('released',false,'reason','lookup_already_spent');
  end if;
  if exists(select 1 from public.product_scan_external_sources
    where session_id=p_session_id and user_id=p_actor_user_id) then
    return jsonb_build_object('released',false,'reason','lookup_already_spent');
  end if;
  -- The provider's OWN ledger is the authority on whether a paid call happened. This is the row
  -- that exists for session b414f3e6 (three web calls, no facts) and is exactly why that session
  -- must NOT be released into an unlimited free retry.
  if exists(select 1 from public.intimport_enrichment_usage
    where import_id='product-scan-'||p_session_id::text) then
    return jsonb_build_object('released',false,'reason','lookup_provider_already_billed');
  end if;
  update public.product_scan_sessions
    set web_calls=greatest(web_calls-1,0), updated_at=now()
    where id=p_session_id and user_id=p_actor_user_id;
  return jsonb_build_object('released',true);
end;
$$;

revoke all on function public.release_product_scan_ean_lookup_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.release_product_scan_ean_lookup_v1(uuid,uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Carry out the PR verdict on a product that already exists as the caller's private PM.
--
--    Applied as targeted patches on the DEPLOYED body, the same way 20260907030000 applied the
--    routing itself, so that the routing rule, the canonicalization transaction, the rescue
--    refresh and every guard are provably untouched.
-- ---------------------------------------------------------------------------------------------
do $migration$
declare
  v_sig regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_def text;
  v_old text;
begin
  if v_sig is null then raise exception 'gellatti_upsert_customer_added_product_v1_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;

  if position('v_route' in v_def) = 0 then
    raise exception 'final PR/PM routing missing; apply 20260907030000 first';
  end if;
  if position('RESCAN PROMOTION' in v_def) > 0 then
    raise notice 'rescan promotion already applied; nothing to do';
    return;
  end if;

  -------------------------------------------------------------------------------------------
  -- 2a. one more local: the kind the product had BEFORE this save decided anything
  -------------------------------------------------------------------------------------------
  v_old := '  v_route text;';
  if position(v_old in v_def) = 0 then raise exception 'promotion_anchor_declare_not_found'; end if;
  v_def := replace(v_def, v_old, '  v_route text;' || E'\n' || '  v_prior_kind text;');

  -------------------------------------------------------------------------------------------
  -- 2b. serialize on the EAN alone.
  --
  --     The per-user suffix let two accounts add the same EAN as private PMs without waiting.
  --     A promotion crosses both domains — it reads the caller's per-user demand row and writes
  --     a row that becomes shared — so under the split key a concurrent save of the same EAN
  --     took a DIFFERENT lock and the two could interleave. The EAN-only key subsumes the
  --     per-user one; the transaction is short.
  -------------------------------------------------------------------------------------------
  v_old :=
    '  perform pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean||' || E'\n' ||
    '    case when v_route=''PR'' then '''' else '':''||p_actor_user_id::text end,0));';
  if position(v_old in v_def) = 0 then raise exception 'promotion_anchor_lock_not_found'; end if;
  v_def := replace(v_def, v_old,
    '  perform pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean,0));');

  -------------------------------------------------------------------------------------------
  -- 2c. the PR route must be able to SEE the caller's own demand row.
  --
  --     `owner_user_id is not distinct from null` hid it, which is what sent a qualifying rescan
  --     into the create branch and produced a second product for the EAN. A shared row still
  --     wins when both exist, so an already-shared EAN keeps its single shared record.
  -------------------------------------------------------------------------------------------
  v_old :=
    '  select * into v_pending from public.customer_added_products' || E'\n' ||
    '    where normalized_ean=v_ean and status=''PENDING''' || E'\n' ||
    '      and owner_user_id is not distinct from' || E'\n' ||
    '        (case when v_route=''PR'' then null else p_actor_user_id end) for update;';
  if position(v_old in v_def) = 0 then raise exception 'promotion_anchor_pending_not_found'; end if;
  v_def := replace(v_def, v_old,
    '  select * into v_pending from public.customer_added_products' || E'\n' ||
    '    where normalized_ean=v_ean and status=''PENDING''' || E'\n' ||
    '      and (case when v_route=''PR''' || E'\n' ||
    '                then owner_user_id is null or owner_user_id=p_actor_user_id' || E'\n' ||
    '                else owner_user_id is not distinct from p_actor_user_id end)' || E'\n' ||
    '    order by case when owner_user_id is null then 0 else 1 end' || E'\n' ||
    '    limit 1 for update;');

  -------------------------------------------------------------------------------------------
  -- 2d. the promotion itself, in the existing-product branch, on the SAME product id.
  --
  --     Anchored on the two-line `v_name` assignment, which exists only in that branch (the
  --     create branch writes it on one line). Both set_config calls have already run above, so
  --     the canonical write guard lets this update through and next_product_code() reads 'PR'.
  -------------------------------------------------------------------------------------------
  v_old :=
    '    v_name:=coalesce(nullif(trim(v_identity->>''displayName''),''''),' || E'\n' ||
    '      nullif(trim(v_identity->>''originalName''),''''));';
  if position(v_old in v_def) = 0 then raise exception 'promotion_anchor_existing_name_not_found'; end if;
  v_def := replace(v_def, v_old,
    '    -- RESCAN PROMOTION (owner contract 2026-09-07). The route was decided ABOVE by the one' || E'\n' ||
    '    -- routing rule; nothing is recomputed here. This only carries out its PR verdict on a' || E'\n' ||
    '    -- product that already exists as the caller''s private PM, by promoting THAT row.' || E'\n' ||
    '    -- Reaching PR from here can no longer create anything: the create branch is not on this' || E'\n' ||
    '    -- path, so "no duplicate for the same EAN" is structural rather than a convention.' || E'\n' ||
    '    if v_route=''PR'' then' || E'\n' ||
    '      select product_kind into v_prior_kind from public.products where id=v_product_id;' || E'\n' ||
    '      if v_prior_kind=''customer_provisional'' then' || E'\n' ||
    '        update public.products set' || E'\n' ||
    '          product_kind=''commercial_product'',' || E'\n' ||
    '          visibility=''shared'',' || E'\n' ||
    '          owner_user_id=null,' || E'\n' ||
    '          owning_account_id=null,' || E'\n' ||
    '          -- a shared registry row must carry a PR-ING article code: that prefix is what the' || E'\n' ||
    '          -- existing-PR probe at the top of this function matches for every later customer,' || E'\n' ||
    '          -- so a promoted product that kept PM-ING would stay invisible as a shared product' || E'\n' ||
    '          product_code=case when product_code like ''PR-ING-%'' then product_code' || E'\n' ||
    '                            else public.next_product_code() end,' || E'\n' ||
    '          updated_at=statement_timestamp()' || E'\n' ||
    '        where id=v_product_id;' || E'\n' ||
    '        -- the demand row follows the product it describes, unless a shared record for this' || E'\n' ||
    '        -- EAN already exists (the per-owner unique index would refuse a second null owner)' || E'\n' ||
    '        update public.customer_added_products set owner_user_id=null,' || E'\n' ||
    '          updated_at=statement_timestamp()' || E'\n' ||
    '          where id=v_pending.id' || E'\n' ||
    '            and not exists(select 1 from public.customer_added_products other' || E'\n' ||
    '              where other.normalized_ean=v_ean and other.owner_user_id is null' || E'\n' ||
    '                and other.id<>v_pending.id);' || E'\n' ||
    '      end if;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    v_name:=coalesce(nullif(trim(v_identity->>''displayName''),''''),' || E'\n' ||
    '      nullif(trim(v_identity->>''originalName''),''''));');

  execute v_def;
  raise notice 'rescan promotion applied';
end
$migration$;
