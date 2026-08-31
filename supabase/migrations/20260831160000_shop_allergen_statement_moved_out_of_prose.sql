-- The allergen is now a labelled field, so the prose stops repeating it.
--
-- „Zawiera mleko." / „Zawiera jaja." were the last sentence of three product
-- descriptions. With `shop_products.allergens` populated, the card renders the
-- same statement as a labelled chip, and the description was printing it twice.
--
-- Nothing is REMOVED: the allergen statement moves from the middle of a
-- paragraph to a field of its own, which is stronger, not weaker — it can be
-- read at a glance, filtered on, and it cannot be lost when a description is
-- rewritten.

update public.shop_products
set description = 'Naturalny emulgator do klasycznych baz mlecznych.', updated_at = now()
where sku = 'GEL-YOL-500';

update public.shop_products
set description = 'Beztłuszczowa sucha masa mleczna. Podnosi ciało i stabilność bez zmiany '
                  'zawartości tłuszczu.', updated_at = now()
where sku = 'GEL-SMP-500';

update public.shop_products
set description = 'Tłuszcz mleczny w formie suchej. Kremowość bez dodatkowej wody.',
    updated_at = now()
where sku = 'GEL-CRP-500';
