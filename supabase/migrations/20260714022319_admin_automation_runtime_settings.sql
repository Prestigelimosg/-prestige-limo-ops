set search_path = public, extensions;

create table if not exists public.admin_automation_runtime_settings (
  setting_name text primary key,
  setting_status text not null default 'closed',
  automation_enabled boolean not null default false,
  updated_by_role text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_automation_runtime_setting_singleton check (
    setting_name = 'admin_automation_runtime'
  ),
  constraint admin_automation_runtime_setting_status_check check (
    setting_status in ('closed', 'active')
  ),
  constraint admin_automation_runtime_setting_state_check check (
    (setting_status = 'active' and automation_enabled)
    or (setting_status = 'closed' and not automation_enabled)
  ),
  constraint admin_automation_runtime_updated_by_role_check check (
    updated_by_role in ('system', 'admin', 'dispatcher', 'local-dev-admin')
  )
);

comment on table public.admin_automation_runtime_settings is
  'Singleton service-side control for bounded admin automation.';

alter table public.admin_automation_runtime_settings enable row level security;

revoke all on table public.admin_automation_runtime_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_automation_runtime_settings to service_role;

insert into public.admin_automation_runtime_settings (
  setting_name,
  setting_status,
  automation_enabled,
  updated_by_role
)
values ('admin_automation_runtime', 'closed', false, 'system')
on conflict (setting_name) do nothing;
