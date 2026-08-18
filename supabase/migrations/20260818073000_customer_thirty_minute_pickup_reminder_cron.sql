-- Prepared protected Customer pickup-reminder schedule. Applying this file and
-- creating its two Vault values remain separate owner-approved Production actions.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'customer-thirty-minute-pickup-reminders',
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
          where name = 'prestige_customer_pickup_reminder_endpoint'
        ) as endpoint_url,
        max(decrypted_secret) filter (
          where name = 'prestige_customer_pickup_reminder_cron_secret'
        ) as bearer_secret
      from vault.decrypted_secrets
      where name in (
        'prestige_customer_pickup_reminder_endpoint',
        'prestige_customer_pickup_reminder_cron_secret'
      )
    ) as reminder_config
    where reminder_config.endpoint_url =
      'https://app.prestigelimo.sg/api/cron/customer-thirty-minute-pickup-reminders'
      and length(reminder_config.bearer_secret) >= 32;
  $cron$
);
