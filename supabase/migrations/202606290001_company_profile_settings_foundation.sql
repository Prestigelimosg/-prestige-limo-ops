create table if not exists public.company_profile_settings (
  profile_key text primary key default 'default',
  logo_image_url text not null default '',
  company_name text not null default 'Prestige Limo SG',
  whatsapp_phone text not null default '+65 9655 0807',
  phone text not null default '+65 9655 0807',
  email text not null default '',
  address text not null default '',
  uen text not null default '',
  bank_payment_instructions text not null default '',
  stripe_card_payment_enabled boolean not null default false,
  stripe_card_fee_required boolean not null default false,
  stripe_card_fee_percent numeric(5, 2) not null default 10,
  invoice_footer_terms text not null default 'Thank you for choosing our service. Payment is due upon completion unless otherwise agreed in writing.',
  source_surface text not null default 'migration',
  actor_role text not null default 'system',
  actor_label text not null default 'migration',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_profile_settings_singleton_check check (profile_key = 'default'),
  constraint company_profile_settings_source_surface_check check (
    source_surface in ('admin_api', 'migration', 'system')
  ),
  constraint company_profile_settings_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint company_profile_settings_logo_image_url_length_check check (
    char_length(logo_image_url) <= 200000
  ),
  constraint company_profile_settings_public_text_length_check check (
    char_length(company_name) <= 120
    and char_length(whatsapp_phone) <= 80
    and char_length(phone) <= 80
    and char_length(email) <= 180
    and char_length(address) <= 500
    and char_length(uen) <= 80
    and char_length(bank_payment_instructions) <= 1000
    and char_length(invoice_footer_terms) <= 1400
  ),
  constraint company_profile_settings_card_fee_percent_check check (
    stripe_card_fee_percent >= 0 and stripe_card_fee_percent <= 25
  )
);

alter table public.company_profile_settings enable row level security;

revoke all on public.company_profile_settings from anon;
revoke all on public.company_profile_settings from authenticated;
grant select, insert, update, delete on public.company_profile_settings to service_role;

insert into public.company_profile_settings (profile_key)
values ('default')
on conflict (profile_key) do nothing;
