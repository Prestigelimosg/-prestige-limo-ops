create table if not exists public.rate_settings (
  id text primary key default 'default',
  customer_rates jsonb not null default '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  driver_payout_rules jsonb not null default '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb,
  midnight_surcharge numeric not null default 15,
  extra_stop_surcharge numeric not null default 0,
  midnight_payout numeric not null default 10,
  extra_stop_payout numeric not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.rate_settings (
  id,
  customer_rates,
  driver_payout_rules,
  midnight_surcharge,
  extra_stop_surcharge,
  midnight_payout,
  extra_stop_payout
)
values (
  'default',
  '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb,
  15,
  0,
  10,
  10
)
on conflict (id) do nothing;
