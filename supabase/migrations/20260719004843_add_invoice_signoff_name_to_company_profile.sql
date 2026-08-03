alter table if exists public.company_profile_settings
  add column if not exists invoice_signoff_name text not null default 'Finance Team';

alter table if exists public.company_profile_settings
  drop constraint if exists company_profile_settings_invoice_signoff_name_length_check;

alter table if exists public.company_profile_settings
  add constraint company_profile_settings_invoice_signoff_name_length_check
  check (
    char_length(invoice_signoff_name) >= 1
    and char_length(invoice_signoff_name) <= 120
  );
