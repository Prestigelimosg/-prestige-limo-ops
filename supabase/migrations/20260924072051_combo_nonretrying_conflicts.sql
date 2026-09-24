-- Business conflicts are HTTP 409, not PostgreSQL serialization failures.
-- PostgREST 14 retries 40001 indefinitely. Preserve every condition and write.
-- Exact preflight fingerprints prevent overwriting a changed Production function.
do $repair$
declare
  target record;
  function_oid oid;
  definition text;
  body text;
begin
  for target in select * from (values
    ('public.apply_admin_driver_job_combo_links(uuid,uuid,jsonb,text,text)', 'd397021b6c5653ca6a3678ecef0aba9e', 2),
    ('public.assign_admin_driver_job_combo(uuid,uuid,bigint,numeric,text,text)', '4107d6c678a264f27892302691dd89f0', 3),
    ('public.define_driver_job_combo(text,jsonb,uuid,text,text)', '30a6e5f2251a39762ba585d452ff4606', 6),
    ('public.guard_driver_job_combo_child_write()', '1c8f0cf1be97b6402586373aa7e204ee', 1),
    ('public.guard_driver_job_combo_member_write()', 'edf2e25025a625104cd53e8720b5cf5d', 4),
    ('public.lock_driver_job_combo(uuid,uuid)', 'f2f9096ffa96acbae02582afcc43bcaf', 5),
    ('public.publish_driver_job_combo(uuid,uuid,timestamp with time zone,numeric,text,text,text,text,bigint[],text)', '04481b7e56271549f352e7a7387a1a59', 2),
    ('public.reassign_admin_driver_job_combo(uuid,uuid,text,timestamp with time zone,bigint,numeric,text,text)', '5a05782aa274fbd63f5b0afbe345f9d7', 4)
  ) as targets(signature, expected_md5, expected_count)
  loop
    function_oid := to_regprocedure(target.signature);
    select prosrc, pg_get_functiondef(oid) into body, definition
      from pg_proc where oid=function_oid;
    if function_oid is null or md5(body) is distinct from target.expected_md5
      or (length(body)-length(replace(body, 'errcode=''40001''', '')))/length('errcode=''40001''') <> target.expected_count then
      raise exception 'Combo conflict repair: definition changed for %', target.signature;
    end if;
    execute replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
  end loop;
end;
$repair$;
