-- ============================================================================
-- Community derivation: the entitled read must carry the product composition
-- ============================================================================
-- DEFECT (systemic, found in served QA 2026-08-31). Deriving ANY Community recipe
-- that has ingredient lines failed:
--
--   create_recipe_with_v1 -> P0001
--   "recipe product behavior scope mismatch for milk-base:milk_3_5"
--
-- The guard was RIGHT. `assert_recipe_behavior_authority_all_lines_v1` reads
-- `behaviorSnapshots` out of the product composition and refuses any line without a
-- resolved snapshot — its own comment says "no new version/run may be written until
-- every line is reconstructed and RESOLVED".
--
-- The fault was upstream: this RPC returned `recipe_input` but NOT
-- `product_composition`, so `useRecipeDerivation` had nothing to pass and sent
-- `productComposition: null`. Every line then looked unresolved and the copy was
-- refused.
--
-- Audited on staging: of 4 published publications, the ONE with ingredient lines
-- carries snapshots for 6 of 6 lines — the source data is valid. The other three
-- derive only because they have zero lines and the guard has nothing to check. So
-- every ingredient-bearing Community recipe was non-derivable, and no publication
-- had bad data.
--
-- FIX: return the composition the publication's own immutable version already
-- stores. `buildDerivedRecipe` passes `recipe_input` through unchanged, so the line
-- ids match and the snapshots apply exactly.
--
-- NOT a visibility change. This is the ENTITLEMENT-GATED full read — it already
-- returns `recipe_input` including grams behind the same gate, and composition is
-- public in Gellatti anyway (only exact grams are gated). The gate itself, the
-- published/creator checks and every other key are untouched.
--
-- The guard is deliberately NOT weakened: a publication whose lines genuinely lack
-- resolved snapshots will still be refused, which is the behaviour that protects
-- ProductBehavior authority.

create or replace function public.gellatti_get_publication_full_v1(p_publication_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public' as $$
declare v_uid uuid := auth.uid(); v_pub public.community_publications; v_version public.recipe_versions;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_pub from public.community_publications
  where id = p_publication_id and status = 'published';
  if v_pub.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if v_pub.creator_user_id <> v_uid and not public.gellatti_has_paid_access_v1(v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'entitlement_required',
      'entitlement', 'community_public');
  end if;

  select * into v_version from public.recipe_versions where id = v_pub.recipe_version_id;
  return jsonb_build_object(
    'ok', true, 'entitlement', 'full',
    'publication_id', v_pub.id,
    'recipe_id', v_pub.recipe_id,
    'recipe_version_id', v_pub.recipe_version_id,
    'version_number', v_pub.recipe_version_number,
    'title', v_pub.title,
    'creator_user_id', v_pub.creator_user_id,
    'recipe_input', v_version.recipe_input,
    -- The line that makes a copy possible: the same product authority the source
    -- version was saved with, so the derived recipe's lines stay RESOLVED.
    'product_composition', v_version.product_composition,
    'engine_version', v_version.engine_version,
    'config_version', v_version.config_version,
    'total_batch_g', v_version.total_batch_g);
end;
$$;

comment on function public.gellatti_get_publication_full_v1(uuid) is
  'Entitled full read of a published recipe. Returns the immutable version''s recipe_input AND product_composition, so a derivation can carry the source''s resolved ProductBehavior snapshots forward instead of being refused by the authority guard.';
