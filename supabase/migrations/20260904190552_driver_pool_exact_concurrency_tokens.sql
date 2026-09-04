-- Driver Pool concurrency repair only.
-- Preserve each existing function body and privilege boundary while changing
-- business-stale exceptions away from SQLSTATE 40001. Supabase JS retries
-- PostgREST POST/409 responses by default, so 40001 can repeat an RPC that is
-- intentionally guarded by an exact timestamp and idempotency key.

set search_path = public, extensions;

do $migration$
declare
  v_target record;
  v_function_definition text;
  v_serialization_code_count integer;
begin
  for v_target in
    select * from (values
      (
        'public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text)',
        'Saved booking changed. Reload before publishing.'
      ),
      (
        'public.cancel_driver_pool_offer(text,timestamptz,text,text)',
        'Driver Pool offer changed. Reload before cancelling.'
      ),
      (
        'public.accept_driver_pool_offer(text,bigint,timestamptz,text)',
        'Saved booking changed during Driver Pool acceptance.'
      )
    ) as target(function_signature, expected_message)
  loop
    select pg_get_functiondef(to_regprocedure(v_target.function_signature))
    into v_function_definition;

    if v_function_definition is null then
      raise exception 'Required Driver Pool function is missing: %', v_target.function_signature;
    end if;

    if position(v_target.expected_message in v_function_definition) = 0 then
      raise exception 'Driver Pool function body changed before concurrency repair: %', v_target.function_signature;
    end if;

    if position('SECURITY INVOKER' in upper(v_function_definition)) = 0 then
      raise exception 'Driver Pool function is not SECURITY INVOKER: %', v_target.function_signature;
    end if;

    v_serialization_code_count :=
      (length(v_function_definition) - length(replace(v_function_definition, '40001', ''))) / length('40001');

    if v_serialization_code_count <> 1 then
      raise exception 'Unexpected Driver Pool serialization-code count for %: %',
        v_target.function_signature,
        v_serialization_code_count;
    end if;

    execute replace(v_function_definition, '40001', 'P0001');
  end loop;
end;
$migration$;

revoke all on function public.publish_driver_pool_offer(text, timestamptz, numeric, text, text, text)
from public, anon, authenticated;
revoke all on function public.cancel_driver_pool_offer(text, timestamptz, text, text)
from public, anon, authenticated;
revoke all on function public.accept_driver_pool_offer(text, bigint, timestamptz, text)
from public, anon, authenticated;

grant execute on function public.publish_driver_pool_offer(text, timestamptz, numeric, text, text, text)
to service_role;
grant execute on function public.cancel_driver_pool_offer(text, timestamptz, text, text)
to service_role;
grant execute on function public.accept_driver_pool_offer(text, bigint, timestamptz, text)
to service_role;

comment on function public.publish_driver_pool_offer(text, timestamptz, numeric, text, text, text) is
  'Publishes one exact Driver Pool offer. Business-stale conflicts are non-retryable at the Data API boundary; the application retains its explicit 409 reload response.';
comment on function public.cancel_driver_pool_offer(text, timestamptz, text, text) is
  'Cancels one exact open Driver Pool offer without cancelling the booking. Business-stale conflicts are non-retryable at the Data API boundary.';
comment on function public.accept_driver_pool_offer(text, bigint, timestamptz, text) is
  'Atomically accepts one exact Driver Pool offer and assigns its fixed payout. Business-stale conflicts are non-retryable at the Data API boundary.';
