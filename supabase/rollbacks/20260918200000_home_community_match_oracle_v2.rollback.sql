-- Rollback for 20260918200000_home_community_match_oracle_v2.
--
-- WYCOFANIE: usuwa TYLKO public.gellatti_match_community_top100_v2(jsonb, text, integer);
-- jej komentarz i uprawnienia znikają razem z nią. Migracja nie dotykała v1
-- (20260830140000_home_community_match_oracle), więc nie ma czego przywracać: klient wraca
-- do pytania v1 zestawami. Żadna tabela, polityka, widok ani dane nie są ruszane.
-- Drugie uruchomienie niczego nie zmienia.
drop function if exists public.gellatti_match_community_top100_v2(jsonb, text, integer);
