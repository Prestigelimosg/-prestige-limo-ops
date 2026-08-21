-- Durable server-only attempt protection for the existing Admin account
-- sign-in route. This table stores no PIN, password, token, cookie, email,
-- customer, driver, booking, invoice, payment, GPS, or provider content.

set search_path = public, extensions;

create table if not exists public.admin_auth_pin_attempts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempt_count integer not null default 1,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_auth_pin_attempts_count_check check (
    failed_attempt_count between 1 and 5
  )
);

create index if not exists admin_auth_pin_attempts_locked_until_idx
  on public.admin_auth_pin_attempts (locked_until)
  where locked_until is not null;

comment on table public.admin_auth_pin_attempts is
  'Server-only bounded Admin PIN attempt state. It stores only the verified Auth user UUID, a bounded attempt count, and timestamps; never a PIN, password, token, cookie, email, or operational record.';

alter table public.admin_auth_pin_attempts enable row level security;

revoke all on table public.admin_auth_pin_attempts from public, anon, authenticated, service_role;

create or replace function public.reserve_admin_auth_pin_attempt(
  p_auth_user_id uuid
)
returns table (
  attempt_allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt public.admin_auth_pin_attempts%rowtype;
  v_next_count integer;
begin
  if p_auth_user_id is null then
    return query select false, 900;
    return;
  end if;

  insert into public.admin_auth_pin_attempts (
    auth_user_id,
    failed_attempt_count,
    window_started_at,
    locked_until,
    last_attempt_at,
    created_at,
    updated_at
  )
  values (p_auth_user_id, 1, v_now, null, v_now, v_now, v_now)
  on conflict (auth_user_id) do nothing;

  select *
  into strict v_attempt
  from public.admin_auth_pin_attempts
  where auth_user_id = p_auth_user_id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    return query select
      false,
      greatest(1, ceil(extract(epoch from (v_attempt.locked_until - v_now)))::integer);
    return;
  end if;

  if v_attempt.window_started_at <= v_now - interval '15 minutes' then
    update public.admin_auth_pin_attempts
    set failed_attempt_count = 1,
        window_started_at = v_now,
        locked_until = null,
        last_attempt_at = v_now,
        updated_at = v_now
    where auth_user_id = p_auth_user_id;

    return query select true, 0;
    return;
  end if;

  if v_attempt.last_attempt_at = v_now then
    return query select true, 0;
    return;
  end if;

  v_next_count := least(5, v_attempt.failed_attempt_count + 1);
  update public.admin_auth_pin_attempts
  set failed_attempt_count = v_next_count,
      locked_until = case
        when v_next_count >= 5 then v_now + interval '15 minutes'
        else null
      end,
      last_attempt_at = v_now,
      updated_at = v_now
  where auth_user_id = p_auth_user_id;

  return query select true, 0;
end;
$$;

create or replace function public.clear_admin_auth_pin_attempt(
  p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  if p_auth_user_id is null then
    return false;
  end if;

  delete from public.admin_auth_pin_attempts
  where auth_user_id = p_auth_user_id;
  get diagnostics v_deleted = row_count;

  return v_deleted = 1;
end;
$$;

revoke all on function public.reserve_admin_auth_pin_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_admin_auth_pin_attempt(uuid)
  to service_role;

revoke all on function public.clear_admin_auth_pin_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.clear_admin_auth_pin_attempt(uuid)
  to service_role;
