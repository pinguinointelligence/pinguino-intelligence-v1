-- The catalogue tells the truth about what is packed.
--
-- `20260831120000` recorded the packed amount on the bundle line. This is the
-- read side: the catalogue returned each bundle item's RETAIL pack size, so a
-- Starter Pack whose box holds 250 g of dextrose still reported 500 g, and the
-- seven lines added up to 3 500 g instead of 1 125 g.
--
-- `contentsTotalG` is returned rather than left to the client to sum, so the
-- hero, the product card and the cart can never disagree about the box.

create or replace function public.gellatti_shop_catalog_v1()
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(jsonb_agg(entry order by ord, name), '[]'::jsonb)
  from (
    select p.sort_order as ord, p.title as name, jsonb_build_object(
      'id', p.id, 'sku', p.sku, 'slug', p.slug, 'kind', p.kind,
      'title', p.title, 'description', p.description,
      'canonicalIngredientId', p.canonical_ingredient_id,
      'packSizeG', p.pack_size_g, 'priceCents', p.price_cents, 'currency', p.currency,
      'imageUrl', p.image_url, 'availability', p.availability,
      'leadTimeWeeks', p.lead_time_weeks,
      'contents', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'sku', c.sku,
                 'title', c.title,
                 'packSizeG', coalesce(b.packed_grams, c.pack_size_g),
                 'quantity', b.quantity)
                          order by coalesce(b.packed_grams, c.pack_size_g) desc, c.title)
        from public.shop_bundle_items b
        join public.shop_products c on c.id = b.item_product_id
        where b.bundle_product_id = p.id
      ), '[]'::jsonb),
      'contentsTotalG', (
        select sum(coalesce(b.packed_grams, c.pack_size_g) * b.quantity)
        from public.shop_bundle_items b
        join public.shop_products c on c.id = b.item_product_id
        where b.bundle_product_id = p.id
      )
    ) as entry
    from public.shop_products p
    where p.active = true
  ) rows;
$function$;
