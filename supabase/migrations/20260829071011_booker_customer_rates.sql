begin;

set local lock_timeout = '5s';

alter table public.bookers
  add column if not exists customer_rates jsonb not null default '{}'::jsonb;

commit;
