-- Keep the existing DSP actual-time summary on its established server-only
-- consumer while making the view obey the invoking role's RLS boundary.
alter view public.driver_job_dsp_actual_time_summaries
  set (security_invoker = true);

revoke all privileges on table public.driver_job_dsp_actual_time_summaries
  from public, anon, authenticated;
grant select on table public.driver_job_dsp_actual_time_summaries
  to service_role;

-- Keep the existing privileged invoice-number reservation RPC callable only
-- by the established server-side service-role client.
revoke all privileges on function public.reserve_monthly_invoice_number_for_issue_record(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.reserve_monthly_invoice_number_for_issue_record(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;
