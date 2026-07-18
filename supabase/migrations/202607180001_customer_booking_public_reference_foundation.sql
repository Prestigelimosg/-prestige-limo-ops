-- Customer-safe booking reference foundation.
-- The established bookings.booking_reference remains the immutable internal
-- workflow key. This migration adds a separate public locator only; it does
-- not change invoice numbers, billing identity, calendar UIDs, driver tokens,
-- live-location scope, messaging scope, or any existing booking relationship.

set search_path = public, extensions;

alter table public.bookings
  add column if not exists public_booking_reference text;

create table if not exists public.customer_booking_reference_sequences (
  customer_account text primary key,
  booking_prefix text not null,
  next_sequence_number integer not null default 1,
  sequence_status text not null default 'active',
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_booking_reference_sequences_account_not_blank check (
    length(btrim(customer_account)) > 0 and length(customer_account) <= 160
  ),
  constraint customer_booking_reference_sequences_prefix_format check (
    booking_prefix ~ '^[A-Z0-9]{2,12}$'
  ),
  constraint customer_booking_reference_sequences_next_range check (
    next_sequence_number between 1 and 100000
  ),
  constraint customer_booking_reference_sequences_status_check check (
    sequence_status in ('active', 'on_hold', 'archived')
  ),
  constraint customer_booking_reference_sequences_source_check check (
    source_surface in ('admin_api', 'migration', 'system')
  ),
  constraint customer_booking_reference_sequences_actor_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  )
);

create unique index if not exists customer_booking_reference_sequences_prefix_key
  on public.customer_booking_reference_sequences (booking_prefix);

create table if not exists public.global_booking_reference_sequence (
  singleton boolean primary key default true,
  next_sequence_number integer not null default 10826,
  updated_at timestamptz not null default now(),
  constraint global_booking_reference_sequence_singleton check (singleton),
  constraint global_booking_reference_sequence_next_range check (
    next_sequence_number between 1 and 100000
  )
);

insert into public.global_booking_reference_sequence (
  singleton,
  next_sequence_number
)
values (true, 10826)
on conflict (singleton) do nothing;

-- Existing bookings receive stable five-digit public references in a single
-- deterministic pass. The migration refuses to wrap or reuse a number.
do $$
declare
  v_existing_count integer;
  v_next integer;
begin
  select count(*)::integer
    into v_existing_count
    from public.bookings
   where public_booking_reference is null;

  select next_sequence_number
    into v_next
    from public.global_booking_reference_sequence
   where singleton = true
   for update;

  if v_existing_count > 0 and v_next + v_existing_count - 1 > 99999 then
    raise exception 'booking_public_reference_exhausted';
  end if;

  with numbered as (
    select
      id,
      row_number() over (
        order by created_at nulls last, booking_reference nulls last, id::text
      )::integer as sequence_offset
    from public.bookings
    where public_booking_reference is null
  )
  update public.bookings as booking
     set public_booking_reference = lpad((v_next + numbered.sequence_offset - 1)::text, 5, '0')
    from numbered
   where booking.id = numbered.id;

  update public.global_booking_reference_sequence
     set next_sequence_number = v_next + v_existing_count,
         updated_at = now()
   where singleton = true;
end;
$$;

alter table public.bookings
  alter column public_booking_reference set not null;

alter table public.bookings
  drop constraint if exists bookings_public_booking_reference_format;

alter table public.bookings
  add constraint bookings_public_booking_reference_format check (
    public_booking_reference ~ '^[0-9]{5}$'
    or public_booking_reference ~ '^[A-Z0-9]{2,12}-[0-9]{5}$'
  );

create unique index if not exists bookings_public_booking_reference_key
  on public.bookings (public_booking_reference);

create or replace function public.assign_booking_public_reference()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_customer_account text := nullif(btrim(new.customer_id::text), '');
  v_prefix text;
  v_sequence integer;
  v_sequence_status text;
begin
  if new.public_booking_reference is not null then
    raise exception 'public_booking_reference_is_server_assigned';
  end if;

  if v_customer_account is not null then
    select booking_prefix, next_sequence_number, sequence_status
      into v_prefix, v_sequence, v_sequence_status
      from public.customer_booking_reference_sequences
     where customer_account = v_customer_account
     for update;
  end if;

  if v_prefix is not null and v_sequence is not null then
    if v_sequence_status <> 'active' then
      raise exception 'booking_public_reference_prefix_unavailable';
    end if;

    if v_sequence > 99999 then
      raise exception 'booking_public_reference_exhausted';
    end if;

    update public.customer_booking_reference_sequences
       set next_sequence_number = v_sequence + 1,
           updated_at = now()
     where customer_account = v_customer_account;

    new.public_booking_reference := v_prefix || '-' || lpad(v_sequence::text, 5, '0');
    return new;
  end if;

  update public.global_booking_reference_sequence
     set next_sequence_number = next_sequence_number + 1,
         updated_at = now()
   where singleton = true
     and next_sequence_number <= 99999
   returning next_sequence_number - 1 into v_sequence;

  if v_sequence is null then
    raise exception 'booking_public_reference_exhausted';
  end if;

  new.public_booking_reference := lpad(v_sequence::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists bookings_assign_public_booking_reference on public.bookings;

create trigger bookings_assign_public_booking_reference
before insert on public.bookings
for each row
execute function public.assign_booking_public_reference();

comment on column public.bookings.public_booking_reference is
  'Customer-safe immutable booking locator. Internal workflow authorization and joins continue using bookings.booking_reference.';

comment on table public.customer_booking_reference_sequences is
  'Admin-only customer booking prefix and lifetime trip-number sequence. This is separate from invoice prefix and invoice numbering.';

comment on table public.global_booking_reference_sequence is
  'Server-only five-digit public booking sequence for customers without a locked booking prefix.';

alter table public.customer_booking_reference_sequences enable row level security;
alter table public.global_booking_reference_sequence enable row level security;

revoke all on table public.customer_booking_reference_sequences from anon, authenticated;
revoke all on table public.global_booking_reference_sequence from anon, authenticated;
revoke all on function public.assign_booking_public_reference() from public, anon, authenticated;

-- Current Supabase projects can disable automatic Data API grants. The
-- established server-only Supabase client needs only these explicit rights;
-- public customer and driver roles remain fully revoked.
grant select, insert, update on table public.customer_booking_reference_sequences to service_role;
grant select, update on table public.global_booking_reference_sequence to service_role;
grant execute on function public.assign_booking_public_reference() to service_role;
