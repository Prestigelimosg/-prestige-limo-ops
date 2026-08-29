begin;

set local lock_timeout = '5s';

alter table public.bookers
  add column if not exists customer_id bigint;

create unique index if not exists bookers_customer_id_unique_idx
  on public.bookers (customer_id)
  where customer_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookers_customer_id_fkey'
      and conrelid = 'public.bookers'::regclass
  ) then
    alter table public.bookers
      add constraint bookers_customer_id_fkey
      foreign key (customer_id)
      references public.customers (id)
      on update restrict
      on delete restrict
      not valid;
  end if;
end
$$;

alter table public.bookers
  validate constraint bookers_customer_id_fkey;

commit;
