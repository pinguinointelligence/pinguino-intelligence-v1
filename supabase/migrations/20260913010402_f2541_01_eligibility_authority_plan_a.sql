-- F2541-01 Plan A: explicit approvals are the only Mapper runtime eligibility
-- authority. verification_status remains evidence/provenance metadata.
--
-- Forward-only schema change: no Mapper rows, identities, statuses or search
-- ranking assets are modified.

select pg_advisory_xact_lock(hashtextextended('f2541-01-eligibility-authority-plan-a', 0));

do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched text;
begin
  v_signature := to_regprocedure(
    'public.bind_intimport_whole_profile_match_v1(uuid,text,text,uuid,uuid,uuid,jsonb,jsonb)'
  );
  if v_signature is null then
    raise exception 'bind_intimport_whole_profile_match_v1 authority missing';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_patched := regexp_replace(
    v_definition,
    $pattern$[[:space:]]+and[[:space:]]+lower[[:space:]]*\([[:space:]]*trim[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*m\.verification_status[[:space:]]*,[[:space:]]*''[[:space:]]*\)[[:space:]]*\)[[:space:]]*\)[[:space:]]+like[[:space:]]+'verified%'$pattern$,
    '',
    'gi'
  );
  v_patched := replace(
    v_patched,
    'INTIMPORT Mapper target is not active, Base/Engine approved and Verified',
    'INTIMPORT Mapper target does not satisfy active Base/Engine approval requirements'
  );
  if v_patched is distinct from v_definition then
    execute v_patched;
  end if;
  if pg_get_functiondef(v_signature) ~* $pattern$lower[[:space:]]*\([[:space:]]*trim[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*m\.verification_status$pattern$ then
    raise exception 'bind_intimport_whole_profile_match_v1 verification-status gate remains';
  end if;

  v_signature := to_regprocedure('public.search_global_catalog(text,text[],boolean,integer)');
  if v_signature is null then
    raise exception 'search_global_catalog authority missing';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_patched := regexp_replace(
    v_definition,
    $pattern$[[:space:]]+and[[:space:]]+m\.verification_status[[:space:]]*=[[:space:]]*'verified'$pattern$,
    '',
    'gi'
  );
  if v_patched is distinct from v_definition then
    execute v_patched;
  end if;
  if pg_get_functiondef(v_signature) ~* $pattern$m\.verification_status[[:space:]]*=[[:space:]]*'verified'$pattern$ then
    raise exception 'search_global_catalog verification-status gate remains';
  end if;

  v_signature := to_regprocedure('public.propose_live_overlay_mapper_identity_v1(uuid)');
  if v_signature is null then
    raise exception 'propose_live_overlay_mapper_identity_v1 authority missing';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_patched := regexp_replace(
    v_definition,
    $pattern$[[:space:]]+and[[:space:]]+m\.verification_status[[:space:]]+ilike[[:space:]]+'verified%'$pattern$,
    '',
    'gi'
  );
  if v_patched is distinct from v_definition then
    execute v_patched;
  end if;
  if pg_get_functiondef(v_signature) ~* $pattern$m\.verification_status[[:space:]]+ilike[[:space:]]+'verified%'$pattern$ then
    raise exception 'propose_live_overlay_mapper_identity_v1 verification-status gate remains';
  end if;
end
$migration$;

-- Live staging already has approval-based country/default routing. These
-- no-op-on-live patches make a full repository replay converge to that same
-- definition after the historical Verified-prefix migration is replayed.
do $country_parity$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched text;
  v_identity text;
begin
  foreach v_identity in array array[
    'private.product_canonical_slot_candidate_is_valid_v1(uuid,uuid,text)',
    'public.resolve_country_product_slots_v1(text[],text,text)'
  ] loop
    v_signature := to_regprocedure(v_identity);
    if v_signature is null then
      raise exception '% authority missing', v_identity;
    end if;
    v_definition := pg_get_functiondef(v_signature);
    v_patched := regexp_replace(
      v_definition,
      $pattern$[[:space:]]+and[[:space:]]+lower[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*mapper\.verification_status[[:space:]]*,[[:space:]]*''[[:space:]]*\)[[:space:]]*\)[[:space:]]+like[[:space:]]+'verified%'$pattern$,
      '',
      'gi'
    );
    if v_patched is distinct from v_definition then
      execute v_patched;
    end if;
    if pg_get_functiondef(v_signature) ~* $pattern$lower[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*mapper\.verification_status$pattern$ then
      raise exception '% verification-status gate remains', v_identity;
    end if;
  end loop;
end
$country_parity$;
