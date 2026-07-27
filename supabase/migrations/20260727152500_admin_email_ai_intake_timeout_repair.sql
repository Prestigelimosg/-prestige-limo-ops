-- Narrow repair for the existing private semantic email AI Cron request.
-- The first live new-message test proved that the original 30-second pg_net
-- request expired while the protected route was still processing. Preserve
-- the same job, schedule, endpoint, Vault values, and privacy boundary while
-- allowing the bounded IMAP plus OpenAI review to finish.

set search_path = public, extensions;

select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'private-email-ai-intake'
  ),
  command := $cron$
    select net.http_get(
      url := intake_config.endpoint_url,
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || intake_config.bearer_secret,
        'User-Agent',
        'Prestige-Limo-Ops-Supabase-Cron'
      ),
      timeout_milliseconds := 120000
    )
    from (
      select
        max(decrypted_secret) filter (
          where name = 'prestige_email_ai_intake_endpoint'
        ) as endpoint_url,
        max(decrypted_secret) filter (
          where name = 'prestige_email_ai_intake_cron_secret'
        ) as bearer_secret
      from vault.decrypted_secrets
      where name in (
        'prestige_email_ai_intake_endpoint',
        'prestige_email_ai_intake_cron_secret'
      )
    ) as intake_config
    where intake_config.endpoint_url =
      'https://app.prestigelimo.sg/api/cron/admin-email-ai-intake'
      and length(intake_config.bearer_secret) >= 32;
  $cron$
);
