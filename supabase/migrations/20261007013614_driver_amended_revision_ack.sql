-- Extend existing writers only. No backfill, new table, public grant or Calendar write.
begin;
do $migration$
declare
  definition text;
  before_text text;
  after_text text;
begin
  definition:=pg_get_functiondef('public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb)'::regprocedure);
  before_text:=$old$'job_card_revision',p_revision,'job_card_kind','amendment')$old$;
  after_text:=$new$'job_card_revision',p_revision,'job_card_kind','amendment',
          'driver_ack_required_revision',p_revision,
          'driver_amendment_issued_at',v_now,
          'driver_amendment_ack_pending',nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null)$new$;
  if length(definition)-length(replace(definition,before_text,''))<>length(before_text) then
    raise exception 'Driver link amendment writer changed; inspect before applying';
  end if;
  execute replace(definition,before_text,after_text);

  -- All members share the reviewed package revision; an amended secondary trip must
  -- return the single primary queue row and require review of the complete package.
  definition:=pg_get_functiondef('public.apply_admin_driver_job_combo_links(uuid,uuid,jsonb,text,text)'::regprocedure);
  before_text:=$old$  return jsonb_build_object('links',results,'combo_id',g.id,'combo_revision',g.revision,'batch',batch);$old$;
  after_text:=$new$  if exists(select 1 from jsonb_array_elements(results) x where x->>'disposition' in ('created','amended')) then
    update public.driver_job_links target set safe_link_context=(target.safe_link_context-'ack_alert_closed_at'-'ack_alert_closed_revision')||jsonb_build_object(
      'driver_ack_required_revision',package.revision,
      'driver_amendment_issued_at',clock_timestamp(),
      'driver_amendment_ack_pending',nullif(target.safe_link_context->>'driver_acknowledged_at','') is not null)
    from (select encode(sha256(convert_to(string_agg((x->'link'->>'id')||':'||
      (x->'link'->'safe_link_context'->>'job_card_revision'),',' order by x->'link'->>'booking_reference'),'UTF8')),'hex') revision
      from jsonb_array_elements(results) x) package
    where target.id in (select (x->'link'->>'id')::uuid from jsonb_array_elements(results) x);
    select jsonb_agg(jsonb_set(x,'{link}',to_jsonb(target)) order by n) into results
      from jsonb_array_elements(results) with ordinality entry(x,n)
      join public.driver_job_links target on target.id=(x->'link'->>'id')::uuid;
  end if;
  return jsonb_build_object('links',results,'combo_id',g.id,'combo_revision',g.revision,'batch',batch);$new$;
  if length(definition)-length(replace(definition,before_text,''))<>length(before_text) then
    raise exception 'Combo link writer changed; inspect before applying';
  end if;
  execute replace(definition,before_text,after_text);

  definition:=pg_get_functiondef('public.reserve_driver_job_link_delivery(text,uuid,bigint,text,text,uuid,text,text)'::regprocedure);
  before_text:=$old$nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null$old$;
  if length(definition)-length(replace(definition,before_text,''))<>2*length(before_text) then
    raise exception 'Driver reminder reservation changed; inspect before applying';
  end if;
  execute replace(definition,before_text,before_text||$new$ and coalesce(l.safe_link_context->>'driver_amendment_ack_pending','false')<>'true'$new$);

  definition:=pg_get_functiondef('public.acknowledge_current_driver_job_link(text,uuid,text,bigint,text,text,text,text)'::regprocedure);
  before_text:=$old$  current_payload := l.safe_link_context->'driver_job_payload';$old$;
  after_text:=$new$  if (p_expected_revision is not null and p_expected_revision is distinct from
      coalesce(l.safe_link_context->>'driver_ack_required_revision',l.safe_link_context->>'job_card_revision'))
    or (coalesce(l.safe_link_context->>'driver_amendment_ack_pending','false')='true' and p_expected_revision is null) then
    raise exception 'The job changed. Reload and review the latest amendment.' using errcode='P0002';
  end if;
  current_payload := l.safe_link_context->'driver_job_payload';$new$;
  if position('p_vehicle text)' in definition)=0 or position(before_text in definition)=0
    or position('    return to_jsonb(l);' in definition)=0 then
    raise exception 'Driver ACK writer changed; inspect before applying';
  end if;
  definition:=replace(definition,'p_vehicle text)','p_vehicle text, p_expected_revision text DEFAULT NULL::text)');
  definition:=replace(definition,before_text,after_text);
  definition:=replace(definition,'    return to_jsonb(l);',$new$    if coalesce(l.safe_link_context->>'driver_amendment_ack_pending','false')='true' then
      update public.driver_job_links set safe_link_context=l.safe_link_context||jsonb_build_object(
        'driver_amendment_ack_pending',false,'driver_acknowledged_revision',p_expected_revision,
        'driver_amendment_acknowledged_at',ack_at) where id=l.id returning * into l;
    end if;
    return to_jsonb(l);$new$);
  definition:=replace(definition,$old$'driver_acknowledged_at',ack_at,'driver_job_payload'$old$,
    $new$'driver_acknowledged_at',ack_at,'driver_acknowledged_revision',coalesce(l.safe_link_context->>'driver_ack_required_revision',l.safe_link_context->>'job_card_revision'),
      'driver_amendment_ack_pending',false,'driver_job_payload'$new$);
  -- Replace the signature rather than exposing an ambiguous PostgREST overload.
  drop function public.acknowledge_current_driver_job_link(text,uuid,text,bigint,text,text,text,text);
  execute definition;
  revoke all on function public.acknowledge_current_driver_job_link(text,uuid,text,bigint,text,text,text,text,text) from public,anon,authenticated;
  grant execute on function public.acknowledge_current_driver_job_link(text,uuid,text,bigint,text,text,text,text,text) to service_role;

  definition:=pg_get_functiondef('public.acknowledge_current_driver_job_combo(text,uuid,text,bigint,text,text,text,text)'::regprocedure);
  before_text:='ref,l.id,l.token_hash,p_driver_id,p_name,p_contact,p_plate,p_vehicle)';
  if position('p_vehicle text)' in definition)=0 or position(before_text in definition)=0 then
    raise exception 'Combo ACK writer changed; inspect before applying';
  end if;
  definition:=replace(definition,'p_vehicle text)','p_vehicle text, p_expected_revision text DEFAULT NULL::text)');
  definition:=replace(definition,before_text,'ref,l.id,l.token_hash,p_driver_id,p_name,p_contact,p_plate,p_vehicle,p_expected_revision)');
  drop function public.acknowledge_current_driver_job_combo(text,uuid,text,bigint,text,text,text,text);
  execute definition;
  revoke all on function public.acknowledge_current_driver_job_combo(text,uuid,text,bigint,text,text,text,text,text) from public,anon,authenticated;
  grant execute on function public.acknowledge_current_driver_job_combo(text,uuid,text,bigint,text,text,text,text,text) to service_role;
end;
$migration$;
commit;
