-- Admit the server-owned INTIMPORT whole-profile authority in the existing
-- products.match_method vocabulary. No Mapper data is changed here.

select pg_advisory_xact_lock(hashtextextended('products-match-method-check-v1',0));

alter table public.products
  drop constraint if exists products_match_method_check;

alter table public.products
  add constraint products_match_method_check check (
    match_method is null or match_method = any (array[
      'exact_ean'::text,
      'exact_normalized_name'::text,
      'brand_name'::text,
      'category_composition_similarity'::text,
      'ingredient_type'::text,
      'fuzzy_name'::text,
      'no_confident_match'::text,
      'manual_mapping'::text,
      'intimport_whole_profile_match'::text
    ])
  ) not valid;

alter table public.products
  validate constraint products_match_method_check;
