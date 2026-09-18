-- GELLATTI HOME — Community match oracle v2: AND grup OR
-- Zgoda właściciela (warunkowa) obejmuje JEDNĄ nową funkcję. v1 pozostaje NIETKNIĘTE
-- (żadnego `create or replace` na v1), więc każdy dzisiejszy wywołujący działa bez zmian.
--
-- PO CO: pomysł ogólny ma dziś kilka zatwierdzonych postaci na składnik. Klient pyta
-- v1 zestaw po zestawie, więc „(A świeże LUB A puree) ORAZ (B świeże LUB B puree)”
-- kosztuje iloczyn kombinacji. Przy dwóch pojęciach to już 40–224 zapytania, więc klient
-- pyta o 24 i uczciwie mówi, że wynik jest częściowy. v2 odpowiada NA TO SAMO pytanie
-- w jednym wywołaniu.
--
-- CZEGO NIE ZMIENIA: ranking (dalej `gellatti_top_recipes_v1`, kolejność zachowana),
-- granicę gramów (nazwy składników, nigdy masy), widoczność (opublikowane + moderacja ok),
-- §32 (każdy żądany składnik musi być obecny — tylko teraz „żądany” to grupa postaci).
--
-- ODMOWA = `[]` (nigdy błąd i nigdy „wszystko”): żądanie, które nie jest tablicą JSON;
-- 0 grup albo ponad 8; grupa, która nie jest tablicą JSON, albo pusta grupa; ponad 64
-- identyfikatory łącznie. Zła grupa odrzuca CAŁE żądanie — nigdy nie jest pomijana, bo
-- pominięcie grupy AND POSZERZYŁOBY dopasowanie. JSON null wewnątrz grupy nie jest
-- identyfikatorem i jest pomijany.

create or replace function public.gellatti_match_community_top100_v2(
  -- [["PI-A-1","PI-A-2"],["PI-B-1"]] — AND między grupami, OR wewnątrz grupy.
  p_ingredient_groups jsonb,
  p_category text default null,
  p_limit integer default 10
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with groups as (
    -- Grupa, która nie jest tablicą JSON, dostaje ids = NULL (czytanie jej rzuciłoby
    -- błąd 22023) i `guard` odrzuca całe żądanie. Nie-tablica na górze = zero grup.
    select grp,
           case when jsonb_typeof(grp) = 'array'
                then array(select x from jsonb_array_elements_text(grp) x where x is not null)
           end as ids
    from jsonb_array_elements(
           case when jsonb_typeof(p_ingredient_groups) = 'array'
                then p_ingredient_groups else '[]'::jsonb end) as g(grp)
  ),
  flat as (
    select coalesce(array_agg(distinct id), array[]::text[]) as ids
    from groups, unnest(groups.ids) as id
  ),
  guard as (
    -- Nie tablica, bez grup, z pustą grupą, z grupą, która nie jest tablicą, albo powyżej
    -- limitów — pusta odpowiedź, nigdy „wszystko” i nigdy żądanie bez jednej grupy.
    select coalesce(jsonb_typeof(p_ingredient_groups) = 'array', false)
       and (select count(*) from groups) between 1 and 8
       and not exists (
         select 1 from groups where jsonb_typeof(grp) <> 'array' or cardinality(ids) = 0)
       and (select coalesce(sum(cardinality(ids)), 0) from groups) <= 64 as ok
  ),
  top100 as (
    select (elem->>'publication_id')::uuid as publication_id, ord as rank
    from jsonb_array_elements(public.gellatti_top_recipes_v1('all_time', 100))
      with ordinality as ranked(elem, ord)
  ),
  eligible as (
    select t.rank, p.id as publication_id, p.slug, p.title, p.description, p.image_url,
           p.category, p.published_at, p.recipe_version_number, p.creator_profile_id,
           p.recipe_id, v.recipe_input
    from top100 t
    join public.community_publications p
      on p.id = t.publication_id and p.status = 'published'
    join public.creator_profiles c
      on c.id = p.creator_profile_id and c.moderation_status = 'ok'
    join public.recipe_versions v
      on v.recipe_id = p.recipe_id and v.version_number = p.recipe_version_number
    where p_category is null or lower(coalesce(p.category, '')) = lower(p_category)
  ),
  composed as (
    select e.*,
      coalesce((
        select array_agg(distinct coalesce(
          item->'ingredient'->>'canonical_ingredient_id', item->'ingredient'->>'id'))
        from jsonb_array_elements(coalesce(e.recipe_input->'items', '[]'::jsonb)) item
      ), array[]::text[]) as ingredient_ids,
      coalesce((
        -- NAZWY, nigdy masy; kolejność po nazwie. Wykluczamy wszystkie żądane postaci.
        -- `::text[]` wymusza postać tablicową `<> all (array)` (jak v1), a nie postać
        -- podzapytania, której typ `text <> text[]` nie istnieje (42883).
        select jsonb_agg(distinct item->'ingredient'->>'name'
                         order by item->'ingredient'->>'name')
        from jsonb_array_elements(coalesce(e.recipe_input->'items', '[]'::jsonb)) item
        where coalesce(item->'ingredient'->>'canonical_ingredient_id',
                       item->'ingredient'->>'id') <> all ((select ids from flat)::text[])
      ), '[]'::jsonb) as also_includes
    from eligible e
  )
  select coalesce(jsonb_agg(card order by rank), '[]'::jsonb)
  from (
    select c.rank,
      jsonb_build_object(
        'publication_id', c.publication_id, 'slug', c.slug, 'title', c.title,
        'description', c.description, 'image_url', c.image_url, 'category', c.category,
        'published_at', c.published_at, 'version_number', c.recipe_version_number,
        'rank', c.rank,
        'all_requested_present', true,
        'also_includes', c.also_includes,
        -- Które postaci odpowiedziały — do zdania „Używa postaci: …” na karcie.
        'matched_ids', (
          select coalesce(jsonb_agg(distinct m.id), '[]'::jsonb)
          from groups g, unnest(g.ids) as m(id)
          where m.id = any (c.ingredient_ids)),
        'creator', jsonb_build_object(
          'handle', cp.handle, 'display_handle', cp.display_handle,
          'display_name', cp.display_name, 'avatar_url', cp.avatar_url,
          'verification_status', cp.verification_status),
        'based_on', public.gellatti_publication_card_v1(c.publication_id)->'based_on'
      ) as card
    from composed c
    join public.creator_profiles cp on cp.id = c.creator_profile_id
    where (select ok from guard)
      -- §32 STRICT, teraz jako AND grup OR: żadna grupa nie może pozostać nieobecna.
      and not exists (
        select 1 from groups g where not (g.ids && c.ingredient_ids))
    order by c.rank
    limit greatest(0, least(coalesce(p_limit, 10), 25))
  ) ordered;
$$;

comment on function public.gellatti_match_community_top100_v2(jsonb, text, integer) is
  'GELLATTI HOME §32-§40 — Top100 match oracle, AND of ORs. Each group is one requested ingredient and its owner-approved forms; a publication matches when every group is present. Same ranking authority, same gram boundary (names only), same visibility as v1, which is left untouched.';

revoke all on function public.gellatti_match_community_top100_v2(jsonb, text, integer)
  from public, anon, authenticated;
grant execute on function public.gellatti_match_community_top100_v2(jsonb, text, integer)
  to anon, authenticated;
