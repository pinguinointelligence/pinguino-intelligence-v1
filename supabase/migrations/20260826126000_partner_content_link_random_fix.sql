-- SECURITY DEFINER functions use a fixed search_path. Qualify pgcrypto so
-- content-link creation does not depend on caller/session search_path.

select pg_advisory_xact_lock(hashtextextended('partner-content-link-random-v1',0));

do $patch_partner_link$
declare
  v_definition text;
  v_patched text;
begin
  v_definition:=pg_get_functiondef(
    'public.gellatti_partner_create_content_link_v1(uuid,text,text,text)'::regprocedure
  );
  v_patched:=replace(v_definition,'encode(gen_random_bytes(12)',
    'encode(extensions.gen_random_bytes(12)');
  if strpos(v_patched,'extensions.gen_random_bytes(12)')=0 then
    raise exception 'partner content-link random anchor drifted';
  end if;
  execute v_patched;
end;
$patch_partner_link$;
