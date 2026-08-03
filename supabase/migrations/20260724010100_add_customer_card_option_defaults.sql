alter table public.companies
  add column if not exists card_option_default_enabled boolean not null default false;

alter table public.travelers
  add column if not exists card_option_default_enabled boolean default null;

comment on column public.companies.card_option_default_enabled is
  'Admin invoice-preparation default only. Adds existing card-availability wording; it does not create a card charge or payment link.';

comment on column public.travelers.card_option_default_enabled is
  'Nullable traveller override for the existing invoice card-option default. Null inherits the verified company setting.';
