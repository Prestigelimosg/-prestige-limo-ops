-- Runs the established protected Driver pickup-reminder route once per minute.
-- The endpoint and bearer value are stored only in Supabase Vault and are
-- intentionally absent from migration history and cron.job command text.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'driver-one-hour-pickup-reminders',
  '* * * * *',
  $cron$
    select net.http_get(
      url := reminder_config.endpoint_url,
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || reminder_config.bearer_secret,
        'User-Agent',
        'Prestige-Limo-Ops-Supabase-Cron'
      ),
      timeout_milliseconds := 10000
    )
    from (
      select
        max(decrypted_secret) filter (
          where name = 'prestige_driver_pickup_reminder_endpoint'
        ) as endpoint_url,
        max(decrypted_secret) filter (
          where name = 'prestige_driver_pickup_reminder_cron_secret'
        ) as bearer_secret
      from vault.decrypted_secrets
      where name in (
        'prestige_driver_pickup_reminder_endpoint',
        'prestige_driver_pickup_reminder_cron_secret'
      )
    ) as reminder_config
    where reminder_config.endpoint_url =
      'https://app.prestigelimo.sg/api/cron/driver-one-hour-pickup-reminders'
      and length(reminder_config.bearer_secret) >= 32;
  $cron$
);
