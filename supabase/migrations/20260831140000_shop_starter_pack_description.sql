-- The Starter Pack description said „Po 500 g każdy", which was wrong in the
-- same way the bundle rows were wrong. It now states what is packed and what
-- the box weighs, in the customer's language rather than the Engine's.
--
-- The PRICE is deliberately untouched at 5900 (€59.00): it is the value in the
-- commerce source and in the orders already placed against it.

update public.shop_products
set description = 'Siedem składników, na których Gellatti liczy receptury: odtłuszczone mleko '
                  'w proszku, dekstroza, inulina, fruktoza, śmietanka w proszku 42%, suszone '
                  'żółtko jaja i Gellatti Stabilizer. Razem 1 125 g — proporcje dobrane pod '
                  'pierwsze receptury, bez szukania każdego składnika osobno.',
    updated_at = now()
where sku = 'GEL-STARTER-PACK';
