-- Extend the existing private Email AI intake by one exact sender while
-- preserving the single booking@prestigelimo.sg mailbox and service-role-only
-- persistence boundary. Mail-provider routing into that mailbox is separate.

alter table public.admin_email_ai_intake
  drop constraint if exists admin_email_ai_intake_exact_sender_check;

alter table public.admin_email_ai_intake
  add constraint admin_email_ai_intake_exact_sender_check check (
    sender_address in (
      'info@prestigelimo.sg',
      'transzend@groundbooker.com'
    )
  );

comment on table public.admin_email_ai_intake is
  'Private service-role-only semantic review of new email received by booking@prestigelimo.sg from exact approved Prestige or GroundBooker senders.';
