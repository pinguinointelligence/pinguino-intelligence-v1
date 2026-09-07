-- SOL-043 / Owner QA 2026-09-06 — the behaviour gate must see the products the customer can see.
--
-- WHAT THE OWNER SAW. The ingredient picker found a saved product (Cola Zero, CA-ING-007185),
-- showed an enabled „Dodaj do receptury", and pressing it added nothing and printed:
--   „Dla produkt 16eba716-… · wersja 16eba716-… · Mapper brak · moduł BASE_RECIPE brakuje
--    aktualnego ProductBehavior binding. Odśwież dane produktu i uruchom klasyfikację ponownie."
--
-- THE BINDING WAS NOT MISSING. a5eee764-0b47-4279-b3b6-84d2d41f3065 is is_current, binding_status
-- 'ready', on exactly products.current_version_id. The customer was told something untrue.
--
-- THE REAL CAUSE — TWO AUTHORITIES, TWO DIFFERENT VISIBILITY RULES. A scanner-created product is
-- product_kind='customer_provisional', visibility='internal', with owner_user_id and
-- owning_account_id NULL BY DESIGN: it is ONE central row per EAN, and access is granted through
-- customer_added_product_accounts. Every read in that lifecycle honours the link table —
-- search_products_v1, resolve_exact_products_by_gtin_v1, can_use_product_relation_v1,
-- get_canonical_product_for_account_v1 and the RLS policies — EXCEPT
-- resolve_product_behavior_evidence_gate_v1, which only ever learned about visibility='shared',
-- the two ownership columns, created_by, and admin.
--
-- So an account LINKED to a product (Cola Zero is linked to both home@ and pro@; it was CREATED by
-- home@) can search it, scan it and be offered it — and then the gate cannot see it. And when the
-- gate finds no row it builds its reason as
--   'behavior_binding_missing:' || coalesce(v_product_id::text, p_entity_id) || ':' || … ||
--   coalesce(v_version_id::text, p_entity_id) || …
-- with both ids NULL, so BOTH fall back to p_entity_id — which is why one UUID printed in both the
-- product and the version slot. That repetition is the signature of "the gate found nothing", not
-- of a real missing binding.
--
-- THE FIX. Teach the gate the same two link predicates search_products_v1 already uses, so the two
-- authorities agree about who may see a customer-added product. This GRANTS NO NEW ACCESS: it
-- admits exactly the rows the search, the exact-EAN resolver and RLS already admit for the same
-- caller. It is applied as a targeted text patch on the DEPLOYED body, so the rest of the function
-- — every gate, every threshold, the whole evidence contract — is provably untouched, and the
-- patch refuses loudly if the clause it anchors on has drifted.

do $$
declare
  v_def text;
  v_old text;
  v_new text;
  v_hits integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resolve_product_behavior_evidence_gate_v1';

  if v_def is null then
    raise exception 'resolve_product_behavior_evidence_gate_v1 not found';
  end if;

  v_old := 'or exists(select 1 from public.admin_users a'
        || E'\n' || '          where a.user_id=auth.uid() and a.revoked_at is null)';

  v_new := 'or exists(select 1 from public.product_ingest_events ev'
        || E'\n' || '          where ev.product_id=p.id and ev.actor_user_id=auth.uid())'
        || E'\n' || '        or exists(select 1 from public.customer_added_product_accounts linked'
        || E'\n' || '          where linked.product_id=p.id and linked.user_id=auth.uid())'
        || E'\n' || '        ' || v_old;

  if position(v_new in v_def) > 0 then
    raise notice 'behaviour gate already sees linked customer-added products; nothing to do';
    return;
  end if;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);

  if v_hits = 0 then
    raise exception 'behaviour gate visibility clause drifted: admin predicate not found';
  end if;

  execute replace(v_def, v_old, v_new);
  raise notice 'behaviour gate now honours customer_added_product_accounts (% site(s))', v_hits;
end
$$;
