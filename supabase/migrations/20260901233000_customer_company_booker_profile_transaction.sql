-- One guarded transaction for the established Admin customer-profile save lane.
-- This does not convert any existing Customer. It preserves every existing ID and
-- changes only the exact Customer, Company and Booker selected by Admin.

set search_path = public, extensions;

create or replace function public.apply_admin_customer_company_booker_profile(
  p_customer_id bigint,
  p_expected_customer_display_name text,
  p_customer_display_name text,
  p_company_id bigint,
  p_expected_company_profile jsonb,
  p_company_profile jsonb,
  p_booker_id bigint,
  p_expected_booker_customer_id bigint,
  p_expected_booker_profile jsonb,
  p_booker_profile jsonb,
  p_actor_label text,
  p_actor_role text
)
returns table (
  customer_id bigint,
  customer_display_name text,
  company_id bigint,
  company_name text,
  booker_id bigint,
  booker_name text,
  booker_email text,
  booker_phone text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers%rowtype;
  v_company public.companies%rowtype;
  v_booker public.bookers%rowtype;
  v_linked_booker_id bigint;
  v_linked_booker_count bigint;
  v_before jsonb;
  v_after jsonb;
begin
  if p_customer_id is null or p_customer_id <= 0
     or nullif(btrim(p_expected_customer_display_name), '') is null
     or nullif(btrim(p_customer_display_name), '') is null
     or char_length(btrim(p_customer_display_name)) > 120
     or not (coalesce(p_company_profile, '{}'::jsonb) ? 'company_name')
     or nullif(btrim(p_company_profile->>'company_name'), '') is null
     or not (coalesce(p_booker_profile, '{}'::jsonb) ? 'booker_name')
     or nullif(btrim(p_booker_profile->>'booker_name'), '') is null
     or p_actor_role not in ('admin', 'dispatcher')
     or nullif(btrim(p_actor_label), '') is null then
    raise exception using errcode = '22023', message = 'customer_company_booker_profile_invalid';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
    and lower(coalesce(status, 'active')) = 'active'
    and lower(coalesce(account_status, 'active')) = 'active'
  for update;

  if not found or v_customer.display_name is distinct from p_expected_customer_display_name then
    raise exception using errcode = '40001', message = 'customer_company_booker_profile_stale';
  end if;

  select min(b.id), count(*) into v_linked_booker_id, v_linked_booker_count
  from public.bookers b
  where b.customer_id = p_customer_id;

  if v_linked_booker_count > 1 then
    raise exception using errcode = '23505', message = 'customer_company_booker_profile_conflict';
  end if;

  if p_company_id is null then
    if p_expected_company_profile is not null then
      raise exception using errcode = '22023', message = 'customer_company_booker_profile_invalid';
    end if;

    insert into public.companies (
      company_name,
      domain,
      billing_address,
      main_phone,
      mobile_phone,
      website,
      primary_contact_name,
      billing_email,
      accounts_email,
      operations_email,
      updated_at
    ) values (
      btrim(p_company_profile->>'company_name'),
      nullif(btrim(p_company_profile->>'domain'), ''),
      nullif(btrim(p_company_profile->>'billing_address'), ''),
      nullif(btrim(p_company_profile->>'main_phone'), ''),
      nullif(btrim(p_company_profile->>'mobile_phone'), ''),
      nullif(btrim(p_company_profile->>'website'), ''),
      nullif(btrim(p_company_profile->>'primary_contact_name'), ''),
      nullif(lower(btrim(p_company_profile->>'billing_email')), ''),
      nullif(lower(btrim(p_company_profile->>'accounts_email')), ''),
      nullif(lower(btrim(p_company_profile->>'operations_email')), ''),
      now()
    ) returning * into v_company;
  else
    select * into v_company
    from public.companies
    where id = p_company_id
    for update;

    if not found or jsonb_build_object(
      'accounts_email', v_company.accounts_email,
      'billing_address', v_company.billing_address,
      'billing_email', v_company.billing_email,
      'company_name', v_company.company_name,
      'domain', v_company.domain,
      'main_phone', v_company.main_phone,
      'mobile_phone', v_company.mobile_phone,
      'operations_email', v_company.operations_email,
      'primary_contact_name', v_company.primary_contact_name,
      'website', v_company.website
    ) is distinct from p_expected_company_profile then
      raise exception using errcode = '40001', message = 'customer_company_booker_profile_stale';
    end if;

    update public.companies set
      company_name = btrim(p_company_profile->>'company_name'),
      domain = nullif(btrim(p_company_profile->>'domain'), ''),
      billing_address = nullif(btrim(p_company_profile->>'billing_address'), ''),
      main_phone = nullif(btrim(p_company_profile->>'main_phone'), ''),
      mobile_phone = nullif(btrim(p_company_profile->>'mobile_phone'), ''),
      website = nullif(btrim(p_company_profile->>'website'), ''),
      primary_contact_name = nullif(btrim(p_company_profile->>'primary_contact_name'), ''),
      billing_email = nullif(lower(btrim(p_company_profile->>'billing_email')), ''),
      accounts_email = nullif(lower(btrim(p_company_profile->>'accounts_email')), ''),
      operations_email = nullif(lower(btrim(p_company_profile->>'operations_email')), ''),
      updated_at = now()
    where id = p_company_id
    returning * into v_company;
  end if;

  if p_booker_id is null then
    if p_expected_booker_profile is not null or v_linked_booker_id is not null then
      raise exception using errcode = '23505', message = 'customer_company_booker_profile_conflict';
    end if;

    insert into public.bookers (
      company_id,
      customer_id,
      booker_name,
      email,
      phone,
      updated_at
    ) values (
      v_company.id,
      p_customer_id,
      btrim(p_booker_profile->>'booker_name'),
      nullif(lower(btrim(p_booker_profile->>'email')), ''),
      nullif(btrim(p_booker_profile->>'phone'), ''),
      now()
    ) returning * into v_booker;
  else
    select * into v_booker
    from public.bookers
    where id = p_booker_id
    for update;

    if not found
       or v_booker.company_id is distinct from v_company.id
       or v_booker.customer_id is distinct from p_expected_booker_customer_id
       or (v_booker.customer_id is not null and v_booker.customer_id is distinct from p_customer_id)
       or (v_linked_booker_id is not null and v_linked_booker_id is distinct from p_booker_id)
       or jsonb_build_object(
         'booker_name', v_booker.booker_name,
         'email', v_booker.email,
         'phone', v_booker.phone
       ) is distinct from p_expected_booker_profile then
      raise exception using errcode = '40001', message = 'customer_company_booker_profile_stale';
    end if;

    update public.bookers set
      customer_id = p_customer_id,
      booker_name = btrim(p_booker_profile->>'booker_name'),
      email = nullif(lower(btrim(p_booker_profile->>'email')), ''),
      phone = nullif(btrim(p_booker_profile->>'phone'), ''),
      updated_at = now()
    where id = p_booker_id
      and company_id = v_company.id
      and (customer_id is null or customer_id = p_customer_id)
    returning * into v_booker;

    if not found then
      raise exception using errcode = '40001', message = 'customer_company_booker_profile_stale';
    end if;
  end if;

  v_before := jsonb_build_object(
    'customer_id', v_customer.id,
    'customer_display_name', v_customer.display_name,
    'customer_type', v_customer.customer_type,
    'company_id', p_company_id,
    'company_profile', p_expected_company_profile,
    'booker_id', p_booker_id,
    'booker_customer_id', p_expected_booker_customer_id,
    'booker_profile', p_expected_booker_profile
  );

  update public.customers set
    display_name = btrim(p_customer_display_name),
    customer_type = null,
    updated_at = now()
  where id = p_customer_id;

  v_after := jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_display_name', btrim(p_customer_display_name),
    'customer_type', null,
    'company_id', v_company.id,
    'company_profile', jsonb_build_object(
      'accounts_email', v_company.accounts_email,
      'billing_address', v_company.billing_address,
      'billing_email', v_company.billing_email,
      'company_name', v_company.company_name,
      'domain', v_company.domain,
      'main_phone', v_company.main_phone,
      'mobile_phone', v_company.mobile_phone,
      'operations_email', v_company.operations_email,
      'primary_contact_name', v_company.primary_contact_name,
      'website', v_company.website
    ),
    'booker_id', v_booker.id,
    'booker_customer_id', v_booker.customer_id,
    'booker_profile', jsonb_build_object(
      'booker_name', v_booker.booker_name,
      'email', v_booker.email,
      'phone', v_booker.phone
    )
  );

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    source_route,
    actor_label,
    customer_id,
    actor_role,
    action_type,
    source_surface,
    safe_before,
    safe_after
  ) values (
    'customer',
    p_customer_id,
    'customer_company_booker_profile_overwrite',
    '/api/admin-customer-accounts',
    btrim(p_actor_label),
    p_customer_id,
    p_actor_role,
    'customer_company_booker_profile_overwrite',
    'admin_api',
    v_before,
    v_after
  );

  return query select
    p_customer_id,
    btrim(p_customer_display_name),
    v_company.id,
    v_company.company_name,
    v_booker.id,
    v_booker.booker_name,
    v_booker.email,
    v_booker.phone;
end;
$$;

comment on function public.apply_admin_customer_company_booker_profile(
  bigint, text, text, bigint, jsonb, jsonb, bigint, bigint, jsonb, jsonb, text, text
) is
  'Server-only exact Admin Customer + Company + Booker profile transaction. Traveller and all operational consumers remain untouched.';

revoke all on function public.apply_admin_customer_company_booker_profile(
  bigint, text, text, bigint, jsonb, jsonb, bigint, bigint, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.apply_admin_customer_company_booker_profile(
  bigint, text, text, bigint, jsonb, jsonb, bigint, bigint, jsonb, jsonb, text, text
) to service_role;

-- Existing browser roles have no RLS policies on these tables. Revoke mutation
-- grants as a second fail-closed boundary; the verified server service role is
-- the only writer used by the established Admin routes.
revoke insert, update, delete on table public.customers from anon, authenticated;
revoke insert, update, delete on table public.companies from anon, authenticated;
revoke insert, update, delete on table public.bookers from anon, authenticated;
revoke insert, update, delete on table public.travelers from anon, authenticated;

alter table public.bookers
  alter column company_id set not null,
  alter column booker_name set not null;

alter table public.bookers
  drop constraint if exists bookers_booker_name_not_blank,
  add constraint bookers_booker_name_not_blank check (length(btrim(booker_name)) > 0);
