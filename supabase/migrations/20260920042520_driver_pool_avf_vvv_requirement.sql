-- Add one explicit combined Pool requirement; profiles and existing categories stay unchanged.
begin;
do $baseline$
begin
  if not exists(select 1 from pg_proc where oid=to_regprocedure('public.driver_pool_vehicle_matches(text,text)')
    and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='aa1a5e31eb0b6cf0245fd2b1a983a070')
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text,bigint[],text)')
    and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='f761eeaa2c8a95fbfcb1ae854d720539') then
    raise exception 'Driver Pool baseline changed. Inspect before adding AVF / VVV.';
  end if;
end $baseline$;

create or replace function public.driver_pool_vehicle_matches(p_requirement text, p_vehicle text)
returns boolean language sql immutable security invoker set search_path = ''
as $match$
  with vehicle as (
    select case regexp_replace(lower(coalesce(p_vehicle, '')), '[^a-z0-9]', '', 'g')
      when 'e' then 'E' when 'eclass' then 'E' when 'mercedeseclass' then 'E'
      when 'avf' then 'AVF' when 'alphard' then 'AVF' when 'vellfire' then 'AVF'
      when 'toyotaalphard' then 'AVF' when 'toyotavellfire' then 'AVF'
      when 's' then 'S' when 'sclass' then 'S' when 'mercedessclass' then 'S'
      when 'vvv' then 'VVV' when 'vclass' then 'VVV' when 'viano' then 'VVV'
      when 'vito' then 'VVV' when 'mercedesvclass' then 'VVV'
      when 'mercedesviano' then 'VVV' when 'mercedesvito' then 'VVV'
      when 'combi' then 'COMBI'
      else null end as category
  )
  select coalesce(case when p_requirement = 'E / AVF' then category in ('E', 'AVF')
    when p_requirement = 'AVF / VVV' then category in ('AVF', 'VVV')
    when p_requirement in ('AVF', 'S', 'VVV', 'COMBI') then category = p_requirement
    else false end, false) from vehicle;
$match$;
revoke all on function public.driver_pool_vehicle_matches(text,text) from public, anon, authenticated;
grant execute on function public.driver_pool_vehicle_matches(text,text) to service_role;

-- Retain the exact deployed publisher, changing only its explicit requirement allowlist.
-- Its selected/all audience, widening, locking, amount and idempotency remain intact.
do $publisher$
declare
  definition text := pg_get_functiondef('public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text,bigint[],text)'::regprocedure);
  old_choices text := $$p_vehicle_requirement not in ('E / AVF', 'AVF', 'S', 'VVV', 'COMBI')$$;
  new_choices text := $$p_vehicle_requirement not in ('E / AVF', 'AVF', 'AVF / VVV', 'S', 'VVV', 'COMBI')$$;
begin
  if (length(definition)-length(replace(definition,old_choices,'')))/length(old_choices) <> 1 then
    raise exception 'Driver Pool vehicle validation differs. No change applied.';
  end if;
  execute replace(definition,old_choices,new_choices);
end $publisher$;
revoke all on function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text,bigint[],text) from public,anon,authenticated;
grant execute on function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text,bigint[],text) to service_role;
notify pgrst, 'reload schema';
commit;
